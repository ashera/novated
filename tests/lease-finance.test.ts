import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  annuityPayment,
  buildFinance,
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
