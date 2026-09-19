import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { calculateLease, defaultInputs, type LeaseInputs } from "@/lib/au/novated";
import { marginalRelief } from "@/lib/au/tax";
import { leaseToInputs, newLease, type Lease } from "@/lib/au/lease";
import { decodeQuote, type Quote } from "@/lib/au/quote";

const config = DEFAULT_CONFIG;

/**
 * When the employer keeps part of the saving.
 *
 * Public health services, ambulance services and universities commonly run
 * salary packaging as a scheme and take a share — often half — of the tax
 * benefit it creates. It reaches the employee as a second pre-tax line on the
 * payslip beside the lease, and it appears in no provider's headline figures:
 * they quote what the employee keeps, without saying that it is a half.
 *
 * Which made this a correctness problem rather than a feature. Modelled
 * without it, every figure this engine produced for such a person was too
 * good — and too good in the one direction a tool like this cannot afford to
 * be wrong in.
 */

const base = (over: Partial<LeaseInputs> = {}): LeaseInputs => ({
  ...defaultInputs(config),
  salary: 140_000,
  vehiclePrice: 62_200,
  onRoadCosts: 3_490,
  fuelType: "electric",
  termYears: 3,
  annualKm: 7_000,
  interestRatePct: 10.92,
  residualPct: 46.88,
  includeRunningCosts: true,
  state: "NSW",
  ...over,
});

const run = (pct?: number) => calculateLease(base({ employerSavingSharePct: pct }), config);

describe("An employer's share of the saving", () => {
  /**
   * The compatibility floor. Every scenario saved before this field existed
   * has no value for it, and none of their figures may move.
   */
  it("changes nothing at all when there is no such arrangement", () => {
    const without = run(undefined);
    const zero = run(0);
    expect(zero.package.netAnnualCost).toBeCloseTo(without.package.netAnnualCost, 6);
    expect(zero.package.taxSaved).toBeCloseTo(without.package.taxSaved, 6);
    expect(without.package.employerShare).toBe(0);
    expect(without.warnings.join(" ")).not.toMatch(/employer keeps/i);
  });

  /**
   * The heart of it, and the reason this is solved rather than multiplied.
   *
   * The share is deducted PRE-TAX, so it relieves its own tax and enlarges the
   * saving it is a percentage of. Taking the percentage off the relief on the
   * lease alone — the obvious shortcut — understates it every time. On the
   * real payslip this was built against that shortcut gives $121.62 a
   * fortnight where the document says $144.76.
   */
  it("is a share of the relief on the lease AND the share, not the lease alone", () => {
    const r = run(50);
    const naive =
      0.5 *
      marginalRelief(140_000, r.package.preTaxAnnual, config, {}, {}).taxSaved;
    expect(r.package.employerShare).toBeGreaterThan(naive);

    // And it is genuinely a fixed point: half the relief actually computed.
    expect(r.package.employerShare).toBeCloseTo(r.package.taxSaved / 2, 2);
  });

  it("takes more when the percentage is higher", () => {
    const shares = [25, 50, 75].map((p) => run(p).package.employerShare);
    expect(shares[1]).toBeGreaterThan(shares[0]);
    expect(shares[2]).toBeGreaterThan(shares[1]);
  });

  /** The whole point: the car costs more than it appeared to. */
  it("raises what the car costs and shrinks what it beats", () => {
    const without = run(0);
    const with50 = run(50);
    expect(with50.package.netAnnualCost).toBeGreaterThan(without.package.netAnnualCost);
    expect(with50.package.takeHomeReduction).toBeGreaterThan(without.package.takeHomeReduction);
    expect(with50.comparison.savingVsLoan).toBeLessThan(without.comparison.savingVsLoan);
    expect(with50.term.netCost).toBeGreaterThan(without.term.netCost);
  });

  /**
   * The saving is still the saving. What changed is who has it — and a reader
   * is owed both facts, so the relief is never quietly reduced.
   */
  it("reports the whole saving and the split, rather than a netted figure", () => {
    const r = run(50);
    expect(r.package.taxSaved).toBeGreaterThan(r.package.employerShare);
    expect(r.term.employerShare).toBeCloseTo(r.package.employerShare * 3, 6);
    // The extra cost is exactly what the employer took.
    expect(r.package.netAnnualCost - run(0).package.netAnnualCost).toBeCloseTo(
      r.package.employerShare - (r.package.taxSaved - run(0).package.taxSaved),
      2,
    );
  });

  it("cannot take more than all of it, or less than none", () => {
    expect(run(-40).package.employerShare).toBe(0);
    const all = run(100);
    expect(all.package.employerShare).toBeCloseTo(all.package.taxSaved, 2);
    expect(run(400).package.employerShare).toBeCloseTo(run(100).package.employerShare, 6);
  });

  /**
   * Checked against a real quote: a $140,000 salary, a three-year lease on an
   * exempt EV, and a scheme taking half. The document's own payslip table
   * shows the share at $144.76 a fortnight against a $717.96 lease deduction.
   * Ours sits a little above both because our running-cost and fee
   * assumptions make the package slightly larger — so the relationship is
   * what is asserted, not the cents.
   */
  it("lands where the provider's own payslip lands", () => {
    const r = run(50);
    const shareFortnightly = r.package.employerShare / 26;
    expect(shareFortnightly).toBeGreaterThan(130);
    expect(shareFortnightly).toBeLessThan(165);
    // Their share and what the employee keeps are the same size at 50%.
    expect(r.package.taxSaved - r.package.employerShare).toBeCloseTo(r.package.employerShare, 2);
  });

  describe("what it says about it", () => {
    const warning = () => run(50).warnings.find((w) => /employer keeps/i.test(w))!;

    it("names the percentage, the whole saving and what is left", () => {
      const w = warning();
      expect(w).toBeTruthy();
      expect(w).toMatch(/50%/);
      expect(w).toMatch(/over 3 years/i);
      expect(w).toMatch(/payslip/i);
    });

    // It is a term of an employment scheme, not a trick by a financier.
    it("does not accuse anybody of anything", () => {
      expect(warning()).not.toMatch(/\b(scam|rip.?off|dishonest|hidden fee|deceptive)\b/i);
    });
  });

  it("survives being stored on a lease", () => {
    const lease: Lease = {
      ...newLease(),
      scenario: { ...newLease().scenario, salary: 140_000, employerSavingSharePct: 50 },
    };
    expect(leaseToInputs(lease).employerSavingSharePct).toBe(50);
    expect(calculateLease(leaseToInputs(lease), config).package.employerShare).toBeGreaterThan(0);
  });

  /** A share of nothing is nothing — and must not divide by it either. */
  it("stays sane when there is no package to share", () => {
    const r = calculateLease(
      base({ employerSavingSharePct: 50, includeRunningCosts: false, salary: 20_000 }),
      config,
    );
    expect(Number.isFinite(r.package.employerShare)).toBe(true);
    expect(r.package.employerShare).toBeGreaterThanOrEqual(0);
  });
});

/**
 * Spotting one on a quote that never names it.
 *
 * The arrangement is rarely itemised. The inclusions list the car's costs, the
 * deduction coming out of pay is bigger, and nothing explains the difference —
 * which until now read as "the numbers don't add up", true but not useful.
 *
 * The signal is that the excess is a round share of the tax the deduction
 * actually relieves. That is a far more specific coincidence than a gap, and
 * it is what lets the finding name a cause instead of an absence.
 */
describe("Recognising one on a quote", () => {
  /** The real quote: inclusions $717.96 a fortnight, but $862.72 leaves the
   *  pay packet — $717.96 of lease and $144.76 of share. */
  const real = (over: Partial<Quote> = {}): Quote => ({
    frequency: "fortnightly",
    fuelType: "electric",
    termMonths: 36,
    vehiclePrice: 62_200,
    amountFinanced: 60_035.45,
    residualIncGst: 30_959.08,
    salary: 140_000,
    annualKm: 7_000,
    statedPreTax: 862.72,
    lines: {
      finance: 599.46,
      managementFee: 3.0,
      registration: 38.46,
      tyres: 6.73,
      maintenance: 11.54,
      insurance: 58.77,
    },
    ...over,
  });

  const found = (q: Quote) =>
    decodeQuote(q, config).findings.find((f) => f.key === "employer-share-of-saving");

  it("names the cause where the excess is half the relief", () => {
    const f = found(real())!;
    expect(f).toBeTruthy();
    expect(f.detail).toMatch(/half, which is the usual arrangement/);
    expect(f.detail).toMatch(/public health/i);
    expect(f.question).toMatch(/what percentage is it/i);
  });

  /**
   * Priced at what it COSTS, not at what the employer receives.
   *
   * The two differ by about a third, because the share sits before tax and
   * part of it is funded by tax no longer collected. The employer gets
   * $3,764 a year — $11,291 over this term — and the reader's take-home
   * falls by $7,678 of that. A page built to catch a provider overstating a
   * saving does not get to overstate a cost.
   */
  it("prices what it costs the reader, not what the employer receives", () => {
    const f = found(real())!;
    expect(f.costOverTerm).toBeCloseTo(7_678, -2);
    // Strictly less than the employer's take, and by a real margin.
    expect(f.costOverTerm!).toBeLessThan(11_291);
    expect(f.detail).toMatch(/costs you less than your employer receives/i);
    expect(f.detail).toMatch(/tax nobody collects/i);
  });

  /** It replaces the vaguer finding rather than sitting beside it — two
   *  findings about one gap, one saying it is unexplained, is worse than
   *  either alone. */
  it("stands the generic reconciliation down", () => {
    const keys = decodeQuote(real(), config).findings.map((f) => f.key);
    expect(keys).toContain("employer-share-of-saving");
    expect(keys).not.toContain("reconciliation");
  });

  it("says nothing when the deduction matches the inclusions", () => {
    expect(found(real({ statedPreTax: 717.96 }))).toBeUndefined();
  });

  /** Without a salary there is no relief to be a share OF, so there is no
   *  hypothesis — only the honest gap. */
  it("says nothing without a salary to measure against", () => {
    const q = real({ salary: undefined });
    expect(found(q)).toBeUndefined();
    expect(decodeQuote(q, config).findings.map((f) => f.key)).toContain("reconciliation");
  });

  /**
   * The discipline that makes it worth having. A gap that is merely SOME
   * fraction of the relief is every quote that doesn't add up; claiming this
   * mechanism for those would tell readers their employer is taking money
   * when a financed insurance explains it.
   */
  it("does not claim a gap that is not an even split", () => {
    for (const preTax of [760, 800, 1_050, 1_400]) {
      expect(found(real({ statedPreTax: preTax }))).toBeUndefined();
    }
  });

  it("leaves a gap the luxury car adjustment explains alone", () => {
    // A car well over the limit, with a gap the size of the adjustment.
    const q = real({ vehiclePrice: 130_000, amountFinanced: 125_000, salary: 250_000 });
    const f = found(q);
    if (f) expect(f.detail).not.toMatch(/luxury/i);
  });

  // It is a term of employment, not a financier's doing, and must not read as
  // an accusation against either.
  it("does not accuse the provider of it", () => {
    const f = found(real())!;
    expect(f.detail).toMatch(/not something the financier sets/i);
    expect(`${f.title} ${f.detail}`).not.toMatch(/\b(scam|hidden fee|dishonest|deceptive)\b/i);
  });
});

/**
 * What a shared quote can and cannot say about it.
 *
 * A share link strips the salary on purpose — it is the one thing on a lease
 * nobody means to hand over — and the detection above needs it, because the
 * gap is only meaningful as a share of the relief it would have produced.
 *
 * So on a shared quote the finding cannot run. What it must not do is fill the
 * silence with a claim about the quote: "nothing explains the difference" is
 * true of the document but false of us, and it sends a reader away from the
 * likeliest answer.
 */
describe("The same gap, on a quote somebody shared", () => {
  const shared = (over: Partial<Quote> = {}): Quote => ({
    frequency: "fortnightly",
    fuelType: "electric",
    termMonths: 36,
    vehiclePrice: 62_200,
    amountFinanced: 60_035.45,
    residualIncGst: 30_959.08,
    annualKm: 7_000,
    statedPreTax: 862.72,
    // No salary: exactly what app/s/[token]/quote/[quoteId] passes.
    lines: {
      finance: 599.46,
      managementFee: 3.0,
      registration: 38.46,
      tyres: 6.73,
      maintenance: 11.54,
      insurance: 58.77,
    },
    ...over,
  });

  const reconciliation = (q: Quote) =>
    decodeQuote(q, config).findings.find((f) => f.key === "reconciliation");

  it("cannot name the cause without a salary", () => {
    const keys = decodeQuote(shared(), config).findings.map((f) => f.key);
    expect(keys).not.toContain("employer-share-of-saving");
    expect(keys).toContain("reconciliation");
  });

  /** The bug this pair exists to stop coming back. */
  it("does not claim nothing explains a gap it was unable to test", () => {
    const f = reconciliation(shared())!;
    expect(f.detail).not.toMatch(/Nothing on the quote explains/i);
    expect(f.detail).toMatch(/employer keeping a share/i);
    expect(f.detail).toMatch(/takes the salary/i);
  });

  /** With a salary and a gap that is not an even split, "nothing explains it"
   *  is the honest answer again — we looked, and it did not fit. */
  it("says nothing explains it when it really did look", () => {
    const f = reconciliation(shared({ salary: 140_000, statedPreTax: 1_100 }))!;
    expect(f.detail).toMatch(/Nothing on the quote explains/i);
  });
});

/**
 * What the employer gets, and what it costs you.
 *
 * Two different numbers, and the difference is about a third. The share is
 * deducted before tax, so part of it is funded by tax no longer collected
 * rather than out of the employee's pay. Reporting only the employer's figure
 * would overstate the loss — and a site built to catch a provider overstating
 * a saving does not get to overstate a cost in the other direction.
 */
describe("What the share takes against what it costs", () => {
  it("costs the employee less than the employer receives", () => {
    const r = run(50);
    expect(r.package.employerShareNetCost).toBeGreaterThan(0);
    expect(r.package.employerShareNetCost).toBeLessThan(r.package.employerShare);
  });

  /** The counterfactual, computed the long way round: the same lease with no
   *  arrangement at all. The two must agree, or one of them is wrong. */
  it("is exactly what the lease costs with the share less without it", () => {
    const r = run(50);
    expect(r.package.employerShareNetCost).toBeCloseTo(
      r.package.netAnnualCost - run(0).package.netAnnualCost,
      6,
    );
  });

  it("carries the same relationship over the term", () => {
    const r = run(50);
    // Off the result's own term, not a literal — this fixture is a 3-year
    // lease and a hardcoded 5 quietly asserts the wrong thing.
    expect(r.term.employerShareNetCost).toBeCloseTo(
      r.package.employerShareNetCost * r.term.years,
      6,
    );
    expect(r.term.employerShareNetCost).toBeLessThan(r.term.employerShare);
  });

  it("is nothing at all when there is no arrangement", () => {
    expect(run(0).package.employerShareNetCost).toBe(0);
    expect(run(undefined).term.employerShareNetCost).toBe(0);
  });

  it("says both figures, and whose the difference is", () => {
    const w = run(50).warnings.find((x) => /employer keeps/i.test(x))!;
    expect(w).toMatch(/costs you less than they receive/i);
    expect(w).toMatch(/tax nobody collects/i);
  });
});
