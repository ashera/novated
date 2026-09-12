import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  assessFbt,
  buildFinance,
  calculateLease,
  checkFbtExemption,
  defaultInputs,
  financialYearOf,
  fuelEfficientThresholdFor,
  isFbtExemptVehicle,
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

  // The badge on the car is a second caller of the exemption rule, and the one
  // place a user reads it before any figure is worked out. If it ever answers
  // differently from the assessment, the picture says "no FBT" over a page
  // full of employee contributions.
  it("tells the interface the same thing the assessment concluded", () => {
    const cases: Partial<LeaseInputs>[] = [
      { fuelType: "electric", vehiclePrice: 55_000 },
      { fuelType: "electric", vehiclePrice: config.lct.thresholdFuelEfficient },
      { fuelType: "electric", vehiclePrice: config.lct.thresholdFuelEfficient + 1 },
      { fuelType: "phev", vehiclePrice: 55_000 },
      { fuelType: "hybrid", vehiclePrice: 55_000 },
      { fuelType: "petrol", vehiclePrice: 120_000 },
      { fuelType: "diesel", vehiclePrice: 40_000 },
      // The second-hand cases, where the two could most easily drift apart.
      { fuelType: "electric", vehiclePrice: 45_000, condition: "used", firstRegisteredDate: "2021-03-01" },
      { fuelType: "electric", vehiclePrice: 45_000, condition: "used", firstRegisteredDate: "2023-03-01" },
      { fuelType: "electric", vehiclePrice: 45_000, condition: "used" },
    ];
    for (const c of cases) {
      expect(
        isFbtExemptVehicle(withInputs(c), config),
        `${c.fuelType} at ${c.vehiclePrice}, ${c.condition ?? "new"}`,
      ).toBe(assess(c).exempt);
    }
  });

  it("goes quiet if the exemption is switched off in the rules", () => {
    const off = { ...config, fbt: { ...config.fbt, evExemption: { ...config.fbt.evExemption, enabled: false } } };
    expect(isFbtExemptVehicle({ fuelType: "electric", vehiclePrice: 55_000 }, off)).toBe(false);
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

/**
 * A second-hand electric car is the case the exemption quietly refuses.
 *
 * Nothing about the car on screen looks different — same model, same badge, a
 * lower price — but the exemption is fixed to the car's own history, so a 2021
 * example can never qualify however many times it is sold. Until we asked
 * whether the car was new, every one of these was modelled, and shown, as
 * exempt.
 */
describe("Second-hand and ex-demo cars", () => {
  const ev = (o: Partial<LeaseInputs>) =>
    assess({ fuelType: "electric", vehiclePrice: 45_000, ...o });
  const startOfExemption = config.fbt.evExemption.firstHeldFrom;

  it("refuses the exemption to an EV first registered before it started", () => {
    const f = ev({ condition: "used", firstRegisteredDate: "2021-11-30" });
    expect(f.exempt).toBe(false);
    expect(f.employeeContribution).toBeGreaterThan(0);
  });

  it("allows it to one first registered after it started", () => {
    expect(ev({ condition: "used", firstRegisteredDate: "2023-08-01" }).exempt).toBe(true);
  });

  it("holds the line on the day itself", () => {
    expect(ev({ condition: "used", firstRegisteredDate: startOfExemption }).exempt).toBe(true);
    const dayBefore = new Date(`${startOfExemption}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    expect(
      ev({ condition: "used", firstRegisteredDate: dayBefore.toISOString().slice(0, 10) }).exempt,
    ).toBe(false);
  });

  it("won't claim the exemption for a used car with no registration date", () => {
    // Silence isn't a pass: without the date we cannot know, and guessing in
    // the user's favour is how somebody gets a tax bill they were told to
    // expect nothing of.
    const check = checkFbtExemption(
      { fuelType: "electric", vehiclePrice: 45_000, condition: "used" },
      config,
    );
    expect(check.exempt).toBe(false);
    expect(check.blockedBy).toContain(startOfExemption);
  });

  it("treats an ex-demo the same way — it has been registered too", () => {
    expect(ev({ condition: "demo", firstRegisteredDate: "2021-11-30" }).exempt).toBe(false);
    expect(ev({ condition: "demo", firstRegisteredDate: "2024-02-01" }).exempt).toBe(true);
  });

  it("tests the price cap on what it sold for new, against that year's threshold", () => {
    const then = config.lct.thresholdFuelEfficientByYear["2023-24"];
    const used = (firstRetailPrice: number) =>
      checkFbtExemption(
        {
          fuelType: "electric",
          vehiclePrice: 45_000,
          condition: "used",
          firstRegisteredDate: "2023-09-01",
          firstRetailPrice,
        },
        config,
      ).exempt;
    // Today's cheap second-hand price would sail under any threshold, so the
    // test has to be what it cost new: over the line then is over it now.
    expect(used(then + 1)).toBe(false);
    expect(used(then)).toBe(true);
  });

  it("uses the threshold of the year it was sold, not today's", () => {
    // The thresholds only ever went up, so a car priced between the two is
    // exempt on today's figure and not on its own. That gap is the whole
    // reason the historical series exists.
    const then = config.lct.thresholdFuelEfficientByYear["2022-23"];
    const now = config.lct.thresholdFuelEfficient;
    expect(now).toBeGreaterThan(then);
    const between = (then + now) / 2;
    expect(
      checkFbtExemption(
        {
          fuelType: "electric",
          vehiclePrice: 45_000,
          condition: "used",
          firstRegisteredDate: "2022-09-01",
          firstRetailPrice: between,
        },
        config,
      ).exempt,
    ).toBe(false);
    expect(
      checkFbtExemption({ fuelType: "electric", vehiclePrice: between }, config).exempt,
    ).toBe(true);
  });

  it("says so rather than guessing when it doesn't know the original price", () => {
    const check = checkFbtExemption(
      {
        fuelType: "electric",
        vehiclePrice: 45_000,
        condition: "used",
        firstRegisteredDate: "2023-08-01",
      },
      config,
    );
    expect(check.exempt).toBe(true);
    expect(check.unverified).toBeTruthy();
  });

  it("passes the unverified caveat on to the user as a warning", () => {
    const r = calculateLease(
      withInputs({
        fuelType: "electric",
        vehiclePrice: 45_000,
        condition: "used",
        firstRegisteredDate: "2023-08-01",
      }),
      config,
    );
    expect(r.warnings.some((w) => w.includes("couldn't check"))).toBe(true);
  });

  it("explains a refusal with the reason it actually refused for", () => {
    const r = calculateLease(
      withInputs({
        fuelType: "electric",
        vehiclePrice: 45_000,
        condition: "used",
        firstRegisteredDate: "2021-01-01",
      }),
      config,
    );
    const w = r.warnings.find((x) => x.includes("FBT exemption does not apply"));
    expect(w).toBeTruthy();
    expect(w).toContain("2021-01-01");
  });

  it("leaves a new car exactly where it was before we asked", () => {
    // The default has to be inert: every lease saved before this shipped
    // carries no condition at all, and none of their figures may move.
    const silent = calculateLease(
      withInputs({ fuelType: "electric", vehiclePrice: 55_000 }),
      config,
    );
    const stated = calculateLease(
      withInputs({ fuelType: "electric", vehiclePrice: 55_000, condition: "new" }),
      config,
    );
    expect(silent.package.netAnnualCost).toBeCloseTo(stated.package.netAnnualCost, 6);
    expect(silent.fbt.exempt).toBe(true);
  });

  it("warns that the running-cost benchmarks assume a car in warranty", () => {
    const r = calculateLease(
      withInputs({ condition: "used", firstRegisteredDate: "2020-01-01" }),
      config,
    );
    expect(r.warnings.some((w) => w.includes("under warranty"))).toBe(true);
  });
});

describe("Buying privately", () => {
  it("claims no GST credit, because none was charged", () => {
    const dealer = buildFinance(withInputs({ vehiclePrice: 50_000 }), config);
    const priv = buildFinance(
      withInputs({ vehiclePrice: 50_000, condition: "used", purchasedFrom: "private" }),
      config,
    );
    expect(dealer.gstCredit).toBeGreaterThan(0);
    expect(priv.gstCredit).toBe(0);
  });

  it("finances the whole price instead, so every payment is larger", () => {
    const dealer = buildFinance(withInputs({ vehiclePrice: 50_000 }), config);
    const priv = buildFinance(
      withInputs({ vehiclePrice: 50_000, purchasedFrom: "private" }),
      config,
    );
    expect(priv.amountFinanced).toBeCloseTo(50_000, 6);
    expect(priv.amountFinanced).toBeGreaterThan(dealer.amountFinanced);
    expect(priv.monthlyPayment).toBeGreaterThan(dealer.monthlyPayment);
  });

  it("costs more over the lease than the same car from a dealer", () => {
    const dealer = calculateLease(withInputs({ vehiclePrice: 50_000 }), config);
    const priv = calculateLease(
      withInputs({ vehiclePrice: 50_000, purchasedFrom: "private" }),
      config,
    );
    expect(priv.package.netAnnualCost).toBeGreaterThan(dealer.package.netAnnualCost);
  });

  it("tells the user why, rather than leaving them to spot the bigger number", () => {
    const r = calculateLease(
      withInputs({ vehiclePrice: 50_000, purchasedFrom: "private" }),
      config,
    );
    expect(r.warnings.some((w) => w.includes("private seller doesn't charge GST"))).toBe(true);
  });

  it("leaves a dealer purchase exactly as it was", () => {
    const silent = buildFinance(withInputs({ vehiclePrice: 50_000 }), config);
    const stated = buildFinance(
      withInputs({ vehiclePrice: 50_000, purchasedFrom: "dealer" }),
      config,
    );
    expect(silent.amountFinanced).toBeCloseTo(stated.amountFinanced, 6);
  });
});

describe("Financial years", () => {
  it("starts a new one on 1 July", () => {
    expect(financialYearOf(new Date("2024-06-30T00:00:00Z"))).toBe("2023-24");
    expect(financialYearOf(new Date("2024-07-01T00:00:00Z"))).toBe("2024-25");
  });

  it("rolls the label over a century boundary without producing 2099-100", () => {
    expect(financialYearOf(new Date("2099-08-01T00:00:00Z"))).toBe("2099-00");
  });

  it("returns null for a year we hold no threshold for, rather than today's", () => {
    // Falling back to the current figure would be the generous answer and the
    // wrong one — today's threshold is the highest it has ever been.
    expect(fuelEfficientThresholdFor("2019-08-01", config)).toBeNull();
    expect(fuelEfficientThresholdFor("2023-08-01", config)).toBe(
      config.lct.thresholdFuelEfficientByYear["2023-24"],
    );
  });
});
