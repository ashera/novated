import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote, type Quote } from "@/lib/au/quote";
import { annuityPayment } from "@/lib/au/novated";
import { applyQuoteEdit, leaseToQuote, newLease, newQuoteSpec, type Lease } from "@/lib/au/lease";

const config = DEFAULT_CONFIG;

const financed = 50_000;
const months = 60;
const residualExGst = financed * (config.lease.residualMinPct["5"] / 100);
const residualIncGst = residualExGst * 1.1;
const RATE = 6;

/** What the quote charges once a $990 fee is financed in at the stated rate. */
const feesFinanced = 990;
const chargedWithFee = annuityPayment(financed + feesFinanced, residualExGst, RATE, months);

const quote = (over: Partial<Quote> = {}): Quote => ({
  frequency: "monthly",
  fuelType: "electric",
  termMonths: months,
  vehiclePrice: 55_000,
  amountFinanced: financed,
  residualIncGst,
  statedRatePct: RATE,
  lines: { finance: chargedWithFee },
  salary: 110_000,
  ...over,
});

/**
 * Checking what a provider said against what they charge.
 *
 * The decoder solves a rate and hands over a question; this is what happens
 * when the question gets answered. The answer is arithmetic, so it can be
 * tested rather than believed — which is the whole reason the field exists.
 */
describe("Reconciling a provider's explanation", () => {
  it("confirms an explanation that accounts for the gap", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    expect(d.reconciliation?.reconciles).toBe(true);
    expect(d.findings.some((f) => f.key === "explanation-reconciles")).toBe(true);
    expect(Math.abs(d.reconciliation!.unexplainedOverTerm)).toBeLessThan(months);
  });

  it("names what is left when the explanation falls short", () => {
    // They admit to $400 of a fee that is really $990.
    const d = decodeQuote(quote({ explainedFeesFinanced: 400 }), config);
    const f = d.findings.find((x) => x.key === "explanation-falls-short");
    expect(f?.severity).toBe("warn");
    expect(d.reconciliation!.unexplainedOverTerm).toBeGreaterThan(0);
    // The follow-up question carries the remaining figure, not a vague ask.
    expect(f?.question).toMatch(/remaining \$[\d,]+/);
  });

  it("says so when the explanation would cost more than they charge", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: 4_000 }), config);
    expect(d.reconciliation!.unexplainedOverTerm).toBeLessThan(0);
    expect(d.findings.some((f) => f.key === "explanation-overshoots")).toBe(true);
  });

  /**
   * The distinction the two fields exist for.
   *
   * A fee capitalised into the amount borrowed is amortised at the rate for
   * the whole term; the same money charged inside each payment is flat and
   * costs more. A provider says "there's a fee in there" for both, so putting
   * one in the wrong box has to produce a different answer — otherwise the
   * split is decoration.
   */
  it("treats a financed fee and a per-payment charge differently", () => {
    const asFinanced = decodeQuote(quote({ explainedFeesFinanced: 990 }), config).reconciliation!;
    const asPerPayment = decodeQuote(quote({ explainedFeesPerPayment: 990 }), config)
      .reconciliation!;
    expect(asPerPayment.expectedMonthly).toBeGreaterThan(asFinanced.expectedMonthly);
  });

  it("reads a per-payment charge at the quote's own frequency", () => {
    const monthly = decodeQuote(quote({ explainedFeesPerPayment: 20 }), config).reconciliation!;
    const weekly = decodeQuote(
      quote({ frequency: "weekly", lines: { finance: (chargedWithFee * 12) / 52 }, explainedFeesPerPayment: 20 }),
      config,
    ).reconciliation!;
    // $20 a week is more than $20 a month, so it must move the expectation more.
    expect(weekly.expectedMonthly - weekly.actualMonthly).toBeGreaterThan(
      monthly.expectedMonthly - monthly.actualMonthly,
    );
  });
});

/**
 * Reconciling is not endorsing.
 *
 * The risk of this feature is somebody entering the fees, seeing it balance,
 * and concluding the deal is fine — when the fees may be the problem. A clean
 * reconciliation has to price them too.
 */
describe("A complete explanation is not an endorsement", () => {
  it("prices the inclusions even when they account for everything", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    const f = d.findings.find((x) => x.key === "explanation-reconciles")!;
    expect(d.reconciliation!.feesOverTerm).toBeGreaterThan(0);
    // Priced in the prose rather than in costOverTerm — see below.
    expect(f.detail).toMatch(/They add \$[\d,]+ over the term/);
    expect(f.detail).toMatch(/separate thing to negotiate/);
  });

  it("does not call a reconciled quote good", () => {
    const f = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config).findings.find(
      (x) => x.key === "explanation-reconciles",
    )!;
    expect(`${f.title} ${f.detail}`).not.toMatch(/\bfair\b|\bgood deal\b|\breasonable\b/i);
    expect(f.detail).toMatch(/not the same as the inclusions being worth paying/);
  });

  it("questions a setup fee well above what is usual", () => {
    const big = config.lease.defaultEstablishmentFee * 3;
    const charged = annuityPayment(financed + big, residualExGst, RATE, months);
    const d = decodeQuote(
      quote({ explainedFeesFinanced: big, lines: { finance: charged } }),
      config,
    );
    const f = d.findings.find((x) => x.key === "explanation-reconciles")!;
    expect(f.question).toMatch(/negotiable/);
  });
});

describe("It stays quiet until there is something to check", () => {
  it("says nothing before anyone has been asked", () => {
    expect(decodeQuote(quote(), config).reconciliation).toBeNull();
    expect(decodeQuote(quote(), config).findings.some((f) => f.key.startsWith("explanation-"))).toBe(
      false,
    );
  });

  it("needs a stated rate to reconcile against", () => {
    const d = decodeQuote(
      quote({ statedRatePct: undefined, explainedFeesFinanced: 990 }),
      config,
    );
    expect(d.reconciliation).toBeNull();
  });

  it("treats zero fees as no explanation rather than a complete one", () => {
    const d = decodeQuote(
      quote({ explainedFeesFinanced: 0, explainedFeesPerPayment: 0 }),
      config,
    );
    expect(d.reconciliation).toBeNull();
  });
});

describe("It survives being stored", () => {
  it("round-trips both figures through the lease", () => {
    const spec = newQuoteSpec("Provider A", months);
    let lease: Lease = { ...newLease(), quotes: [spec] };
    lease = applyQuoteEdit(lease, spec.id, {
      ...quote({ explainedFeesFinanced: 990, explainedFeesPerPayment: 12 }),
    });
    expect(lease.quotes[0].explainedFeesFinanced).toBe(990);
    expect(lease.quotes[0].explainedFeesPerPayment).toBe(12);
    const back = leaseToQuote(lease, lease.quotes[0]);
    expect(back.explainedFeesFinanced).toBe(990);
    expect(back.explainedFeesPerPayment).toBe(12);
  });
});

/**
 * The same money, counted once.
 *
 * The decoder totals costOverTerm across findings to say how much avoidable
 * cost a quote holds. A reconciliation explains money the stated-rate finding
 * has already counted — so pricing it again inflated that total, reporting
 * $2,296 of avoidable cost for $1,148 of fees.
 */
describe("Explaining a cost does not add to it", () => {
  const total = (q: Quote) =>
    decodeQuote(q, config)
      .findings.filter((f) => f.costOverTerm != null)
      .reduce((sum, f) => sum + (f.costOverTerm ?? 0), 0);

  it("does not grow the avoidable-cost total when an explanation arrives", () => {
    const before = total(quote());
    const explained = total(quote({ explainedFeesFinanced: feesFinanced }));
    expect(explained).toBeCloseTo(before, 6);
  });

  it("does not grow it when the explanation falls short either", () => {
    const before = total(quote());
    expect(total(quote({ explainedFeesFinanced: 400 }))).toBeCloseTo(before, 6);
  });

  it("still puts the figures in front of the reader", () => {
    const d = decodeQuote(quote({ explainedFeesFinanced: feesFinanced }), config);
    const f = d.findings.find((x) => x.key === "explanation-reconciles")!;
    expect(f.costOverTerm).toBeUndefined();
    expect(f.detail).toMatch(/\$[\d,]+ over the term/);
  });
});
