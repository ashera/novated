import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { assessSuper, calculateLease, defaultInputs, type LeaseInputs } from "@/lib/au/novated";

const config = DEFAULT_CONFIG;
const base = defaultInputs(config);
const run = (o: Partial<LeaseInputs> = {}) => calculateLease({ ...base, ...o }, config);
const rate = config.super.guaranteeRatePct / 100;
const cap = config.super.maxContributionBase;

/**
 * The cost that never appears on a payslip.
 *
 * The 1 January 2020 change that stopped salary sacrifice eroding super
 * covers amounts sacrificed INTO super. Sacrifice to a car is expressly
 * outside it, and the Payday Super rules from 1 July 2026 kept it that way:
 * qualifying earnings exclude non-super salary sacrifice. So the employer's
 * obligation is lawfully calculated on the reduced salary, and the difference
 * is invisible unless something says it out loud.
 */
describe("What a lease does to super", () => {
  it("reduces the guarantee by the rate on the pre-tax deduction", () => {
    const r = run({ salary: 110_000 });
    const deduction = r.package.preTaxAnnual;
    expect(r.superannuation.before).toBeCloseTo(110_000 * rate, 4);
    expect(r.superannuation.after).toBeCloseTo((110_000 - deduction) * rate, 4);
    expect(r.superannuation.forgone).toBeCloseTo(deduction * rate, 4);
  });

  it("is worth thousands over a term, which is why it is worth saying", () => {
    const r = run({ salary: 110_000 });
    expect(r.superannuation.forgone * r.inputs.termYears).toBeGreaterThan(4_000);
  });

  it("says so rather than leaving it to be noticed", () => {
    const r = run({ salary: 110_000 });
    expect(r.warnings.some((w) => w.includes("super contributions fall by"))).toBe(true);
  });

  // Some employment agreements promise super on pre-packaging salary. It is
  // not the default and it is worth thousands, so it is asked rather than
  // assumed either way.
  it("takes nothing when the employer pays on pre-sacrifice salary", () => {
    const r = run({ salary: 110_000, employerPaysSuperOnPreSacrifice: true });
    expect(r.superannuation.forgone).toBe(0);
    expect(r.superannuation.after).toBeCloseTo(r.superannuation.before, 6);
    expect(r.superannuation.protectedByAgreement).toBe(true);
    expect(r.warnings.some((w) => w.includes("super contributions fall by"))).toBe(false);
  });

  it("defaults to the position that costs the employee, because that is the default", () => {
    expect(run({ salary: 110_000 }).superannuation.protectedByAgreement).toBe(false);
    expect(run({ salary: 110_000 }).superannuation.forgone).toBeGreaterThan(0);
  });
});

/**
 * The ceiling, which is why this is not simply the rate times the deduction.
 *
 * Above the maximum contribution base no guarantee is owed at all — so a high
 * earner can sacrifice twenty thousand dollars and lose nothing. This site's
 * users skew towards exactly those salaries, since a lease suits a high
 * marginal rate, so getting it wrong would be wrong for the people most
 * likely to be reading.
 */
describe("The maximum contribution base", () => {
  it("takes nothing from someone who stays above it", () => {
    const r = run({ salary: 400_000 });
    expect(r.package.preTaxAnnual).toBeLessThan(400_000 - cap);
    expect(r.superannuation.forgone).toBe(0);
    expect(r.superannuation.cappedOut).toBe(true);
  });

  it("caps the contribution itself at the ceiling", () => {
    const r = run({ salary: 400_000 });
    expect(r.superannuation.before).toBeCloseTo(cap * rate, 4);
  });

  it("takes only the part that drops someone below it", () => {
    // Salary just above the cap: only the sacrifice that crosses the line costs.
    const salary = cap + 10_000;
    const r = run({ salary });
    const deduction = r.package.preTaxAnnual;
    const expected = Math.max(0, (cap - (salary - deduction)) * rate);
    expect(r.superannuation.forgone).toBeCloseTo(expected, 4);
    expect(r.superannuation.forgone).toBeLessThan(deduction * rate);
    expect(r.superannuation.forgone).toBeGreaterThan(0);
  });

  it("hurts an ordinary salary more than a very large one", () => {
    expect(run({ salary: 110_000 }).superannuation.forgone).toBeGreaterThan(
      run({ salary: 400_000 }).superannuation.forgone,
    );
  });
});

describe("The arithmetic on its own", () => {
  it("handles a deduction larger than the salary without going negative", () => {
    const out = assessSuper(30_000, 50_000, {}, config);
    expect(out.after).toBe(0);
    expect(out.forgone).toBeCloseTo(30_000 * rate, 6);
  });

  it("handles no deduction at all", () => {
    const out = assessSuper(110_000, 0, {}, config);
    expect(out.forgone).toBe(0);
    expect(out.after).toBeCloseTo(out.before, 6);
  });
});

/**
 * Forgone super is not cash and must never be added to one.
 *
 * It is contributions never made: taxed at 15% going in, preserved until
 * sixty, worth less than the same number in the hand today and more after
 * decades of compounding. Folding it into net cost would be the same kind of
 * conflation this site exists to argue against.
 */
describe("It stays out of the cash totals", () => {
  it("leaves net annual cost alone", () => {
    const taken = run({ salary: 110_000 });
    const protectedOne = run({ salary: 110_000, employerPaysSuperOnPreSacrifice: true });
    expect(taken.package.netAnnualCost).toBeCloseTo(protectedOne.package.netAnnualCost, 6);
  });

  it("leaves take-home pay alone", () => {
    const taken = run({ salary: 110_000 });
    const protectedOne = run({ salary: 110_000, employerPaysSuperOnPreSacrifice: true });
    expect(taken.package.takeHomeAfter).toBeCloseTo(protectedOne.package.takeHomeAfter, 6);
  });

  it("leaves the ownership comparison alone", () => {
    const taken = run({ salary: 110_000 });
    const protectedOne = run({ salary: 110_000, employerPaysSuperOnPreSacrifice: true });
    expect(taken.comparison.lease.totalCost).toBeCloseTo(
      protectedOne.comparison.lease.totalCost,
      6,
    );
  });
});
