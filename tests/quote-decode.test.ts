import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote, type Quote } from "@/lib/au/quote";
import { QUOTE_A, QUOTE_B, QUOTE_C, QUOTE_C_REQUOTE } from "./fixtures/quotes";

const config = DEFAULT_CONFIG;
const find = (q: Quote, key: string) =>
  decodeQuote(q, config).findings.find((f) => f.key === key);

describe("Quote decoding", () => {
  it("annualises every pay cycle onto the same footing", () => {
    // The same $630 a year, published three different ways. A is monthly and
    // B is fortnightly in the real quotes; weekly is constructed here.
    expect(decodeQuote(QUOTE_A, config).annualLines.energy).toBeCloseTo(630, 0);
    expect(decodeQuote(QUOTE_B, config).annualLines.energy).toBeCloseTo(630, 0);
    const weekly: Quote = {
      ...QUOTE_A,
      frequency: "weekly",
      lines: { ...QUOTE_A.lines, energy: 630 / 52 },
    };
    expect(decodeQuote(weekly, config).annualLines.energy).toBeCloseTo(630, 0);
  });

  it("solves the same rate whichever cycle the quote is published in", () => {
    // The rate is a property of the lease, not of how the provider slices the
    // payment. Publishing weekly must not change the answer.
    const monthly = decodeQuote(QUOTE_A, config).impliedRatePct!;
    const asWeekly: Quote = {
      ...QUOTE_A,
      frequency: "weekly",
      lines: { ...QUOTE_A.lines, finance: (QUOTE_A.lines.finance! * 12) / 52 },
    };
    expect(decodeQuote(asWeekly, config).impliedRatePct!).toBeCloseTo(monthly, 6);
  });

  it("reads a weekly quote as weekly, not as something else", () => {
    // The trap this guards: mistaking a weekly figure for a fortnightly one
    // halves every annual total and makes a dear lease look cheap.
    const weekly: Quote = { ...QUOTE_A, frequency: "weekly" };
    const fortnightly: Quote = { ...QUOTE_A, frequency: "fortnightly" };
    const w = decodeQuote(weekly, config).annualPackageTotal;
    const f = decodeQuote(fortnightly, config).annualPackageTotal;
    expect(w / f).toBeCloseTo(2, 6);
  });

  it("reports the interest actually paid over the term", () => {
    const d = decodeQuote(QUOTE_A, config);
    // 60 payments plus the residual, less what was financed.
    expect(d.totalInterest!).toBeCloseTo(
      d.monthlyFinancePayment! * 60 + d.residualExGst! - d.amountFinanced!,
      2,
    );
    expect(d.totalInterest!).toBeGreaterThan(25_000);
  });

  it("prices the same lease at the benchmark rate for comparison", () => {
    const d = decodeQuote(QUOTE_A, config);
    expect(d.interestAtBenchmark!).toBeLessThan(d.totalInterest!);
    expect(d.financeMargin!).toBeCloseTo(d.totalInterest! - d.interestAtBenchmark!, 6);
  });
});

describe("Quote findings", () => {
  it("flags a rate above the concern threshold as critical", () => {
    const f = find(QUOTE_A, "implied-rate")!;
    expect(f.severity).toBe("critical");
    expect(f.title).toContain("10.8");
    expect(f.question).toMatch(/interest rate/i);
  });

  it("does not flag a rate at or below the benchmark", () => {
    const cheap: Quote = { ...QUOTE_A, lines: { ...QUOTE_A.lines, finance: 1_259 } };
    const f = find(cheap, "implied-rate")!;
    expect(f.severity).toBe("ok");
    expect(f.question).toBeUndefined();
  });

  it("says so plainly when the rate cannot be determined", () => {
    const noFinanceLine: Quote = {
      ...QUOTE_A,
      lines: { ...QUOTE_A.lines, finance: undefined },
    };
    const d = decodeQuote(noFinanceLine, config);
    expect(d.impliedRatePct).toBeNull();
    expect(d.rateBlockedBy).toMatch(/doesn't separate the finance payment/);
    // A gap must still produce output, and a question to ask.
    const f = d.findings.find((x) => x.key === "rate-undeterminable")!;
    expect(f).toBeDefined();
    expect(d.questions.some((q) => /interest rate/i.test(q))).toBe(true);
  });

  it("notes the interest alongside the savings the quote leads with", () => {
    expect(find(QUOTE_A, "interest-vs-savings")!.severity).toBe("warn");
  });

  it("passes a residual sitting at the ATO minimum", () => {
    const f = find(QUOTE_A, "residual")!;
    expect(f.severity).toBe("ok");
    expect(f.title).toContain("ATO minimum");
  });

  it("flags a residual padded above the minimum", () => {
    const padded: Quote = { ...QUOTE_A, residualIncGst: 30_000 };
    const f = find(padded, "residual")!;
    expect(f.severity).toBe("warn");
    expect(f.question).toBeTruthy();
  });

  it("flags the expensive insurance line and clears the cheap one", () => {
    // Same class of car; these two really were quoted 2.5x apart.
    expect(find(QUOTE_A, "insurance")!.severity).toBe("ok");
    const dear = find(QUOTE_C, "insurance")!;
    expect(dear.severity).not.toBe("ok");
    expect(dear.costOverTerm!).toBeGreaterThan(5_000);
    expect(dear.question).toMatch(/commission/i);
  });

  it("clears a management fee inside the market range", () => {
    expect(find(QUOTE_A, "management-fee")!.severity).toBe("ok");
    expect(find(QUOTE_C, "management-fee")!.severity).toBe("ok");
  });

  it("flags a management fee above the market range", () => {
    const dear: Quote = { ...QUOTE_A, lines: { ...QUOTE_A.lines, managementFee: 75 } };
    const f = find(dear, "management-fee")!;
    expect(f.severity).toBe("warn");
    expect(f.costOverTerm!).toBeGreaterThan(0);
  });

  it("catches a padded running-cost budget", () => {
    const padded: Quote = {
      ...QUOTE_A,
      lines: { ...QUOTE_A.lines, energy: 120, maintenance: 90 },
    };
    const f = find(padded, "running-cost-padding")!;
    expect(f.severity).toBe("warn");
    expect(f.costOverTerm!).toBeGreaterThan(0);
    expect(f.question).toMatch(/surplus/i);
  });

  it("reads as English when several budgets are padded", () => {
    const padded: Quote = {
      ...QUOTE_A,
      lines: { ...QUOTE_A.lines, energy: 120, maintenance: 90, tyres: 95 },
    };
    const f = find(padded, "running-cost-padding")!;
    // Not "The energy, maintenance, tyres budgets are…"
    expect(f.detail).toContain("energy, maintenance and tyres budgets are");
  });

  it("names a single padded budget in the singular", () => {
    const padded: Quote = { ...QUOTE_A, lines: { ...QUOTE_A.lines, maintenance: 90 } };
    expect(find(padded, "running-cost-padding")!.detail).toContain("The maintenance budget is");
  });

  it("leaves an honest budget alone", () => {
    // Provider A's energy, tyres and registration all sit at or under benchmark.
    const lean: Quote = {
      ...QUOTE_A,
      lines: { ...QUOTE_A.lines, maintenance: 20, tyres: 30, registration: 45 },
    };
    expect(find(lean, "running-cost-padding")).toBeUndefined();
  });

  it("catches a swapped price and amount financed", () => {
    // The lease is written over the price LESS the GST credit, so financed can
    // never exceed the price. If it does, the two fields are the wrong way round.
    const swapped: Quote = {
      ...QUOTE_A,
      vehiclePrice: QUOTE_A.amountFinanced,
      amountFinanced: QUOTE_A.vehiclePrice,
    };
    const f = find(swapped, "financed-above-price")!;
    expect(f.severity).toBe("critical");
    expect(f.detail).toMatch(/swapped/i);
  });

  it("catches the same figure entered in both fields", () => {
    const same: Quote = { ...QUOTE_A, amountFinanced: QUOTE_A.vehiclePrice };
    const f = find(same, "financed-equals-price")!;
    expect(f.severity).toBe("warn");
    expect(f.detail).toMatch(/\$6,334/);
  });

  it("says nothing when the pair is entered correctly", () => {
    expect(find(QUOTE_A, "financed-above-price")).toBeUndefined();
    expect(find(QUOTE_A, "financed-equals-price")).toBeUndefined();
  });

  it("confirms the GST credit is capped at the car limit", () => {
    const f = find(QUOTE_A, "gst-credit")!;
    expect(f.severity).toBe("ok");
    expect(f.title).toContain("$6,334");
  });

  it("orders findings by severity, then by what they cost", () => {
    const findings = decodeQuote(QUOTE_C, config).findings;
    const rank = { critical: 0, warn: 1, ok: 2 } as const;
    for (let i = 1; i < findings.length; i++) {
      expect(rank[findings[i].severity]).toBeGreaterThanOrEqual(rank[findings[i - 1].severity]);
    }
    expect(findings[0].severity).not.toBe("ok");
  });

  it("collects a question list from the findings", () => {
    const d = decodeQuote(QUOTE_C, config);
    expect(d.questions.length).toBeGreaterThan(1);
    expect(d.questions.every((q) => q.trim().endsWith("?"))).toBe(true);
  });
});

describe("Quote reconciliation", () => {
  it("reconciles a quote whose lines add up", () => {
    // Provider B is the only one of the four that shows the luxury car
    // adjustment as its own line, and the only one that balances.
    const d = decodeQuote(QUOTE_B, config);
    expect(Math.abs(d.reconciliationGap!)).toBeLessThan(50);
    expect(d.findings.find((f) => f.key === "reconciliation")).toBeUndefined();
  });

  it("catches a quote whose lines do not add up", () => {
    const d = decodeQuote(QUOTE_C, config);
    expect(d.reconciliationGap!).toBeGreaterThan(500);
    const f = d.findings.find((x) => x.key === "reconciliation")!;
    expect(f).toBeDefined();
    expect(f.question).toMatch(/don't add up/i);
  });

  it("recognises an unexplained gap that looks like the luxury car adjustment", () => {
    // Provider C never names it, but the gap is about the size the car limit
    // implies — saying which is far more useful than "there is a gap".
    const f = decodeQuote(QUOTE_C, config).findings.find((x) => x.key === "reconciliation")!;
    expect(f.detail).toMatch(/luxury car adjustment/i);
  });

  it("says nothing about reconciliation when the quote states no deduction", () => {
    const d = decodeQuote(QUOTE_A, config); // no statedPreTax
    expect(d.reconciliationGap).toBeNull();
    expect(d.findings.find((f) => f.key === "reconciliation")).toBeUndefined();
  });
});

describe("Comparing quotes", () => {
  it("separates the two quotes for the same car by rate and by budget", () => {
    const first = decodeQuote(QUOTE_C, config);
    const second = decodeQuote(QUOTE_C_REQUOTE, config);
    // The re-quote is materially cheaper finance…
    expect(second.impliedRatePct!).toBeLessThan(first.impliedRatePct! - 1);
    // …and its maintenance budget was cut to a fraction of the first.
    expect(second.annualLines.maintenance).toBeLessThan(first.annualLines.maintenance / 3);
  });

  it("shows the spread across the market sample", () => {
    const rates = [QUOTE_A, QUOTE_B, QUOTE_C, QUOTE_C_REQUOTE].map(
      (q) => decodeQuote(q, config).impliedRatePct!,
    );
    const spread = Math.max(...rates) - Math.min(...rates);
    expect(spread).toBeGreaterThan(2); // 2.47 percentage points, in practice
  });
});

describe("Part-year FBT", () => {
  // Every provider quote is priced on a full FBT year and says so in the fine
  // print. The FBT year ends 31 March, not 30 June, and nobody expects that.
  const ecmQuote: Quote = {
    ...QUOTE_A,
    fuelType: "petrol", // so there IS a contribution to pro-rate
    statedPostTax: 1_403.65, // monthly, ~20% of $84,219 a year
    statedPreTax: 500,
  };

  it("says nothing when no start date is given", () => {
    expect(find(ecmQuote, "part-year-fbt")).toBeUndefined();
  });

  it("says nothing for a lease starting on 1 April", () => {
    const full: Quote = { ...ecmQuote, firstHeldDate: "2026-04-01" };
    expect(find(full, "part-year-fbt")).toBeUndefined();
  });

  it("flags a lease delivered part-way through the FBT year", () => {
    const nov: Quote = { ...ecmQuote, firstHeldDate: "2026-11-01" };
    const f = find(nov, "part-year-fbt")!;
    expect(f.severity).toBe("warn");
    expect(f.title).toContain("151 days");
    expect(f.detail).toMatch(/31 March/);
    expect(f.question).toMatch(/full FBT year/i);
  });

  it("uses the FBT year, not the financial year, to decide", () => {
    // 1 May is early in the FBT year (11 months left) but late in nothing —
    // getting this backwards would flag it as nearly over.
    const may = find({ ...ecmQuote, firstHeldDate: "2026-05-01" }, "part-year-fbt")!;
    expect(may.title).toContain("335 days");
    // 1 February is nearly the END of FBT year 2026-27, not the start of one.
    const feb = find({ ...ecmQuote, firstHeldDate: "2027-02-01" }, "part-year-fbt")!;
    expect(feb.title).toContain("59 days");
  });

  it("notes the pro-rating on an exempt EV without alarming about it", () => {
    // No contribution to shrink, but the reportable amount still is.
    const ev: Quote = { ...QUOTE_A, firstHeldDate: "2026-11-01", statedPostTax: 0 };
    const f = find(ev, "part-year-fbt")!;
    expect(f.severity).toBe("ok");
    expect(f.question).toBeUndefined();
    expect(f.detail).toMatch(/reportable/i);
  });
});
