import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  PAY_CYCLES_PER_YEAR,
  calculateLease,
  defaultInputs,
  effectivePayCycle,
  type LeaseInputs,
  type PayCycle,
} from "@/lib/au/novated";
import { takeHome, totalTax } from "@/lib/au/tax";

const config = DEFAULT_CONFIG;
const base = defaultInputs(config);
const run = (o: Partial<LeaseInputs> = {}) => calculateLease({ ...base, ...o }, config);

describe("Salary packaging", () => {
  it("splits the package into a pre-tax and a post-tax side that add up", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 50_000 });
    const deducted = r.package.preTaxAnnual + r.package.postTaxAnnual;
    const expected =
      r.finance.annualPayment +
      r.running.total +
      config.lease.defaultAdminFeeAnnual +
      r.fbt.fbtPayable;
    expect(deducted).toBeCloseTo(expected, 4);
  });

  it("puts the whole package pre-tax when the car is FBT exempt", () => {
    const r = run({ fuelType: "electric", vehiclePrice: 55_000 });
    expect(r.package.postTaxAnnual).toBe(0);
    expect(r.package.preTaxAnnual).toBeGreaterThan(0);
  });

  it("reduces take-home pay by the deductions less the tax relief", () => {
    const r = run();
    const before = takeHome(r.inputs.salary, config, { hasHelpDebt: false });
    expect(r.package.takeHomeBefore).toBeCloseTo(before.net, 4);
    expect(r.package.takeHomeReduction).toBeCloseTo(
      r.package.preTaxAnnual + r.package.postTaxAnnual - r.package.taxSaved,
      4,
    );
  });

  it("never claims more tax relief than the pre-tax deduction itself", () => {
    const r = run({ salary: 300_000, vehiclePrice: 90_000 });
    expect(r.package.taxSaved).toBeLessThan(r.package.preTaxAnnual);
    expect(r.package.effectiveReliefRate).toBeLessThanOrEqual(0.47 + 0.17);
  });

  it("saves a high earner more than a low earner on the same car", () => {
    const low = run({ salary: 60_000, fuelType: "petrol", vehiclePrice: 40_000 });
    const high = run({ salary: 250_000, fuelType: "petrol", vehiclePrice: 40_000 });
    expect(high.package.taxSaved).toBeGreaterThan(low.package.taxSaved);
    expect(high.package.effectiveReliefRate).toBeGreaterThan(low.package.effectiveReliefRate);
  });

  it("caps the employee contribution at the size of the package", () => {
    // A very expensive car on a short term: the statutory taxable value could
    // otherwise exceed everything the employer actually deducts in a year.
    const r = run({ fuelType: "petrol", vehiclePrice: 190_000, termYears: 1 });
    expect(r.package.postTaxAnnual).toBeLessThanOrEqual(
      r.package.preTaxAnnual + r.package.postTaxAnnual + 1e-6,
    );
    expect(r.package.preTaxAnnual).toBeGreaterThanOrEqual(0);
  });

  it("splits the deduction evenly across the pay cycles", () => {
    const r = run();
    expect(r.perPayCycle.preTax).toBeCloseTo(
      r.package.preTaxAnnual / config.lease.payCyclesPerYear,
      6,
    );
    expect(r.perPayCycle.takeHomeReduction).toBeCloseTo(
      r.package.takeHomeReduction / config.lease.payCyclesPerYear,
      6,
    );
  });

  it("charges the same running costs whether or not they are packaged", () => {
    // Packaging changes HOW they are paid, not whether they are paid — so the
    // net cost comparison must still include them either way.
    const packaged = run({ includeRunningCosts: true });
    const not = run({ includeRunningCosts: false });
    expect(not.package.preTaxAnnual).toBeLessThan(packaged.package.preTaxAnnual);
    // Packaging them pre-tax and GST-free must come out cheaper overall.
    expect(packaged.package.netAnnualCost).toBeLessThan(not.package.netAnnualCost);
  });

  it("warns when the package would swallow the whole pay packet", () => {
    const r = run({ salary: 40_000, vehiclePrice: 150_000, termYears: 1 });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("HELP debt interaction", () => {
  it("reduces the relief when a reportable fringe benefit lifts repayment income", () => {
    const noDebt = run({ fuelType: "electric", vehiclePrice: 55_000, hasHelpDebt: false });
    const withDebt = run({ fuelType: "electric", vehiclePrice: 55_000, hasHelpDebt: true });
    // The exempt EV creates a reportable benefit; on a HELP debt that pushes
    // repayment income up and claws back part of the saving.
    expect(withDebt.package.taxSaved).toBeLessThan(noDebt.package.taxSaved);
    expect(withDebt.warnings.some((w) => w.includes("HELP repayment income"))).toBe(true);
  });

  it("leaves the ECM route unaffected, since it creates no reportable benefit", () => {
    const noDebt = run({ fuelType: "petrol", vehiclePrice: 45_000, hasHelpDebt: false });
    const withDebt = run({ fuelType: "petrol", vehiclePrice: 45_000, hasHelpDebt: true });
    expect(withDebt.fbt.reportableFringeBenefit).toBe(0);
    // Relief still differs (HELP is part of the marginal wedge), but it goes UP,
    // not down — there is no benefit being added back.
    expect(withDebt.package.taxSaved).toBeGreaterThan(noDebt.package.taxSaved);
  });
});

describe("Ownership comparison", () => {
  it("compares against the same car, term and residual", () => {
    const r = run();
    expect(r.comparison.cash.upfront).toBe(r.finance.priceInclGst);
    expect(r.comparison.lease.totalCost).toBeCloseTo(
      r.package.netAnnualCost * r.inputs.termYears,
      4,
    );
  });

  it("reports the lease as cheaper for an exempt EV on a high salary", () => {
    const r = run({ salary: 200_000, fuelType: "electric", vehiclePrice: 60_000 });
    expect(r.comparison.savingVsLoan).toBeGreaterThan(0);
    expect(r.comparison.savingVsCash).toBeGreaterThan(0);
  });

  it("charges GST on running costs when the car is bought privately", () => {
    const r = run({ includeRunningCosts: true });
    const runningInclGst = r.running.total * (1 + config.gst.rate) * r.inputs.termYears;
    expect(r.comparison.cash.totalCost).toBeCloseTo(
      r.finance.priceInclGst + runningInclGst,
      4,
    );
  });

  it("makes a dearer car loan rate widen the gap in the lease's favour", () => {
    const tight = run({ comparisonLoanRatePct: 7.5 });
    const wide = run({ comparisonLoanRatePct: 14 });
    expect(wide.comparison.savingVsLoan).toBeGreaterThan(tight.comparison.savingVsLoan);
  });
});

describe("Whole-of-term totals", () => {
  it("counts the establishment fee once, not every year", () => {
    const r = run();
    const perYear = r.package.netAnnualCost * r.inputs.termYears;
    expect(r.term.netCost - perYear).toBeCloseTo(config.lease.defaultEstablishmentFee, 4);
  });

  it("includes the GST on the car and on packaged running costs in the GST saved", () => {
    const r = run({ includeRunningCosts: true });
    expect(r.term.gstSaved).toBeCloseTo(
      r.finance.gstCredit + r.running.total * config.gst.rate * r.inputs.termYears,
      4,
    );
  });

  it("counts only the vehicle GST when running costs aren't packaged", () => {
    const r = run({ includeRunningCosts: false });
    expect(r.term.gstSaved).toBeCloseTo(r.finance.gstCredit, 4);
  });

  it("surfaces the residual as a separate obligation, not part of the running cost", () => {
    const r = run();
    expect(r.term.residualPayable).toBe(r.finance.residual);
    expect(r.term.residualPayable).toBeGreaterThan(0);
  });
});

describe("How often you're paid", () => {
  // The point of the setting, and the thing that must never break: it slices
  // the same year up differently. If changing it moved an annual figure, it
  // would be arithmetic rather than presentation, and a weekly-paid person
  // would be told a different lease costs a different amount.
  const cycles: PayCycle[] = ["weekly", "fortnightly", "monthly"];

  it("leaves every annual figure untouched", () => {
    const [first, ...rest] = cycles.map((payCycle) => run({ payCycle }));
    for (const r of rest) {
      expect(r.package.preTaxAnnual).toBeCloseTo(first.package.preTaxAnnual, 6);
      expect(r.package.postTaxAnnual).toBeCloseTo(first.package.postTaxAnnual, 6);
      expect(r.package.takeHomeReduction).toBeCloseTo(first.package.takeHomeReduction, 6);
      expect(r.package.taxSaved).toBeCloseTo(first.package.taxSaved, 6);
      expect(r.term.netCost).toBeCloseTo(first.term.netCost, 6);
    }
  });

  it("divides the year by the right number of pays", () => {
    for (const payCycle of cycles) {
      const r = run({ payCycle });
      const n = PAY_CYCLES_PER_YEAR[payCycle];
      expect(r.perPayCycle.takeHomeReduction * n, payCycle).toBeCloseTo(
        r.package.takeHomeReduction,
        6,
      );
      expect(r.perPayCycle.preTax * n, payCycle).toBeCloseTo(r.package.preTaxAnnual, 6);
      expect(r.perPayCycle.postTax * n, payCycle).toBeCloseTo(r.package.postTaxAnnual, 6);
    }
  });

  it("makes a weekly slice smaller than a monthly one", () => {
    expect(run({ payCycle: "weekly" }).perPayCycle.takeHomeReduction).toBeLessThan(
      run({ payCycle: "monthly" }).perPayCycle.takeHomeReduction,
    );
  });

  it("falls back to the reference data when nobody has chosen", () => {
    expect(effectivePayCycle(undefined, config)).toBe("fortnightly");
    expect(run({}).perPayCycle.takeHomeReduction).toBeCloseTo(
      run({ payCycle: "fortnightly" }).perPayCycle.takeHomeReduction,
      6,
    );
  });

  it("still honours a reference-data cycle that isn't fortnightly", () => {
    const monthlyConfig = {
      ...config,
      lease: { ...config.lease, payCyclesPerYear: 12 },
    };
    expect(effectivePayCycle(undefined, monthlyConfig)).toBe("monthly");
  });
});

/**
 * The arithmetic each headline card's explainer shows the user.
 *
 * Same reasoning as the deduction explainer: the modal claims a figure can be
 * reconstructed from the rows above it, and prose cannot be type-checked. If
 * one of these fails, the wording in components/StatExplainer.tsx is what
 * needs fixing.
 */
describe("What the stat explainers promise", () => {
  it("cost: take-home before minus take-home after is the yearly cost", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 50_000 });
    expect(r.package.takeHomeBefore - r.package.takeHomeAfter).toBeCloseTo(
      r.package.takeHomeReduction,
      6,
    );
  });

  it("tax saved: is the stated percentage of the pre-tax deduction", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 50_000 });
    expect(r.package.taxSaved / r.package.preTaxAnnual).toBeCloseTo(
      r.package.effectiveReliefRate,
      6,
    );
  });

  it("tax saved: is the difference between two whole tax bills, not a headline rate", () => {
    // Asserted on an FBT-exempt car with no study loan, so the packaged side
    // carries nothing the unpackaged side doesn't and the two are comparable.
    const r = run({ fuelType: "electric", vehiclePrice: 50_000, hasHelpDebt: false });
    const before = takeHome(base.salary, config, { hasHelpDebt: false });
    const after = takeHome(base.salary - r.package.preTaxAnnual, config, { hasHelpDebt: false });
    expect(r.package.taxSaved).toBeCloseTo(totalTax(before) - totalTax(after), 6);

    // And it is NOT the top marginal rate applied to the deduction, which is
    // the shortcut the explainer exists to contradict.
    const naive = r.package.preTaxAnnual * 0.47;
    expect(r.package.taxSaved).toBeLessThan(naive);
  });

  it("versus a loan: the loan total less the lease total", () => {
    const r = run();
    expect(r.comparison.loan.totalCost - r.comparison.lease.totalCost).toBeCloseTo(
      r.comparison.savingVsLoan,
      6,
    );
  });

  it("versus a loan: defaults the loan rate to the lease rate plus 1.5", () => {
    const r = run({ interestRatePct: 7 });
    const explicit = run({ interestRatePct: 7, comparisonLoanRatePct: 8.5 });
    expect(r.comparison.loan.totalRepaid).toBeCloseTo(explicit.comparison.loan.totalRepaid, 6);
  });

  it("residual: is the stated percentage of the amount financed", () => {
    const r = run({ vehiclePrice: 60_000 });
    expect(r.finance.amountFinanced * (r.finance.residualPct / 100)).toBeCloseTo(
      r.finance.residual,
      6,
    );
  });

  it("interest: payments plus the residual, less what was financed", () => {
    const r = run({ vehiclePrice: 60_000 });
    expect(
      r.finance.totalPayments + r.finance.residual - r.finance.amountFinanced,
    ).toBeCloseTo(r.finance.totalInterest, 6);
  });

  it("interest: counts the residual, so it is not just payments less principal", () => {
    const r = run({ vehiclePrice: 60_000 });
    expect(r.finance.totalInterest).toBeGreaterThan(
      r.finance.totalPayments - r.finance.amountFinanced,
    );
  });

  it("gst: the credit on the car plus the GST on packaged running costs", () => {
    const r = run({ includeRunningCosts: true });
    expect(
      r.finance.gstCredit + r.running.total * config.gst.rate * r.term.years,
    ).toBeCloseTo(r.term.gstSaved, 6);
  });

  it("gst: only the car when running costs aren't packaged", () => {
    const r = run({ includeRunningCosts: false });
    expect(r.term.gstSaved).toBeCloseTo(r.finance.gstCredit, 6);
  });
});
