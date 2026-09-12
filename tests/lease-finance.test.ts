import { describe, it, expect } from "vitest";
import { AU_STATES, DEFAULT_CONFIG } from "@/lib/au/config";
import {
  amortisationSchedule,
  annuityPayment,
  buildFinance,
  calculateLease,
  buildRunningCosts,
  luxuryCarTax,
  defaultInputs,
  type LeaseInputs,
} from "@/lib/au/novated";

const config = DEFAULT_CONFIG;
const base = defaultInputs(config);
const withInputs = (o: Partial<LeaseInputs>): LeaseInputs => ({ ...base, ...o });

describe("Lease finance", () => {
  it("amortises to zero over the term when there is no balloon", () => {
    // A plain 12-month interest-free loan: twelve equal payments.
    expect(annuityPayment(12_000, 0, 0, 12)).toBeCloseTo(1_000, 6);
  });

  it("only amortises the gap between the principal and the balloon", () => {
    // Interest-free with a balloon: only the difference is spread across the term.
    expect(annuityPayment(50_000, 20_000, 0, 60)).toBeCloseTo(500, 6);
  });

  it("charges more per month at a higher interest rate", () => {
    const cheap = annuityPayment(50_000, 20_000, 5, 60);
    const dear = annuityPayment(50_000, 20_000, 10, 60);
    expect(dear).toBeGreaterThan(cheap);
  });

  it("leaves exactly the balloon outstanding at the end of the term", () => {
    // Replay the amortisation month by month; the closing balance must be the balloon.
    const principal = 50_000;
    const balloon = 14_000;
    const ratePct = 7.5;
    const months = 60;
    const pmt = annuityPayment(principal, balloon, ratePct, months);
    let bal = principal;
    for (let m = 0; m < months; m++) bal = bal * (1 + ratePct / 100 / 12) - pmt;
    expect(bal).toBeCloseTo(balloon, 4);
  });

  it("returns no payment for a zero-length term", () => {
    expect(annuityPayment(50_000, 0, 7, 0)).toBe(0);
  });
});

describe("Vehicle pricing", () => {
  it("removes the GST the financier claims back from the amount financed", () => {
    const f = buildFinance(withInputs({ vehiclePrice: 55_000 }), config);
    expect(f.gstCredit).toBeCloseTo(55_000 - 55_000 / 1.1, 4);
    expect(f.amountFinanced).toBeCloseTo(50_000, 4);
  });

  it("caps the GST credit at the car limit", () => {
    const f = buildFinance(withInputs({ vehiclePrice: 120_000 }), config);
    const capped = config.gst.carLimit - config.gst.carLimit / 1.1;
    expect(f.gstCredit).toBeCloseTo(capped, 4);
    // Everything above the limit stays in the amount financed, GST and all.
    expect(f.amountFinanced).toBeCloseTo(120_000 - capped, 4);
  });

  it("uses the ATO minimum residual for the term when none is given", () => {
    for (const years of [1, 2, 3, 4, 5]) {
      const f = buildFinance(withInputs({ termYears: years }), config);
      expect(f.residualPct).toBe(config.lease.residualMinPct[String(years)]);
      expect(f.residual).toBeCloseTo(f.amountFinanced * (f.residualPct / 100), 4);
    }
  });

  it("honours an explicit residual over the ATO minimum", () => {
    const f = buildFinance(withInputs({ termYears: 5, residualPct: 40 }), config);
    expect(f.residualPct).toBe(40);
  });

  it("leaves a shorter term with a higher residual and a longer one with a lower residual", () => {
    const short = buildFinance(withInputs({ termYears: 1 }), config);
    const long = buildFinance(withInputs({ termYears: 5 }), config);
    expect(short.residual).toBeGreaterThan(long.residual);
  });

  it("charges no luxury car tax below the threshold", () => {
    expect(luxuryCarTax(60_000, "petrol", config)).toBe(0);
    expect(luxuryCarTax(85_000, "electric", config)).toBe(0);
  });

  it("charges luxury car tax on the GST-exclusive excess above the threshold", () => {
    const price = 100_000;
    const excess = price - config.lct.thresholdOther;
    expect(luxuryCarTax(price, "petrol", config)).toBeCloseTo(
      (excess / 1.1) * config.lct.rate,
      4,
    );
  });

  it("applies the higher threshold to fuel-efficient vehicles", () => {
    // A price between the two thresholds: taxed as a petrol car, exempt as an EV.
    const between = (config.lct.thresholdOther + config.lct.thresholdFuelEfficient) / 2;
    expect(luxuryCarTax(between, "petrol", config)).toBeGreaterThan(0);
    expect(luxuryCarTax(between, "electric", config)).toBe(0);
  });
});

describe("Running costs", () => {
  it("scales fuel with the distance driven", () => {
    const low = buildRunningCosts(withInputs({ fuelType: "petrol", annualKm: 10_000 }), config);
    const high = buildRunningCosts(withInputs({ fuelType: "petrol", annualKm: 20_000 }), config);
    expect(high.fuel).toBeCloseTo(low.fuel * 2, 4);
  });

  it("charges an electric vehicle less to run than a petrol one", () => {
    const petrol = buildRunningCosts(withInputs({ fuelType: "petrol" }), config);
    const ev = buildRunningCosts(withInputs({ fuelType: "electric" }), config);
    expect(ev.fuel).toBeLessThan(petrol.fuel);
    expect(ev.servicing).toBeLessThan(petrol.servicing);
    expect(ev.total).toBeLessThan(petrol.total);
  });

  it("budgets packaged running costs excluding GST", () => {
    const km = 15_000;
    const r = buildRunningCosts(withInputs({ fuelType: "petrol", annualKm: km }), config);
    const inclGst =
      (km / 100) * config.running.fuel.litresPer100km * config.running.fuel.pricePerLitre;
    expect(r.fuel).toBeCloseTo(inclGst / 1.1, 4);
  });

  it("keeps registration out of the GST adjustment", () => {
    const r = buildRunningCosts(base, config);
    expect(r.registration).toBe(config.running.registrationAnnual);
  });

  it("lets a real quote override a modelled component", () => {
    const r = buildRunningCosts(
      withInputs({ runningCostOverrides: { insurance: 2_400 } }),
      config,
    );
    expect(r.insurance).toBe(2_400);
    expect(r.total).toBeCloseTo(
      r.fuel + r.servicing + r.tyres + r.registration + r.insurance + r.roadside,
      4,
    );
  });

  it("floors the insurance premium for a cheap car", () => {
    const r = buildRunningCosts(withInputs({ vehiclePrice: 15_000 }), config);
    expect(r.insurance).toBeCloseTo(config.running.insurance.minAnnual / 1.1, 4);
  });

  it("totals to the sum of its parts", () => {
    const r = buildRunningCosts(base, config);
    expect(r.total).toBeCloseTo(
      r.fuel + r.servicing + r.tyres + r.registration + r.insurance + r.roadside,
      6,
    );
  });
});

describe("State-based registration", () => {
  it("uses the national default when no state is given", () => {
    const r = buildRunningCosts(base, config);
    expect(r.registration).toBe(config.running.registrationAnnual);
  });

  it("uses the state's own figure when one is given", () => {
    for (const state of ["NSW", "VIC", "WA"] as const) {
      const r = buildRunningCosts(withInputs({ state }), config);
      expect(r.registration).toBe(config.running.registrationByState[state]);
    }
  });

  it("separates the cheapest state from the dearest", () => {
    const wa = buildRunningCosts(withInputs({ state: "WA" }), config).total;
    const nsw = buildRunningCosts(withInputs({ state: "NSW" }), config).total;
    expect(wa).toBeLessThan(nsw);
  });

  it("has a figure for every state, and none of them silly", () => {
    for (const state of AU_STATES) {
      const v = config.running.registrationByState[state];
      expect(Number.isFinite(v), `${state} missing`).toBe(true);
      expect(v).toBeGreaterThan(200);
      expect(v).toBeLessThan(2_000);
    }
  });

  it("still honours an explicit override over the state figure", () => {
    const r = buildRunningCosts(
      withInputs({ state: "NSW", runningCostOverrides: { registration: 1_234 } }),
      config,
    );
    expect(r.registration).toBe(1_234);
  });
});

describe("Per-model consumption", () => {
  it("uses the class average when no vehicle is chosen", () => {
    const r = buildRunningCosts(withInputs({ fuelType: "electric", annualKm: 15_000 }), config);
    const expected =
      (15_000 / 100) * config.running.fuel.kwhPer100km * config.running.fuel.pricePerKwh;
    expect(r.fuel).toBeCloseTo(expected / 1.1, 4);
  });

  it("uses the model's own figure when one is given", () => {
    // A Model 3 at 13.2 kWh/100km against the 16.5 class average is a real gap.
    const r = buildRunningCosts(
      withInputs({ fuelType: "electric", annualKm: 15_000, consumptionPer100km: 13.2 }),
      config,
    );
    const expected = (15_000 / 100) * 13.2 * config.running.fuel.pricePerKwh;
    expect(r.fuel).toBeCloseTo(expected / 1.1, 4);
  });

  it("reads the figure as litres for a petrol car and kWh for an electric one", () => {
    // The same number means different things — 8 L/100km and 8 kWh/100km are
    // priced from different rates, and confusing them would be silent.
    const petrol = buildRunningCosts(
      withInputs({ fuelType: "petrol", annualKm: 15_000, consumptionPer100km: 8 }),
      config,
    );
    const ev = buildRunningCosts(
      withInputs({ fuelType: "electric", annualKm: 15_000, consumptionPer100km: 8 }),
      config,
    );
    expect(petrol.fuel).toBeCloseTo((15_000 / 100) * 8 * config.running.fuel.pricePerLitre / 1.1, 4);
    expect(ev.fuel).toBeCloseTo((15_000 / 100) * 8 * config.running.fuel.pricePerKwh / 1.1, 4);
    expect(petrol.fuel).toBeGreaterThan(ev.fuel);
  });

  it("separates a thirsty EV from a frugal one", () => {
    const frugal = buildRunningCosts(withInputs({ fuelType: "electric", consumptionPer100km: 13.2 }), config);
    const thirsty = buildRunningCosts(withInputs({ fuelType: "electric", consumptionPer100km: 22 }), config);
    expect(thirsty.fuel).toBeGreaterThan(frugal.fuel * 1.5);
  });
});

/**
 * The arithmetic the calculator's "Where these numbers come from" explainer
 * spells out to the user, line by line.
 *
 * Prose cannot be type-checked, so this is the only thing standing between a
 * changed formula and an explanation that quietly starts lying — which would
 * be worse than no explanation at all, on a page whose entire argument is
 * that it shows its working. If one of these fails, fix the wording in
 * components/DeductionExplainer.tsx, not the expectation.
 */
describe("What the deduction explainer promises", () => {
  const r = config.running;
  const exGst = (x: number) => x / (1 + config.gst.rate);
  const km = 15_000;

  it("charging: km ÷ 100 × kWh/100km × price per kWh, less GST", () => {
    const costs = buildRunningCosts(withInputs({ fuelType: "electric", annualKm: km }), config);
    expect(costs.fuel).toBeCloseTo(
      exGst((km / 100) * r.fuel.kwhPer100km * r.fuel.pricePerKwh),
      6,
    );
  });

  it("fuel: km ÷ 100 × L/100km × price per litre, less GST", () => {
    const costs = buildRunningCosts(withInputs({ fuelType: "petrol", annualKm: km }), config);
    expect(costs.fuel).toBeCloseTo(
      exGst((km / 100) * r.fuel.litresPer100km * r.fuel.pricePerLitre),
      6,
    );
  });

  it("charging uses the model's own consumption when the catalogue knows it", () => {
    const own = 14.9;
    const costs = buildRunningCosts(
      withInputs({ fuelType: "electric", annualKm: km, consumptionPer100km: own }),
      config,
    );
    expect(costs.fuel).toBeCloseTo(exGst((km / 100) * own * r.fuel.pricePerKwh), 6);
  });

  it("servicing: annual base + km × per-km, less GST", () => {
    const costs = buildRunningCosts(withInputs({ fuelType: "petrol", annualKm: km }), config);
    expect(costs.servicing).toBeCloseTo(
      exGst(r.servicing.annualBase + km * r.servicing.perKm),
      6,
    );
  });

  it("servicing: an EV takes the multiplier on top", () => {
    const costs = buildRunningCosts(withInputs({ fuelType: "electric", annualKm: km }), config);
    expect(costs.servicing).toBeCloseTo(
      exGst((r.servicing.annualBase + km * r.servicing.perKm) * r.servicing.evMultiplier),
      6,
    );
  });

  it("tyres: km ÷ km-per-set × cost of a set, less GST", () => {
    const costs = buildRunningCosts(withInputs({ annualKm: km }), config);
    expect(costs.tyres).toBeCloseTo(exGst((km / r.tyres.kmPerSet) * r.tyres.setCost), 6);
  });

  it("insurance: a percentage of the price, with a floor, less GST", () => {
    const dear = buildRunningCosts(withInputs({ vehiclePrice: 90_000 }), config);
    expect(dear.insurance).toBeCloseTo(exGst(90_000 * (r.insurance.pctOfValue / 100)), 6);
    const cheap = buildRunningCosts(withInputs({ vehiclePrice: 5_000 }), config);
    expect(cheap.insurance).toBeCloseTo(exGst(r.insurance.minAnnual), 6);
  });

  it("roadside: a flat annual figure, less GST", () => {
    expect(buildRunningCosts(withInputs({}), config).roadside).toBeCloseTo(
      exGst(r.roadsideAnnual),
      6,
    );
  });

  // The one line the explainer says is NOT ex-GST, because registration
  // itself is GST-free even though the CTP part of it isn't.
  it("registration is carried at face value, not ex-GST", () => {
    const costs = buildRunningCosts(withInputs({ state: undefined }), config);
    expect(costs.registration).toBe(r.registrationAnnual);
  });

  it("registration uses the state's own figure when one is set", () => {
    const nsw = buildRunningCosts(withInputs({ state: "NSW" }), config);
    expect(nsw.registration).toBe(r.registrationByState?.NSW ?? r.registrationAnnual);
  });
});

describe("On-road costs versus the car's cost price", () => {
  /**
   * The distinction this guards, and the reason the price field became a
   * guided one: a dealer's drive-away figure bundles stamp duty, registration
   * and CTP with the car, but the ATO excludes all three from the base value
   * the FBT is worked out on. Typing a drive-away total into "price" therefore
   * charges the user FBT on their own registration, every year.
   */
  const car = 55_000;
  const onRoads = 3_000;

  it("finances the on-roads but keeps them out of the base value", () => {
    const withOut = buildFinance(withInputs({ vehiclePrice: car }), config);
    const withOn = buildFinance(withInputs({ vehiclePrice: car, onRoadCosts: onRoads }), config);

    // Repaid: the on-roads are added in full, with no GST credit taken.
    expect(withOn.amountFinanced).toBeCloseTo(withOut.amountFinanced + onRoads, 6);
    // Taxed on: unchanged.
    expect(withOn.priceInclGst).toBe(car);
    expect(withOn.gstCredit).toBeCloseTo(withOut.gstCredit, 6);
  });

  it("is the difference between doing it right and doing it the obvious way", () => {
    const right = calculateLease(
      withInputs({ fuelType: "petrol", vehiclePrice: car, onRoadCosts: onRoads }),
      config,
    );
    const lumped = calculateLease(
      withInputs({ fuelType: "petrol", vehiclePrice: car + onRoads }),
      config,
    );
    // Same amount borrowed either way...
    expect(right.finance.amountFinanced).toBeGreaterThan(0);
    // ...but lumping them in inflates the taxable value by 20% of the
    // on-roads, every year, which is the error this exists to stop.
    expect(lumped.fbt.taxableValue - right.fbt.taxableValue).toBeCloseTo(
      onRoads * config.fbt.statutoryRate,
      6,
    );
  });

  it("measures the car limit on the car, not the drive-away total", () => {
    // A car just under the limit with on-roads that push the invoice over it
    // still gets the full GST credit — the limit is a limit on the car.
    const under = config.gst.carLimit - 1_000;
    const f = buildFinance(withInputs({ vehiclePrice: under, onRoadCosts: 5_000 }), config);
    const expected = under - under / (1 + config.gst.rate);
    expect(f.gstCredit).toBeCloseTo(expected, 6);
  });

  it("leaves the luxury car tax and the EV exemption on the car's price", () => {
    const threshold = config.lct.thresholdFuelEfficient;
    const justUnder = calculateLease(
      withInputs({ fuelType: "electric", vehiclePrice: threshold - 1_000, onRoadCosts: 5_000 }),
      config,
    );
    // On-roads must not tip an otherwise-eligible EV out of the exemption.
    expect(justUnder.fbt.exempt).toBe(true);
  });

  it("reports the invoice total alongside the two parts", () => {
    const f = buildFinance(withInputs({ vehiclePrice: car, onRoadCosts: onRoads }), config);
    expect(f.driveAwayTotal).toBeCloseTo(car + onRoads, 6);
    expect(f.priceInclGst + f.onRoadCosts).toBeCloseTo(f.driveAwayTotal, 6);
  });

  it("behaves exactly as before when there are none", () => {
    const a = buildFinance(withInputs({ vehiclePrice: car }), config);
    const b = buildFinance(withInputs({ vehiclePrice: car, onRoadCosts: 0 }), config);
    expect(a.amountFinanced).toBeCloseTo(b.amountFinanced, 6);
    expect(a.onRoadCosts).toBe(0);
  });
});

describe("Paying the finance down", () => {
  const principal = 50_000;
  const balloon = 14_065;
  const rate = 7.5;
  const months = 60;
  const sched = amortisationSchedule(principal, balloon, rate, months);

  it("starts at the amount financed, before anything is paid", () => {
    expect(sched[0]).toMatchObject({ month: 0, balance: principal, principalPaid: 0 });
  });

  it("has a point for every month of the term", () => {
    expect(sched).toHaveLength(months + 1);
    expect(sched[sched.length - 1].month).toBe(months);
  });

  // The whole reason this is worth drawing: it does not reach zero.
  it("lands exactly on the residual, not on zero", () => {
    expect(sched[sched.length - 1].balance).toBeCloseTo(balloon, 6);
  });

  it("never increases — the balance only comes down", () => {
    for (let i = 1; i < sched.length; i++) {
      expect(sched[i].balance, `month ${i}`).toBeLessThan(sched[i - 1].balance);
    }
  });

  // The other reason: the curve is not a straight line. Early payments are
  // mostly interest, so less of the debt is retired in the first half.
  it("retires less principal in the first half than the second", () => {
    const half = sched[months / 2].principalPaid;
    const rest = sched[months].principalPaid - half;
    expect(half).toBeLessThan(rest);
  });

  it("accounts for every dollar: payments = principal retired + interest", () => {
    const payment = annuityPayment(principal, balloon, rate, months);
    const last = sched[sched.length - 1];
    expect(payment * months).toBeCloseTo(last.principalPaid + last.interestPaid, 4);
  });

  it("agrees with the total interest the finance reports", () => {
    const f = buildFinance(withInputs({ vehiclePrice: 55_000, termYears: 5 }), config);
    const s = amortisationSchedule(
      f.amountFinanced,
      f.residual,
      base.interestRatePct,
      f.monthlyPayment > 0 ? 60 : 0,
    );
    expect(s[s.length - 1].interestPaid).toBeCloseTo(f.totalInterest, 2);
  });

  it("splits each payment into principal and interest that add to it", () => {
    const payment = annuityPayment(principal, balloon, rate, months);
    for (let m = 1; m < months; m++) {
      expect(sched[m].principal + sched[m].interest, `month ${m}`).toBeCloseTo(payment, 6);
    }
  });

  it("moves the split from interest towards principal as it goes", () => {
    expect(sched[1].interest).toBeGreaterThan(sched[months].interest);
    expect(sched[1].principal).toBeLessThan(sched[months].principal);
  });

  it("has each month's principal equal the fall in the balance", () => {
    for (let m = 1; m <= months; m++) {
      expect(sched[m].principal, `month ${m}`).toBeCloseTo(
        sched[m - 1].balance - sched[m].balance,
        6,
      );
    }
  });

  it("charges nothing at month zero, before any payment is made", () => {
    expect(sched[0].interest).toBe(0);
    expect(sched[0].principal).toBe(0);
  });

  it("is a straight line at zero interest", () => {
    const flat = amortisationSchedule(12_000, 0, 0, 12);
    expect(flat[6].balance).toBeCloseTo(6_000, 6);
    expect(flat[12].balance).toBeCloseTo(0, 6);
  });

  it("copes with a zero-month term rather than looping forever", () => {
    expect(amortisationSchedule(1_000, 0, 5, 0)).toHaveLength(1);
  });

  // The printed report rolls the schedule up to anniversaries — the chart
  // doesn't survive a black-and-white printer, so a table has to say the same
  // thing. It reads the points at month 0, 12, 24 … and takes differences, so
  // an off-by-one in that indexing would silently lose or double a month.
  describe("rolled up to years, the way the report prints it", () => {
    const years = Array.from({ length: months / 12 }, (_, i) => {
      const start = sched[i * 12];
      const end = sched[(i + 1) * 12];
      return {
        interest: end.interestPaid - start.interestPaid,
        principal: start.balance - end.balance,
        balance: end.balance,
      };
    });

    it("accounts for every dollar of principal, with none left over", () => {
      const total = years.reduce((t, y) => t + y.principal, 0);
      expect(total).toBeCloseTo(principal - balloon, 4);
    });

    it("accounts for every dollar of interest", () => {
      const total = years.reduce((t, y) => t + y.interest, 0);
      expect(total).toBeCloseTo(sched[months].interestPaid, 4);
    });

    it("ends the last year on the residual", () => {
      expect(years[years.length - 1].balance).toBeCloseTo(balloon, 6);
    });

    it("each year picks up where the one before left off", () => {
      years.forEach((y, i) => {
        const opening = i === 0 ? principal : years[i - 1].balance;
        expect(opening - y.principal, `year ${i + 1}`).toBeCloseTo(y.balance, 6);
      });
    });
  });
});
