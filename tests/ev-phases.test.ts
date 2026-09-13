import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, type EngineConfig } from "@/lib/au/config";
import {
  assessFbt,
  buildFinance,
  calculateLease,
  checkFbtExemption,
  defaultInputs,
  type LeaseInputs,
} from "@/lib/au/novated";

const config = DEFAULT_CONFIG;
const base = defaultInputs(config);
const withInputs = (o: Partial<LeaseInputs>): LeaseInputs => ({ ...base, ...o });
const ev = (o: Partial<LeaseInputs> = {}) =>
  withInputs({ fuelType: "electric", vehiclePrice: 85_000, ...o });
const check = (o: Partial<LeaseInputs> = {}) => checkFbtExemption(ev(o), config);

const PHASE_2 = "2027-04-01";
const PHASE_3 = "2029-04-01";

/**
 * The electric car concession stopped being a permanent exemption in the 2026
 * Budget and became a schedule. The engine modelled it as permanent, which was
 * wrong in the user's favour by thousands a year the moment anyone priced a
 * lease starting after March 2027 — and did it under a green badge.
 *
 * Modelled as a statutory rate rather than a boolean, because that is how the
 * law delivers it: nil is the exemption, 15% is the 25% discount, 20% is no
 * concession. The middle band has no boolean.
 */
describe("The electric car concession, phase by phase", () => {
  it("is a nil statutory rate today, which is what an exemption is", () => {
    const c = check({ vehiclePrice: 85_000 });
    expect(c.exempt).toBe(true);
    expect(c.statutoryRate).toBe(0);
    expect(c.discount).toBe(1);
  });

  it("still exempts an $85,000 car under the rules in force now", () => {
    // Above the coming $75,000 cap, but the cap does not exist yet.
    expect(check({ vehiclePrice: 85_000, commencementDate: "2026-09-13" }).exempt).toBe(true);
  });

  it("holds the exemption to the last day before the change", () => {
    expect(check({ vehiclePrice: 85_000, commencementDate: "2027-03-31" }).exempt).toBe(true);
  });

  it("narrows it the day the phase starts", () => {
    const c = check({ vehiclePrice: 85_000, commencementDate: PHASE_2 });
    expect(c.exempt).toBe(false);
    expect(c.statutoryRate).toBe(0.15);
    expect(c.discount).toBeCloseTo(0.25, 6);
  });

  it("keeps the full exemption under $75,000 in the middle phase", () => {
    const c = check({ vehiclePrice: 74_999, commencementDate: PHASE_2 });
    expect(c.exempt).toBe(true);
    expect(c.statutoryRate).toBe(0);
  });

  it("puts the cap exactly at $75,000, not just under it", () => {
    expect(check({ vehiclePrice: 75_000, commencementDate: PHASE_2 }).exempt).toBe(true);
    expect(check({ vehiclePrice: 75_001, commencementDate: PHASE_2 }).exempt).toBe(false);
  });

  it("leaves nothing fully exempt from 2029", () => {
    const cheap = check({ vehiclePrice: 40_000, commencementDate: PHASE_3 });
    expect(cheap.exempt).toBe(false);
    expect(cheap.statutoryRate).toBe(0.15);
  });

  it("still refuses a car over the luxury car tax threshold, in every phase", () => {
    const over = config.lct.thresholdFuelEfficient + 1;
    for (const commencementDate of ["2026-09-13", PHASE_2, PHASE_3]) {
      const c = check({ vehiclePrice: over, commencementDate });
      expect(c.exempt, commencementDate).toBe(false);
      expect(c.statutoryRate, commencementDate).toBe(config.fbt.statutoryRate);
      expect(c.discount, commencementDate).toBe(0);
    }
  });

  // The whole point of grandfathering: the phase is fixed at commencement.
  it("fixes the treatment at commencement, not at the date of the question", () => {
    const signedEarly = check({ vehiclePrice: 85_000, commencementDate: "2027-03-31" });
    const signedLate = check({ vehiclePrice: 85_000, commencementDate: "2027-04-02" });
    expect(signedEarly.exempt).toBe(true);
    expect(signedLate.exempt).toBe(false);
    expect(signedEarly.phaseFrom).not.toBe(signedLate.phaseFrom);
  });

  it("assumes this financial year when nobody says, so old leases don't move", () => {
    const said = check({ vehiclePrice: 85_000, commencementDate: "2026-07-01" });
    const unsaid = check({ vehiclePrice: 85_000 });
    expect(unsaid.exempt).toBe(said.exempt);
    expect(unsaid.statutoryRate).toBe(said.statutoryRate);
    expect(unsaid.phaseFrom).toBe(said.phaseFrom);
  });

  it("ignores a date it can't read rather than falling off a cliff", () => {
    expect(check({ vehiclePrice: 85_000, commencementDate: "not a date" }).exempt).toBe(true);
  });
});

describe("What the discount actually costs", () => {
  const inputs = ev({ vehiclePrice: 85_000, commencementDate: PHASE_2, fbtMethod: "ecm" });
  const fbt = assessFbt(inputs, buildFinance(inputs, config), config);

  it("taxes a smaller value, rather than none and rather than all of it", () => {
    const full = 85_000 * config.fbt.statutoryRate;
    expect(fbt.taxableValue).toBeCloseTo(85_000 * 0.15, 4);
    expect(fbt.taxableValue).toBeLessThan(full);
    expect(fbt.taxableValue).toBeGreaterThan(0);
  });

  it("leaves an employee contribution to make, where an exempt car leaves none", () => {
    const exempt = ev({ vehiclePrice: 85_000, commencementDate: "2026-09-13" });
    const exemptOut = assessFbt(exempt, buildFinance(exempt, config), config);
    expect(exemptOut.employeeContribution).toBe(0);
    expect(fbt.employeeContribution).toBeGreaterThan(0);
    expect(fbt.employeeContribution).toBeCloseTo(85_000 * 0.15, 4);
  });

  it("costs more than an exempt car and less than a petrol one", () => {
    const discounted = calculateLease(inputs, config);
    const exempt = calculateLease(ev({ vehiclePrice: 85_000 }), config);
    const petrol = calculateLease(
      withInputs({ fuelType: "petrol", vehiclePrice: 85_000, fbtMethod: "ecm" }),
      config,
    );
    expect(discounted.package.netAnnualCost).toBeGreaterThan(exempt.package.netAnnualCost);
    expect(discounted.package.netAnnualCost).toBeLessThan(petrol.package.netAnnualCost);
  });

  it("says so, rather than leaving the bigger number to be noticed", () => {
    const r = calculateLease(inputs, config);
    expect(r.warnings.some((w) => w.includes("25% discount") || w.includes("discount instead"))).toBe(
      true,
    );
  });
});

/**
 * An exempt car benefit is still REPORTABLE. The exemption removes the FBT,
 * not the reporting — and modelling the concession as a statutory rate made
 * it briefly possible to read the reportable amount off a nil rate and delete
 * it silently.
 */
describe("Reporting survives the exemption", () => {
  it("still reports an exempt car at the full statutory value", () => {
    const inputs = ev({ vehiclePrice: 85_000 });
    const fbt = assessFbt(inputs, buildFinance(inputs, config), config);
    expect(fbt.exempt).toBe(true);
    expect(fbt.fbtPayable).toBe(0);
    expect(fbt.taxableValue).toBeCloseTo(85_000 * config.fbt.statutoryRate, 4);
    expect(fbt.reportableFringeBenefit).toBeCloseTo(
      85_000 * config.fbt.statutoryRate * config.fbt.grossUpType2,
      4,
    );
    expect(fbt.reportableFringeBenefit).toBeGreaterThan(0);
  });
});

describe("Grandfathering, and saying so", () => {
  it("tells a lease starting now that it keeps what it starts with", () => {
    const r = calculateLease(ev({ vehiclePrice: 85_000, commencementDate: "2026-09-13" }), config);
    expect(r.warnings.some((w) => w.includes("keeps the treatment it starts with"))).toBe(true);
  });

  it("warns about the things that would restart it", () => {
    const r = calculateLease(ev({ vehiclePrice: 85_000 }), config);
    const w = r.warnings.find((x) => x.includes("keeps the treatment it starts with"))!;
    expect(w).toContain("Refinancing");
    expect(w).toContain("changing the car");
  });

  it("doesn't promise grandfathering to a lease already in the last phase", () => {
    const r = calculateLease(ev({ vehiclePrice: 40_000, commencementDate: PHASE_3 }), config);
    expect(r.warnings.some((x) => x.includes("keeps the treatment it starts with"))).toBe(false);
  });
});

describe("A config with no schedule at all", () => {
  // Stored configs predate the phases; withDefaults fills them, but the engine
  // must not depend on that to avoid exempting nothing.
  const bare: EngineConfig = {
    ...config,
    fbt: { ...config.fbt, evExemption: { ...config.fbt.evExemption, phases: [] } },
  };

  it("falls back to the exemption rather than to full FBT", () => {
    const c = checkFbtExemption({ fuelType: "electric", vehiclePrice: 85_000 }, bare);
    expect(c.exempt).toBe(true);
    expect(c.phaseFrom).toBeNull();
  });
});
