import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { calculateLease, defaultInputs, type LeaseInputs } from "@/lib/au/novated";
import { div293Tax, takeHome, totalTax } from "@/lib/au/tax";

const config = DEFAULT_CONFIG;
const tax = config.tax;
const d293 = tax.div293!;

/**
 * Division 293 — the extra 15% on concessional super contributions.
 *
 * It earns a place in a novated lease calculator for one reason: packaging
 * moves both sides of its income test at once. Salary sacrificed pulls the
 * test down, the reportable fringe benefit pushes it back up, and employer
 * super falls with the sacrificed salary unless an agreement says otherwise.
 * Which effect wins is not guessable from the salary alone, which is why the
 * engine measures it rather than assuming a direction.
 */
describe("Division 293 tax", () => {
  describe("the charge itself", () => {
    it("is nil below the threshold", () => {
      expect(div293Tax(d293.threshold - 50_000, 20_000, tax)).toBe(0);
    });

    it("phases in from the threshold rather than hitting as a cliff", () => {
      // Someone $1,000 over pays 15% of $1,000 — not of their whole
      // contribution. The difference at the boundary is the whole design.
      const contributions = 30_000;
      const justOver = d293.threshold - contributions + 1_000;
      expect(div293Tax(justOver, contributions, tax)).toBeCloseTo(1_000 * d293.rate, 6);
    });

    it("never charges more than the contributions themselves", () => {
      // Far above the threshold the excess exceeds the contributions, and it
      // is the contributions that are being taxed.
      const contributions = 30_000;
      const wayOver = d293.threshold * 2;
      expect(div293Tax(wayOver, contributions, tax)).toBeCloseTo(contributions * d293.rate, 6);
    });

    it("is continuous across the threshold", () => {
      // No step: a dollar more income must not cost hundreds more tax.
      const contributions = 30_000;
      const at = d293.threshold - contributions;
      const step = div293Tax(at + 1, contributions, tax) - div293Tax(at, contributions, tax);
      expect(step).toBeLessThan(1);
      expect(step).toBeGreaterThanOrEqual(0);
    });

    it("cannot bite without contributions to tax", () => {
      expect(div293Tax(d293.threshold * 3, 0, tax)).toBe(0);
    });

    it("is skipped entirely by a config that predates it", () => {
      // The field is optional so a stored config written before this existed
      // still loads, and must behave exactly as it did then.
      const older = { ...tax, div293: undefined };
      expect(div293Tax(d293.threshold * 2, 30_000, older)).toBe(0);
    });
  });

  describe("where it sits in a tax position", () => {
    const opts = { concessionalContributions: 30_000 };
    const high = () => takeHome(d293.threshold, config, opts);

    it("counts towards total tax", () => {
      const t = high();
      expect(t.div293).toBeGreaterThan(0);
      expect(totalTax(t)).toBeCloseTo(t.incomeTax + t.medicare + t.help + t.div293, 6);
    });

    /*
     * The payslip invariant. Division 293 is assessed after the year ends and
     * paid separately or released from the fund — it is not withheld from pay,
     * so it must not appear in the figure a payslip is laid out from.
     */
    it("does not come out of take-home pay", () => {
      const t = high();
      expect(t.net).toBeCloseTo(t.gross - t.incomeTax - t.medicare - t.help, 6);
      expect(t.net).not.toBeCloseTo(t.gross - totalTax(t), 6);
    });

    it("is driven by reportable fringe benefits, not just salary", () => {
      const without = takeHome(d293.threshold - 40_000, config, opts);
      const with_ = takeHome(d293.threshold - 40_000, config, {
        ...opts,
        div293IncomeExtra: 40_000,
      });
      expect(with_.div293).toBeGreaterThan(without.div293);
    });
  });

  describe("what packaging a car does to it", () => {
    /**
     * The real quote this was built against: a $38,554 EV on $245,000.
     *
     * Its own running costs, not the modelled ones. That is not incidental —
     * the direction Division 293 moves depends on the size of the pre-tax
     * deduction against a reportable benefit that does not grow with it, so a
     * cheaper package genuinely flips the answer. Substituting defaults here
     * would test a different lease and quietly lose the case.
     */
    const lease = (over: Partial<LeaseInputs> = {}): LeaseInputs => ({
      ...defaultInputs(config),
      salary: 245_000,
      vehiclePrice: 38_554,
      onRoadCosts: 1_946,
      fuelType: "electric",
      termYears: 4,
      annualKm: 12_000,
      interestRatePct: 9.5,
      residualPct: 37.5,
      includeRunningCosts: true,
      adminFeeAnnual: 239.98,
      runningCostOverrides: {
        servicing: 710,
        tyres: 0,
        registration: 900,
        fuel: 656.4,
        insurance: 1_818,
        roadside: 0,
      },
      commencementDate: "2026-10-21",
      ...over,
    });

    it("reaches a salary this high at all", () => {
      const r = calculateLease(lease(), config);
      expect(r.payslip.before.div293).toBeGreaterThan(0);
    });

    it("leaves a modest salary untouched", () => {
      const r = calculateLease(lease({ salary: 120_000 }), config);
      expect(r.payslip.before.div293).toBe(0);
      expect(r.payslip.after.div293).toBe(0);
    });

    /*
     * On this quote the packaging costs Division 293 rather than saving it.
     *
     * The reportable benefit is the grossed-up value of the car and does not
     * shrink with what is sacrificed, so on a modestly packaged exempt EV it
     * is simply the bigger number: income for the test goes up even as taxable
     * income goes down. Every headline on the quote says "saving" while this
     * moves the other way, which is the reason it is worth reporting at all.
     */
    it("costs more than it saves on this quote", () => {
      const r = calculateLease(lease(), config);
      expect(r.fbt.reportableFringeBenefit).toBeGreaterThan(r.package.preTaxAnnual);
      expect(r.payslip.after.div293).toBeGreaterThan(r.payslip.before.div293);
    });

    /*
     * An employment agreement that protects super makes it worse, always.
     *
     * Not a contradiction of the above: super paid on pre-sacrifice earnings
     * is unambiguously good for the employee, but it removes the one term that
     * was pulling Division 293 down. The benefit shows up as contributions
     * kept, not as tax avoided — which is exactly why the two have to be read
     * together rather than netted into one "saving".
     */
    it("is higher where the employer pays super on pre-sacrifice earnings", () => {
      const followsSalary = calculateLease(lease(), config);
      const preSacrifice = calculateLease(lease({ employerPaysSuperOnPreSacrifice: true }), config);
      expect(preSacrifice.payslip.after.div293).toBeGreaterThan(followsSalary.payslip.after.div293);
      // And the compensation for it is real, in the other column.
      expect(preSacrifice.superannuation.forgone).toBe(0);
      expect(followsSalary.superannuation.forgone).toBeGreaterThan(0);
    });

    /*
     * The direction is not fixed, so the engine must not assume one.
     *
     * Package enough running cost against the same car and the salary
     * sacrificed overtakes the reportable benefit, at which point Division 293
     * falls instead. Same car, same salary, same employer — opposite sign.
     */
    it("falls instead once the package outgrows the reportable benefit", () => {
      const dear = calculateLease(
        lease({
          runningCostOverrides: {
            servicing: 2_500,
            tyres: 1_200,
            registration: 1_400,
            fuel: 2_600,
            insurance: 4_200,
            roadside: 300,
          },
        }),
        config,
      );
      expect(dear.package.preTaxAnnual).toBeGreaterThan(dear.fbt.reportableFringeBenefit);
      expect(dear.payslip.after.div293).toBeLessThan(dear.payslip.before.div293);
    });

    /*
     * What the liability actually turns on, stated as arithmetic.
     *
     * Packaging changes Division 293 income by the reportable benefit LESS the
     * salary sacrificed, and changes the contributions being taxed by whatever
     * employer super is forgone. Both sit inside the phase-in band at this
     * salary, so the whole movement is 15% of their sum. Pinning the
     * relationship rather than the dollar figure means it survives a rate or
     * threshold change but still fails if a term goes missing or flips sign.
     */
    it("moves by 15% of the benefit added, less the salary and super removed", () => {
      for (const preSacrifice of [false, true]) {
        const r = calculateLease(
          lease({ employerPaysSuperOnPreSacrifice: preSacrifice }),
          config,
        );
        const movedIncome = r.fbt.reportableFringeBenefit - r.package.preTaxAnnual;
        const movedContributions = -r.superannuation.forgone;
        const expected = (movedIncome + movedContributions) * d293.rate;
        const actual = r.payslip.after.div293 - r.payslip.before.div293;
        expect(actual).toBeCloseTo(expected, 2);
      }
    });

    it("is counted in the relief, not just reported beside it", () => {
      // If it were computed for display only, the two would be identical.
      const withIt = calculateLease(lease({ employerPaysSuperOnPreSacrifice: true }), config);
      const bare = calculateLease(
        lease({ employerPaysSuperOnPreSacrifice: true }),
        { ...config, tax: { ...config.tax, div293: undefined } },
      );
      expect(withIt.package.netAnnualCost).toBeGreaterThan(bare.package.netAnnualCost);
    });

    it("says so, and says which way it went", () => {
      const up = calculateLease(lease(), config).warnings.find((w) =>
        w.includes("Division 293"),
      )!;
      expect(up).toMatch(/adds/);

      const down = calculateLease(
        lease({
          runningCostOverrides: {
            servicing: 2_500,
            tyres: 1_200,
            registration: 1_400,
            fuel: 2_600,
            insurance: 4_200,
            roadside: 300,
          },
        }),
        config,
      ).warnings.find((w) => w.includes("Division 293"))!;
      expect(down).toMatch(/reduces/);
    });

    it("stays quiet for somebody it cannot reach", () => {
      const r = calculateLease(lease({ salary: 120_000 }), config);
      expect(r.warnings.some((w) => w.includes("Division 293"))).toBe(false);
    });
  });
});
