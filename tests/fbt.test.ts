import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  assessFbt,
  buildFinance,
  calculateLease,
  defaultInputs,
  type LeaseInputs,
} from "@/lib/au/novated";

const config = DEFAULT_CONFIG;
const base = defaultInputs(config);
const withInputs = (o: Partial<LeaseInputs>): LeaseInputs => ({ ...base, ...o });
const assess = (o: Partial<LeaseInputs>) => {
  const inputs = withInputs(o);
  return assessFbt(inputs, buildFinance(inputs, config), config);
};

describe("Fringe benefits tax", () => {
  it("values the benefit at the statutory percentage of the GST-inclusive price", () => {
    const f = assess({ fuelType: "petrol", vehiclePrice: 50_000 });
    expect(f.baseValue).toBe(50_000);
    expect(f.taxableValue).toBeCloseTo(10_000, 6); // 20% of base value
  });

  it("cancels the FBT entirely under the employee contribution method", () => {
    const f = assess({ fuelType: "petrol", vehiclePrice: 50_000, fbtMethod: "ecm" });
    expect(f.employeeContribution).toBeCloseTo(f.taxableValue, 6);
    expect(f.fbtPayable).toBe(0);
    // A taxable value reduced to nil is not a reportable fringe benefit.
    expect(f.reportableFringeBenefit).toBe(0);
  });

  it("grosses up and taxes the benefit when the employer pays the FBT instead", () => {
    const f = assess({
      fuelType: "petrol",
      vehiclePrice: 50_000,
      fbtMethod: "employer-pays",
    });
    expect(f.employeeContribution).toBe(0);
    expect(f.fbtPayable).toBeCloseTo(
      10_000 * config.fbt.grossUpType1 * config.fbt.rate,
      4,
    );
    expect(f.reportableFringeBenefit).toBeCloseTo(10_000 * config.fbt.grossUpType2, 4);
  });

  it("makes the employer-pays route dearer than contributing post-tax", () => {
    const ecm = calculateLease(
      withInputs({ fuelType: "petrol", vehiclePrice: 50_000, fbtMethod: "ecm" }),
      config,
    );
    const employer = calculateLease(
      withInputs({ fuelType: "petrol", vehiclePrice: 50_000, fbtMethod: "employer-pays" }),
      config,
    );
    expect(employer.package.netAnnualCost).toBeGreaterThan(ecm.package.netAnnualCost);
  });
});

describe("Electric vehicle exemption", () => {
  it("exempts a battery-electric vehicle under the fuel-efficient threshold", () => {
    const f = assess({ fuelType: "electric", vehiclePrice: 55_000 });
    expect(f.exempt).toBe(true);
    expect(f.fbtPayable).toBe(0);
    expect(f.employeeContribution).toBe(0);
    expect(f.exemptReason).toBeTruthy();
  });

  it("still reports an exempt car as a fringe benefit", () => {
    // The exemption removes the FBT, not the reporting — this is the trap.
    const f = assess({ fuelType: "electric", vehiclePrice: 55_000 });
    expect(f.reportableFringeBenefit).toBeCloseTo(
      f.taxableValue * config.fbt.grossUpType2,
      4,
    );
  });

  it("withdraws the exemption above the luxury car tax threshold", () => {
    const over = config.lct.thresholdFuelEfficient + 1;
    const f = assess({ fuelType: "electric", vehiclePrice: over });
    expect(f.exempt).toBe(false);
    expect(f.employeeContribution).toBeGreaterThan(0);
  });

  it("keeps the exemption exactly at the threshold", () => {
    const f = assess({
      fuelType: "electric",
      vehiclePrice: config.lct.thresholdFuelEfficient,
    });
    expect(f.exempt).toBe(true);
  });

  it("does not exempt a plug-in hybrid", () => {
    expect(assess({ fuelType: "phev", vehiclePrice: 55_000 }).exempt).toBe(false);
  });

  it("does not exempt a conventional hybrid, petrol or diesel car", () => {
    for (const fuelType of ["hybrid", "petrol", "diesel"] as const) {
      expect(assess({ fuelType, vehiclePrice: 55_000 }).exempt).toBe(false);
    }
  });

  it("leaves an exempt EV cheaper than the same-priced petrol car", () => {
    const ev = calculateLease(withInputs({ fuelType: "electric", vehiclePrice: 55_000 }), config);
    const petrol = calculateLease(withInputs({ fuelType: "petrol", vehiclePrice: 55_000 }), config);
    expect(ev.package.netAnnualCost).toBeLessThan(petrol.package.netAnnualCost);
    // …and the whole exempt package comes out pre-tax.
    expect(ev.package.postTaxAnnual).toBe(0);
    expect(petrol.package.postTaxAnnual).toBeGreaterThan(0);
  });

  it("warns when an EV misses the exemption on price", () => {
    const r = calculateLease(
      withInputs({ fuelType: "electric", vehiclePrice: config.lct.thresholdFuelEfficient + 5_000 }),
      config,
    );
    expect(r.warnings.some((w) => w.includes("FBT exemption does not apply"))).toBe(true);
  });

  it("warns that plug-in hybrids lost eligibility", () => {
    const r = calculateLease(withInputs({ fuelType: "phev" }), config);
    expect(r.warnings.some((w) => w.includes("Plug-in hybrids"))).toBe(true);
  });
});
