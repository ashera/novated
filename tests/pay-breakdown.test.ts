import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { calculateLease, defaultInputs, type LeaseInputs } from "@/lib/au/novated";

const config = DEFAULT_CONFIG;

/**
 * The shared pay breakdown.
 *
 * A link for the lease holder's accountant: what the salary-sacrifice line on
 * the payslip is made of. It is built with the salary zeroed, so that whoever
 * holds the link cannot read it — and that only works because every figure the
 * page shows is salary-independent.
 *
 * That is a load-bearing assumption rather than an observation. If a deduction
 * component ever started varying with salary, the shared page would quietly
 * begin printing different figures from the owner's own screen, and an
 * accountant reconciling against a payslip would be handed numbers that do not
 * match it. Hence this file.
 */
describe("Shared pay breakdown", () => {
  const lease = (over: Partial<LeaseInputs> = {}): LeaseInputs => ({
    ...defaultInputs(config),
    salary: 190_000,
    vehiclePrice: 54_000,
    onRoadCosts: 2_897,
    termYears: 5,
    annualKm: 10_000,
    interestRatePct: 8.72,
    includeRunningCosts: true,
    payCycle: "fortnightly",
    commencementDate: "2026-10-21",
    ...over,
  });

  /** Everything the breakdown puts in front of the reader. */
  const shown = (r: ReturnType<typeof calculateLease>) => ({
    preTax: r.package.preTaxAnnual,
    postTax: r.package.postTaxAnnual,
    financePayment: r.finance.annualPayment,
    monthly: r.finance.monthlyPayment,
    amountFinanced: r.finance.amountFinanced,
    residual: r.finance.residual,
    residualPct: r.finance.residualPct,
    totalInterest: r.finance.totalInterest,
    priceInclGst: r.finance.priceInclGst,
    gstCredit: r.finance.gstCredit,
    fuel: r.running.fuel,
    servicing: r.running.servicing,
    tyres: r.running.tyres,
    registration: r.running.registration,
    insurance: r.running.insurance,
    roadside: r.running.roadside,
    baseValue: r.fbt.baseValue,
    taxableValue: r.fbt.taxableValue,
    fbtPayable: r.fbt.fbtPayable,
    employeeContribution: r.fbt.employeeContribution,
    reportable: r.fbt.reportableFringeBenefit,
  });

  /*
   * The guarantee, across every combination that changes how the deduction is
   * put together: the FBT method, whether the car is exempt, and whether the
   * running costs are packaged at all.
   */
  it("shows the same figures with the salary stripped as with it present", () => {
    for (const fbtMethod of ["ecm", "employer-pays"] as const) {
      for (const fuelType of ["electric", "petrol"] as const) {
        for (const includeRunningCosts of [true, false]) {
          const over = { fbtMethod, fuelType, includeRunningCosts };
          const owner = shown(calculateLease(lease(over), config));
          const shared = shown(calculateLease(lease({ ...over, salary: 0 }), config));
          expect(shared, `${fbtMethod} / ${fuelType} / packaged=${includeRunningCosts}`).toEqual(
            owner,
          );
        }
      }
    }
  });

  it("holds across salaries, not just against zero", () => {
    const at = (salary: number) => shown(calculateLease(lease({ salary }), config));
    const base = at(190_000);
    for (const salary of [0, 45_000, 120_000, 500_000]) expect(at(salary)).toEqual(base);
  });

  /*
   * The other half of the promise: what the page leaves out really is absent
   * rather than merely unrendered. If these ever stopped depending on salary
   * the test above would pass for the wrong reason — it would no longer be
   * proving anything.
   */
  it("loses the tax position when the salary goes, as intended", () => {
    const owner = calculateLease(lease(), config);
    const shared = calculateLease(lease({ salary: 0 }), config);

    expect(owner.package.taxSaved).toBeGreaterThan(0);
    expect(shared.package.taxSaved).toBe(0);
    expect(shared.payslip.before.gross).toBe(0);
    expect(shared.superannuation.forgone).toBe(0);
  });

  /*
   * The per-cycle column is the one the accountant reconciles against, and it
   * is derived by division rather than carried separately — so it has to come
   * back to the annual figure exactly.
   */
  it("divides into the pay cycle without losing anything", () => {
    for (const payCycle of ["weekly", "fortnightly", "monthly"] as const) {
      const r = calculateLease(lease({ payCycle }), config);
      const cycles = { weekly: 52, fortnightly: 26, monthly: 12 }[payCycle];
      expect((r.package.preTaxAnnual / cycles) * cycles).toBeCloseTo(r.package.preTaxAnnual, 6);
    }
  });

  /*
   * The table's own arithmetic. Every row it prints has to add up to the total
   * it prints underneath them, or the document fails at the one job it has.
   */
  it("itemises to exactly the total it reports", () => {
    for (const fbtMethod of ["ecm", "employer-pays"] as const) {
      for (const fuelType of ["electric", "petrol"] as const) {
        for (const includeRunningCosts of [true, false]) {
          // Priced above the GST car limit as well as under it: the luxury car
          // charge is in the package and was missing from the column, which is
          // the defect this loop now covers.
          for (const vehiclePrice of [54_000, 120_000]) {
          const r = calculateLease(
            lease({ fbtMethod, fuelType, includeRunningCosts, vehiclePrice, salary: 0 }),
            config,
          );
          const adminFee = r.inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;
          /*
           * The cost rows the table prints — and deliberately NOT the employee
           * contribution, which is a slice of this total rather than another
           * item in it. Adding it here is exactly the bug this test was written
           * after: the column came to $25,912 under a stated total of $15,112.
           */
          const rows =
            r.finance.annualPayment +
            (includeRunningCosts ? r.running.total : 0) +
            adminFee +
            r.finance.luxuryCarAdjustment +
            r.fbt.fbtPayable;
          expect(
            rows,
            `${fbtMethod} / ${fuelType} / packaged=${includeRunningCosts} / $${vehiclePrice}`,
          ).toBeCloseTo(r.package.preTaxAnnual + r.package.postTaxAnnual, 6);
          }
        }
      }
    }
  });

  /* The charge has to actually arise in the fixture above, or that loop is
     only ever testing the cheap car twice. */
  it("puts a luxury car charge on a car above the GST limit", () => {
    const dear = calculateLease(lease({ vehiclePrice: 120_000, salary: 0 }), config);
    const cheap = calculateLease(lease({ vehiclePrice: 54_000, salary: 0 }), config);
    expect(dear.finance.luxuryCarAdjustment).toBeGreaterThan(0);
    expect(cheap.finance.luxuryCarAdjustment).toBe(0);
  });


  /*
   * The contribution method is the case that broke. On a car that is not
   * exempt it genuinely moves part of the deduction to the other side of tax,
   * and the table has to show that without double-counting it.
   */
  it("carves the employee contribution out of the total, not onto it", () => {
    const r = calculateLease(lease({ fbtMethod: "ecm", fuelType: "petrol", salary: 0 }), config);
    expect(r.fbt.employeeContribution).toBeGreaterThan(0);
    expect(r.package.postTaxAnnual).toBeCloseTo(r.fbt.employeeContribution, 6);

    const adminFee = r.inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;
    const grossCost = r.finance.annualPayment + r.running.total + adminFee + r.fbt.fbtPayable;
    // The contribution comes out of that, so the total is the cost itself.
    expect(r.package.preTaxAnnual + r.package.postTaxAnnual).toBeCloseTo(grossCost, 6);
    expect(r.package.preTaxAnnual).toBeCloseTo(grossCost - r.fbt.employeeContribution, 6);
  });
});
