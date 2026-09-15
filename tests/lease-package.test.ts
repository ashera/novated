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
  /**
   * Like-for-like means all three ending in the same place: owning the car,
   * free of it.
   *
   * Lease and loan both stop with the residual still owing and cash has
   * already paid it, so comparing a lease total that excluded the residual
   * against a cash total that included it made the lease look cheaper by
   * exactly that amount — while the chart said "all three leave the residual
   * owing", which was true of two of them.
   */
  it("compares against the same car, term and residual", () => {
    const r = run();
    expect(r.comparison.cash.upfront).toBe(r.finance.driveAwayTotal);
    expect(r.comparison.residualSettled).toBeCloseTo(r.finance.residual, 6);
  });

  /**
   * Everybody pays the stamp duty.
   *
   * The cash outlay and the loan principal were built from the car's price
   * alone, while the lease financed the drive-away total and repaid it with
   * interest. About $4,800 on an ordinary car, handed to the alternatives in
   * every comparison the site has ever drawn.
   *
   * Nothing caught it because every test in this file ran a car with no
   * on-road costs, where the two figures are the same number — which is the
   * whole reason these cases exist.
   *
   * The sharpest way to say it: how the drive-away price is SPLIT between the
   * car and its on-roads is a fact about FBT and the GST credit, so it may
   * move the lease. It cannot move what a cash buyer or a borrower pays,
   * because they buy the same thing either way.
   */
  describe("On-road costs", () => {
    const split = () => run({ vehiclePrice: 60_200, onRoadCosts: 4_800 });
    const whole = () => run({ vehiclePrice: 65_000, onRoadCosts: 0 });

    it("funds the alternatives identically however the drive-away price is split", () => {
      const a = split().comparison;
      const b = whole().comparison;
      // What the split cannot move is what has to be found to buy the thing:
      // $65,000 either way.
      expect(a.cash.upfront).toBeCloseTo(b.cash.upfront, 4);
      expect(a.cash.foregone).toBeCloseTo(b.cash.foregone, 4);
      // Two things it legitimately does move, so they are not asserted:
      // insurance is a percentage of the CAR's value, and on-roads carry no
      // GST credit — so the amount financed, and with it the residual the
      // loan's balloon mirrors, differ between the two.
    });

    it("makes the cash buyer pay the on-roads too", () => {
      const r = split();
      expect(r.comparison.cash.upfront).toBeCloseTo(r.finance.priceInclGst + 4_800, 4);
      expect(r.comparison.cash.upfront).toBeGreaterThan(r.finance.priceInclGst);
    });

    it("writes the loan over the drive-away total, not the car", () => {
      const withOnRoads = split().comparison.loan.totalRepaid;
      const without = run({ vehiclePrice: 60_200, onRoadCosts: 0 }).comparison.loan.totalRepaid;
      expect(withOnRoads).toBeGreaterThan(without);
    });

    it("charges the opportunity cost on everything laid out", () => {
      const r = split();
      const rate = config.benchmarks.opportunityRatePct / 100;
      expect(r.comparison.cash.foregone).toBeCloseTo(
        r.finance.driveAwayTotal * (Math.pow(1 + rate, r.inputs.termYears) - 1),
        4,
      );
    });

    /*
     * The bug in one line: adding on-roads used to cost the alternatives
     * nothing at all.
     *
     * Note what is NOT asserted here. The lease's lead does widen as on-roads
     * grow, and that is correct rather than suspicious: the lease buys them
     * with pre-tax dollars and a cash buyer with taxed ones. The invariant is
     * that they appear in every column, not that they favour nobody.
     */
    it("charges the alternatives for the on-roads at all", () => {
      const none = run({ vehiclePrice: 60_200, onRoadCosts: 0 }).comparison;
      const heavy = run({ vehiclePrice: 60_200, onRoadCosts: 6_000 }).comparison;
      // Same car, so running costs are identical and the whole difference is
      // the on-roads plus what the money would have earned.
      expect(heavy.cash.totalCost - none.cash.totalCost).toBeGreaterThan(6_000);
      expect(heavy.loan.totalCost - none.loan.totalCost).toBeGreaterThan(6_000);
    });
  });

  it("ends all three columns owning the car outright", () => {
    const r = run();
    // Lease and loan carry the residual; cash paid it with the purchase. The
    // lease also pays GST to take the car, which the other two already paid.
    expect(r.comparison.lease.totalCost).toBeCloseTo(
      r.package.netAnnualCost * r.inputs.termYears +
        r.finance.residual +
        r.comparison.residualGstOnBuyout,
      4,
    );
    expect(r.comparison.loan.totalCost).toBeGreaterThan(r.comparison.loan.totalRepaid);
  });

  /**
   * The GST the lease claimed on the car, handed back on the part it buys.
   *
   * Found by running a competitor's calculator beside ours on the same car:
   * every figure agreed to the dollar except the residual settlement, which
   * they charged GST on and we did not. They were right. The financier owns
   * the car for the whole term, so taking it at the end is a purchase — which
   * is why our own decoder has always asked for the residual GST-inclusive.
   * The calculator was granting the credit on the whole car and buying the
   * residual portion back tax-free.
   *
   * It is worth 10% of the residual, all of it in the lease's favour, and it
   * lands hardest against cash, which has no residual to settle at all.
   */
  it("charges the lease GST on buying the car at the end", () => {
    const r = run();
    expect(r.comparison.residualGstOnBuyout).toBeCloseTo(
      r.finance.residual * config.gst.rate,
      6,
    );
    // The invented saving: without it the lease came out exactly this much
    // cheaper than it is.
    const naive = r.package.netAnnualCost * r.inputs.termYears + r.finance.residual;
    expect(r.comparison.lease.totalCost - naive).toBeCloseTo(
      r.finance.residual * config.gst.rate,
      6,
    );
  });

  // The loan buyer owned the car from day one and paid GST in the price, so
  // their balloon is deferred principal and nothing else.
  it("does not charge the loan GST on its balloon", () => {
    const r = run();
    expect(r.comparison.loan.totalCost).toBeCloseTo(
      r.comparison.loan.totalRepaid +
        r.finance.residual +
        r.running.total * (1 + config.gst.rate) * r.inputs.termYears,
      4,
    );
  });

  it("leaves the lease-versus-loan gap alone, since both owe the same residual", () => {
    const r = run();
    const withoutResidual =
      r.comparison.loan.totalCost -
      r.finance.residual -
      (r.comparison.lease.totalCost - r.finance.residual);
    expect(r.comparison.savingVsLoan).toBeCloseTo(withoutResidual, 6);
  });

  it("reports the lease as cheaper for an exempt EV on a high salary", () => {
    const r = run({ salary: 200_000, fuelType: "electric", vehiclePrice: 60_000 });
    expect(r.comparison.savingVsLoan).toBeGreaterThan(0);
    expect(r.comparison.savingVsCash).toBeGreaterThan(0);
  });

  it("charges GST on running costs when the car is bought privately", () => {
    const r = run({ includeRunningCosts: true, opportunityRatePct: 0 });
    const runningInclGst = r.running.total * (1 + config.gst.rate) * r.inputs.termYears;
    expect(r.comparison.cash.totalCost).toBeCloseTo(
      r.finance.priceInclGst + runningInclGst,
      4,
    );
  });

  /**
   * Cash is not free, and this is the thing every cash-versus-finance
   * comparison published anywhere leaves out.
   *
   * Sixty thousand dollars spent on a car is sixty thousand not sitting in a
   * mortgage offset, where it would earn the home loan rate untaxed and
   * without risk. Omitting it flattered cash for the same reason omitting the
   * residual flattered the lease — the two corrections push opposite ways.
   */
  it("charges the cash column for what the money would otherwise have earned", () => {
    const free = run({ opportunityRatePct: 0 });
    const costed = run({ opportunityRatePct: 6 });
    expect(free.comparison.cash.foregone).toBe(0);
    expect(costed.comparison.cash.foregone).toBeGreaterThan(0);
    expect(costed.comparison.cash.totalCost).toBeGreaterThan(free.comparison.cash.totalCost);
  });

  it("compounds it rather than charging simple interest", () => {
    const r = run({ opportunityRatePct: 6 });
    const simple = r.finance.priceInclGst * 0.06 * r.inputs.termYears;
    expect(r.comparison.cash.foregone).toBeGreaterThan(simple);
  });

  it("leaves the loan and lease columns untouched by it", () => {
    const free = run({ opportunityRatePct: 0 });
    const costed = run({ opportunityRatePct: 6 });
    expect(costed.comparison.loan.totalCost).toBeCloseTo(free.comparison.loan.totalCost, 6);
    expect(costed.comparison.lease.totalCost).toBeCloseTo(free.comparison.lease.totalCost, 6);
  });

  it("accepts zero, because some people really do have the cash idle", () => {
    expect(run({ opportunityRatePct: 0 }).comparison.cash.foregone).toBe(0);
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
      r.finance.gstCredit -
        r.finance.residual * config.gst.rate +
        r.running.total * config.gst.rate * r.inputs.termYears,
      4,
    );
  });

  it("counts only the vehicle GST when running costs aren't packaged", () => {
    const r = run({ includeRunningCosts: false });
    expect(r.term.gstSaved).toBeCloseTo(
      r.finance.gstCredit - r.finance.residual * config.gst.rate,
      4,
    );
  });

  // "GST you avoid" has to be GST actually avoided. The credit on the car is
  // only kept on the part of it the lease consumes; the residual is bought,
  // and bought things carry GST.
  it("nets the GST paid on the buyout out of the GST saved", () => {
    const r = run({ includeRunningCosts: false });
    expect(r.term.gstSaved).toBeLessThan(r.finance.gstCredit);
    expect(r.finance.gstCredit - r.term.gstSaved).toBeCloseTo(
      r.finance.residual * config.gst.rate,
      6,
    );
  });

  it("surfaces the residual as a separate obligation, not part of the running cost", () => {
    const r = run();
    // What has to be found on the day, GST and all — a quote states it this
    // way, and so does the decoder.
    expect(r.term.residualPayable).toBeCloseTo(r.finance.residual * (1 + config.gst.rate), 6);
    expect(r.term.residualPayable).toBeGreaterThan(r.finance.residual);
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

  it("versus a loan: defaults the loan rate to the car loan benchmark", () => {
    const r = run({ interestRatePct: 7 });
    const explicit = run({ interestRatePct: 7, comparisonLoanRatePct: config.benchmarks.loanRatePct });
    expect(r.comparison.loan.ratePct).toBe(config.benchmarks.loanRatePct);
    expect(r.comparison.loan.totalRepaid).toBeCloseTo(explicit.comparison.loan.totalRepaid, 6);
  });

  it("versus a loan: an explicit rate is used as given", () => {
    const r = run({ comparisonLoanRatePct: 11 });
    expect(r.comparison.loan.ratePct).toBe(11);
  });

  /**
   * The comparison must be able to say the lease lost.
   *
   * The loan rate used to be the lease's own rate plus 1.5, so a terrible
   * quote dragged the loan up with it and the lease kept its advantage no
   * matter how bad it got. The one finding a reader most needs — this rate is
   * bad enough that a bank beats it — could not appear at any rate, on a site
   * whose whole claim is that it has no stake in the answer.
   */
  it("versus a loan: the loan rate does not follow the lease rate", () => {
    const cheap = run({ interestRatePct: 5 });
    const dear = run({ interestRatePct: 15 });
    expect(cheap.comparison.loan.ratePct).toBe(dear.comparison.loan.ratePct);
    expect(cheap.comparison.loan.totalCost).toBeCloseTo(dear.comparison.loan.totalCost, 6);
  });

  it("versus a loan: a bad enough lease rate loses to the loan", () => {
    // At some rate the lease must stop winning. If it never does, whatever
    // the inputs, the comparison is decorative.
    expect(run({ fuelType: "petrol", interestRatePct: 20 }).comparison.savingVsLoan).toBeLessThan(0);
    expect(run({ interestRatePct: 30 }).comparison.savingVsLoan).toBeLessThan(0);
  });

  /**
   * How much a bad rate an exemption buys you.
   *
   * The default car is an FBT-exempt EV and survives a much worse finance
   * rate than a petrol car does before a loan overtakes it — the exemption is
   * simply worth more than the interest. Worth pinning, because it is the
   * honest shape of the trade: an exemption is not a licence to accept any
   * rate, it just moves the point where accepting one stops paying.
   */
  it("versus a loan: an exempt car tolerates a worse rate than a packaged petrol one", () => {
    const at = (o: Partial<LeaseInputs>) => run({ interestRatePct: 20, ...o }).comparison.savingVsLoan;
    expect(at({})).toBeGreaterThan(0); // exempt EV still ahead at 20%
    expect(at({ fuelType: "petrol" })).toBeLessThan(0); // petrol already behind
  });

  it("versus a loan: a worse lease rate never widens the lease's lead", () => {
    let previous = Infinity;
    for (const interestRatePct of [4, 6, 8, 10, 12, 14, 16]) {
      const saving = run({ interestRatePct }).comparison.savingVsLoan;
      expect(saving).toBeLessThan(previous);
      previous = saving;
    }
  });

  // The decoder tells people a comparable secured car loan costs
  // benchmarks.loanRatePct and names the figure. Costing this column at
  // anything else makes the two pages disagree about the same loan.
  it("versus a loan: uses the same benchmark the decoder quotes", () => {
    expect(run().comparison.loan.ratePct).toBe(config.benchmarks.loanRatePct);
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

  it("gst: the car, plus packaged running costs, less the buyout", () => {
    const r = run({ includeRunningCosts: true });
    expect(
      r.finance.gstCredit -
        r.comparison.residualGstOnBuyout +
        r.running.total * config.gst.rate * r.term.years,
    ).toBeCloseTo(r.term.gstSaved, 6);
  });

  it("gst: the car less the buyout when running costs aren't packaged", () => {
    const r = run({ includeRunningCosts: false });
    expect(r.term.gstSaved).toBeCloseTo(
      r.finance.gstCredit - r.comparison.residualGstOnBuyout,
      6,
    );
  });
});

describe("The payslip the locked quote produces", () => {
  // Every row on screen has to come from the engine, and the columns have to
  // add up the way a real payslip does — otherwise someone takes it to
  // payroll and it doesn't match.
  it("taxable pay is gross less the pre-tax deduction", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 50_000 });
    expect(r.payslip.before.gross).toBeCloseTo(base.salary, 6);
    expect(r.payslip.after.gross).toBeCloseTo(base.salary - r.package.preTaxAnnual, 6);
  });

  it("each column's rows add down to the net it shows", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 50_000, hasHelpDebt: true });
    for (const side of [r.payslip.before, r.payslip.after]) {
      expect(side.gross - side.incomeTax - side.medicare - side.help).toBeCloseTo(side.net, 6);
    }
  });

  it("what lands in the account is the after-tax net less the post-tax contribution", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 50_000 });
    expect(r.payslip.after.net - r.package.postTaxAnnual).toBeCloseTo(r.package.takeHomeAfter, 6);
    expect(r.payslip.before.net).toBeCloseTo(r.package.takeHomeBefore, 6);
  });

  it("the tax the payslip stops paying is the saving reported above it", () => {
    const r = run({ fuelType: "electric", vehiclePrice: 50_000, hasHelpDebt: false });
    const taxBefore = r.payslip.before.incomeTax + r.payslip.before.medicare + r.payslip.before.help;
    const taxAfter = r.payslip.after.incomeTax + r.payslip.after.medicare + r.payslip.after.help;
    expect(taxBefore - taxAfter).toBeCloseTo(r.package.taxSaved, 6);
  });

  // The uncomfortable one the payslip has to be honest about: a study loan
  // repayment can RISE, because the reportable fringe benefit counts towards
  // repayment income even though taxable income fell.
  it("shows a study-loan repayment that rises rather than hiding it", () => {
    // An exempt EV is the case where this bites: no FBT to pay, and no
    // employee contribution, but the benefit is still REPORTABLE — so
    // repayment income goes up while taxable income goes down. (A petrol car
    // on the employee contribution method has a nil taxable value, so nothing
    // is reportable at all.)
    const r = run({ fuelType: "electric", vehiclePrice: 55_000, hasHelpDebt: true, salary: 110_000 });
    expect(r.fbt.exempt).toBe(true);
    expect(r.fbt.reportableFringeBenefit).toBeGreaterThan(0);
    // The engine applies it to the packaged side only — which is exactly what
    // the payslip's "rises" hint is reporting.
    const plain = takeHome(110_000 - r.package.preTaxAnnual, config, { hasHelpDebt: true });
    expect(r.payslip.after.help).toBeGreaterThan(plain.help);
  });
});

describe("What the pre-tax deduction explainer itemises", () => {
  // The modal lists the parts and then claims a total. If the engine ever
  // packages something the list doesn't mention, the total stops matching the
  // parts and the explanation quietly becomes wrong — so the list is asserted
  // here rather than trusted.
  const parts = (r: ReturnType<typeof run>) =>
    r.finance.annualPayment +
    (r.inputs.includeRunningCosts ? r.running.total : 0) +
    (r.inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual) +
    r.finance.luxuryCarAdjustment +
    r.fbt.fbtPayable;

  it("adds up to everything packaged, on an exempt EV", () => {
    const r = run({ fuelType: "electric", vehiclePrice: 55_000 });
    expect(parts(r)).toBeCloseTo(r.package.preTaxAnnual + r.package.postTaxAnnual, 6);
  });

  it("adds up with an employee contribution in play", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 55_000, fbtMethod: "ecm" });
    expect(r.package.postTaxAnnual).toBeGreaterThan(0);
    expect(parts(r)).toBeCloseTo(r.package.preTaxAnnual + r.package.postTaxAnnual, 6);
  });

  it("adds up when the employer pays the FBT instead", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 55_000, fbtMethod: "employer-pays" });
    expect(r.fbt.fbtPayable).toBeGreaterThan(0);
    expect(parts(r)).toBeCloseTo(r.package.preTaxAnnual + r.package.postTaxAnnual, 6);
  });

  it("adds up above the car limit, where the luxury charge appears", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 120_000 });
    expect(r.finance.luxuryCarAdjustment).toBeGreaterThan(0);
    expect(parts(r)).toBeCloseTo(r.package.preTaxAnnual + r.package.postTaxAnnual, 6);
  });

  it("adds up with running costs left out of the package", () => {
    const r = run({ includeRunningCosts: false });
    expect(parts(r)).toBeCloseTo(r.package.preTaxAnnual + r.package.postTaxAnnual, 6);
  });

  it("and the pre-tax side is what the payslip taxes you on", () => {
    const r = run({ fuelType: "petrol", vehiclePrice: 55_000 });
    expect(r.payslip.after.gross).toBeCloseTo(r.inputs.salary - r.package.preTaxAnnual, 6);
  });
});

describe("The payslip's two summaries are the same quantity", () => {
  // The bug: "Tax you don't pay on it" in one card and "Your tax falls by" in
  // the note below it are the same thing, but were reached by two different
  // chains — one from the packaged parts, one from the tax rows — and each
  // rounded at a different point, so they disagreed on screen.
  //
  // The relationship they both rest on, which is exact in the engine:
  //   everything packaged − what actually leaves your pay = the tax saved
  const check = (o: Partial<LeaseInputs>) => {
    const r = run(o);
    const packaged = r.package.preTaxAnnual + r.package.postTaxAnnual;
    expect(packaged - r.package.takeHomeReduction).toBeCloseTo(r.package.taxSaved, 6);
  };

  it("holds on an exempt EV", () => check({ fuelType: "electric", vehiclePrice: 55_000 }));
  it("holds with an employee contribution", () =>
    check({ fuelType: "petrol", vehiclePrice: 55_000, fbtMethod: "ecm" }));
  it("holds when the employer pays the FBT", () =>
    check({ fuelType: "petrol", vehiclePrice: 55_000, fbtMethod: "employer-pays" }));
  it("holds with a study loan, where the repayment rises", () =>
    check({ fuelType: "electric", vehiclePrice: 55_000, hasHelpDebt: true }));
  it("holds with running costs outside the package", () =>
    check({ includeRunningCosts: false }));
  it("holds above the car limit", () => check({ vehiclePrice: 120_000 }));
});
