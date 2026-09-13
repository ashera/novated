import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  assessFbt,
  calculateLease,
  capFor,
  capSpendable,
  defaultInputs,
  isCappedEmployer,
  type EmployerFbtStatus,
  type LeaseInputs,
} from "@/lib/au/novated";

const config = DEFAULT_CONFIG;
const base = defaultInputs(config);
// A petrol car, so the EV exemption doesn't mask what the cap is doing.
const petrol = { ...base, fuelType: "petrol" as const };
const run = (o: Partial<LeaseInputs> = {}) => calculateLease({ ...petrol, ...o }, config);
const g2 = config.fbt.grossUpType2;

/**
 * The caps as the people who have them know them.
 *
 * Legislated grossed up — $17,000 and $30,000 — and tested with the type 2
 * factor whatever gross-up the tax itself uses. Divide one by the other and
 * you get the figures on every packaging provider's brochure. If these two
 * numbers ever stop matching, the model has drifted from the thing it is
 * meant to describe.
 */
describe("The salary packaging caps", () => {
  it("comes to the $9,010 a hospital worker calls their cap", () => {
    expect(capSpendable(capFor("hospital", config), config)).toBeCloseTo(9_010, 0);
  });

  it("comes to the $15,900 a charity worker calls theirs", () => {
    expect(capSpendable(capFor("pbi", config), config)).toBeCloseTo(15_900, 0);
  });

  it("knows which employers have one", () => {
    expect(isCappedEmployer("ordinary")).toBe(false);
    expect(isCappedEmployer(undefined)).toBe(false);
    for (const s of ["hospital", "pbi", "rebatable"] as EmployerFbtStatus[]) {
      expect(isCappedEmployer(s)).toBe(true);
    }
  });

  it("gives an ordinary employer no cap at all", () => {
    expect(capFor("ordinary", config)).toBe(0);
    expect(run().fbt.cap).toBeUndefined();
  });
});

/**
 * Inside the cap there is no tax, so there is nothing to contribute against.
 *
 * This is the item. Told to use the employee contribution method regardless, a
 * hospital employee with room left on their cap hands over thousands of
 * already-taxed dollars to cancel a tax that was never going to be charged.
 * Post-tax dollars attract no relief whatsoever, so every one of them is lost.
 */
describe("What the cap does to the contribution", () => {
  it("asks for no contribution at all when the cap covers the whole car", () => {
    const r = run({ employerFbtStatus: "pbi", capUsedSpendable: 0 });
    expect(r.fbt.cap?.fullyCovered).toBe(true);
    expect(r.fbt.employeeContribution).toBe(0);
    expect(r.fbt.fbtPayable).toBe(0);
    expect(r.package.postTaxAnnual).toBe(0);
  });

  it("leaves a worker with a spare cap better off than the same worker without", () => {
    const covered = run({ employerFbtStatus: "pbi", capUsedSpendable: 0 });
    const ordinary = run();
    expect(covered.package.netAnnualCost).toBeLessThan(ordinary.package.netAnnualCost);
    expect(covered.package.takeHomeAfter).toBeGreaterThan(ordinary.package.takeHomeAfter);
  });

  it("contributes only against the part that did not fit", () => {
    // Hospital cap is the smaller one, so a $55,000 car overflows it.
    const r = run({ employerFbtStatus: "hospital", capUsedSpendable: 0 });
    const c = r.fbt.cap!;
    expect(c.fullyCovered).toBe(false);
    expect(c.sheltered).toBeCloseTo(c.grossedUpCap, 6);
    expect(c.excess).toBeGreaterThan(0);
    expect(r.fbt.employeeContribution).toBeCloseTo(c.excess / g2, 6);
    expect(r.fbt.employeeContribution).toBeLessThan(r.fbt.taxableValue);
  });

  // The common case, and the reason the room is asked for rather than assumed:
  // the cap is normally spent on rent or a mortgage long before a car.
  it("behaves exactly like an ordinary employer once the cap is spent", () => {
    const spent = capSpendable(capFor("pbi", config), config);
    const used = run({ employerFbtStatus: "pbi", capUsedSpendable: spent });
    const ordinary = run();
    expect(used.fbt.cap?.available).toBeCloseTo(0, 6);
    expect(used.fbt.employeeContribution).toBeCloseTo(ordinary.fbt.employeeContribution, 6);
    expect(used.package.netAnnualCost).toBeCloseTo(ordinary.package.netAnnualCost, 6);
  });

  it("never gives back more room than the cap holds", () => {
    const over = run({ employerFbtStatus: "hospital", capUsedSpendable: 99_999 });
    expect(over.fbt.cap?.available).toBe(0);
    expect(over.fbt.cap?.sheltered).toBe(0);
  });

  it("treats a negative amount packaged as none", () => {
    const a = run({ employerFbtStatus: "pbi", capUsedSpendable: -5_000 });
    const b = run({ employerFbtStatus: "pbi", capUsedSpendable: 0 });
    expect(a.fbt.cap?.used).toBe(b.fbt.cap?.used);
  });

  it("shelters more under the larger cap than the smaller one", () => {
    const pbi = run({ employerFbtStatus: "pbi", capUsedSpendable: 0 }).fbt.cap!;
    const hospital = run({ employerFbtStatus: "hospital", capUsedSpendable: 0 }).fbt.cap!;
    expect(pbi.sheltered).toBeGreaterThan(hospital.sheltered);
    expect(pbi.excess).toBeLessThan(hospital.excess);
  });
});

/**
 * Rebatable is not exemption, and the difference lands on the employer.
 *
 * A rebatable employer pays the FBT and is refunded part of it. Nothing about
 * that reduces the taxable value, so the employee's own position — and the
 * contribution they should make — is unchanged. Modelling it as a discount to
 * the employee would invent a saving they never see.
 */
describe("Rebatable employers", () => {
  it("leaves the employee's contribution exactly where it was", () => {
    const reb = run({ employerFbtStatus: "rebatable", capUsedSpendable: 0 });
    const ordinary = run();
    expect(reb.fbt.employeeContribution).toBeCloseTo(ordinary.fbt.employeeContribution, 6);
    expect(reb.package.netAnnualCost).toBeCloseTo(ordinary.package.netAnnualCost, 6);
  });

  it("charges no FBT under ECM, so there is nothing left to rebate", () => {
    expect(run({ employerFbtStatus: "rebatable", capUsedSpendable: 0 }).fbt.fbtPayable).toBe(0);
  });

  it("reduces the employer's bill when the employer is the one paying it", () => {
    const reb = run({
      employerFbtStatus: "rebatable",
      capUsedSpendable: 0,
      fbtMethod: "employer-pays",
    });
    const ordinary = run({ fbtMethod: "employer-pays" });
    expect(reb.fbt.fbtPayable).toBeGreaterThan(0);
    expect(reb.fbt.fbtPayable).toBeLessThan(ordinary.fbt.fbtPayable);
  });

  it("says plainly that the rebate is not the employee's", () => {
    const r = run({ employerFbtStatus: "rebatable", capUsedSpendable: 0 });
    expect(r.warnings.some((w) => w.includes("goes to the employer, not to you"))).toBe(true);
  });
});

/**
 * An exempt car never touches the cap.
 *
 * An eligible electric car is not a fringe benefit at all, so it consumes no
 * room — the cap stays whole for rent or a mortgage. That is a real advantage
 * for exactly this group and one nobody tells them about.
 */
describe("An exempt electric car against a cap", () => {
  it("uses none of the cap", () => {
    const ev = calculateLease(
      { ...base, employerFbtStatus: "hospital", capUsedSpendable: 0 },
      config,
    );
    expect(ev.fbt.exempt).toBe(true);
    expect(ev.fbt.cap).toBeUndefined();
  });

  it("still puts a reportable amount on the income statement", () => {
    const ev = calculateLease({ ...base, employerFbtStatus: "pbi" }, config);
    expect(ev.fbt.reportableFringeBenefit).toBeGreaterThan(0);
  });
});

/**
 * What the cap absorbs is exempt, not invisible.
 *
 * It is still reported, which is precisely why health workers carry a
 * reportable amount that surprises them at tax time. Dropping it would
 * understate their study-loan repayments and their Medicare levy surcharge.
 */
describe("Reporting what the cap absorbed", () => {
  it("reports the sheltered value even though no tax was paid on it", () => {
    const r = run({ employerFbtStatus: "pbi", capUsedSpendable: 0 });
    expect(r.fbt.fbtPayable).toBe(0);
    expect(r.fbt.employeeContribution).toBe(0);
    expect(r.fbt.reportableFringeBenefit).toBeCloseTo(r.fbt.cap!.sheltered, 6);
    expect(r.warnings.some((w) => w.includes("reportable fringe benefit"))).toBe(true);
  });

  it("reports nothing extra once a contribution has cancelled the taxed part", () => {
    // Cap spent: identical to an ordinary employer, where ECM zeroes the RFBA.
    const spent = capSpendable(capFor("pbi", config), config);
    const r = run({ employerFbtStatus: "pbi", capUsedSpendable: spent });
    expect(r.fbt.reportableFringeBenefit).toBe(0);
  });
});

describe("The arithmetic on its own", () => {
  it("splits the car's grossed-up value into sheltered and excess, exactly", () => {
    const inputs = { ...petrol, employerFbtStatus: "hospital" as const, capUsedSpendable: 2_000 };
    const r = calculateLease(inputs, config);
    const c = r.fbt.cap!;
    expect(c.sheltered + c.excess).toBeCloseTo(c.carGrossedUp, 6);
    expect(c.carGrossedUp).toBeCloseTo(r.fbt.taxableValue * g2, 6);
    expect(c.used).toBeCloseTo(2_000 * g2, 6);
    expect(c.available).toBeCloseTo(c.grossedUpCap - c.used, 6);
  });

  it("does not depend on being reached through calculateLease", () => {
    const r = calculateLease({ ...petrol, employerFbtStatus: "pbi", capUsedSpendable: 0 }, config);
    const direct = assessFbt(
      { ...petrol, employerFbtStatus: "pbi", capUsedSpendable: 0 },
      r.finance,
      config,
    );
    expect(direct.cap).toEqual(r.fbt.cap);
  });
});

describe("Telling a capped employee what the controls did", () => {
  // Both controls appear to do nothing on an exempt car. Saying why turns
  // apparent breakage into the best news on the page.
  it("says an exempt car leaves the whole cap available", () => {
    const ev = calculateLease(
      { ...base, employerFbtStatus: "hospital", capUsedSpendable: 0 },
      config,
    );
    expect(ev.fbt.exempt).toBe(true);
    expect(ev.warnings.some((w) => w.includes("uses none of your"))).toBe(true);
  });

  it("says nothing of the sort to an ordinary employer", () => {
    const ev = calculateLease(base, config);
    expect(ev.warnings.some((w) => w.includes("packaging cap"))).toBe(false);
  });
});
