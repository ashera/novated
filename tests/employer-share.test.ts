import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { calculateLease, defaultInputs, type LeaseInputs } from "@/lib/au/novated";
import { marginalRelief } from "@/lib/au/tax";
import { leaseToInputs, newLease, type Lease } from "@/lib/au/lease";

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
