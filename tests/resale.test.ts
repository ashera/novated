import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { depreciationClass, equityAt, resaleValue } from "@/lib/au/resale";
import { amortisationSchedule, buildFinance, defaultInputs, type LeaseInputs } from "@/lib/au/novated";

const config = DEFAULT_CONFIG;
const PRICE = 60_000;
const at = (months: number, fuel: LeaseInputs["fuelType"] = "electric") =>
  resaleValue(PRICE, fuel, months, config);

/**
 * The only forecast on the site.
 *
 * Everything else here is arithmetic on a published rule, where the answer is
 * not a matter of opinion. This is a guess about a market years out, and the
 * tests are written accordingly: they pin the SHAPE of the curve and the
 * relationships between classes, not the figures, because the figures will
 * move and should be editable without breaking the suite.
 */
describe("What the car will be worth", () => {
  it("is worth what it cost on the day it is bought", () => {
    expect(at(0).value).toBeCloseTo(PRICE, 6);
    expect(at(0).retained).toBeCloseTo(1, 6);
  });

  it("only ever falls", () => {
    let previous = Infinity;
    for (let m = 0; m <= 120; m += 3) {
      const v = at(m).value;
      expect(v, `month ${m}`).toBeLessThanOrEqual(previous);
      previous = v;
    }
  });

  // A straight line would be the wrong shape and would flatter the early
  // years, which is exactly where a lease is most likely to end badly.
  it("falls fastest at the start", () => {
    const firstYear = at(0).value - at(12).value;
    const fourthYear = at(36).value - at(48).value;
    expect(firstYear).toBeGreaterThan(fourthYear * 1.5);
  });

  it("moves continuously rather than stepping on anniversaries", () => {
    // A chart drawn monthly should not look like a staircase.
    const six = at(6).value;
    expect(six).toBeLessThan(at(0).value);
    expect(six).toBeGreaterThan(at(12).value);
  });

  it("never reaches zero", () => {
    const ancient = at(30 * 12).value;
    expect(ancient).toBeGreaterThan(0);
    expect(ancient).toBeCloseTo(PRICE * config.depreciation.floorPct, 6);
  });

  it("puts electric below petrol, which is the case this site is mostly about", () => {
    expect(at(12, "electric").value).toBeLessThan(at(12, "petrol").value);
    expect(at(36, "electric").value).toBeLessThan(at(36, "petrol").value);
  });

  it("files a plug-in hybrid with the hybrids, whatever the FBT rules think", () => {
    expect(depreciationClass("phev")).toBe("hybrid");
    expect(at(24, "phev").value).toBeCloseTo(at(24, "hybrid").value, 6);
  });

  it("treats petrol and diesel the same, because the market does", () => {
    expect(at(24, "petrol").value).toBeCloseTo(at(24, "diesel").value, 6);
  });
});

/**
 * The band is the point.
 *
 * After two years the average Australian EV retained 68.7% of its price — a
 * Model 3 retained 54% and a BYD Seal 78%. The model matters more than the
 * curve, so a single number would be false precision and the interface never
 * shows one without its range.
 */
describe("The range around it", () => {
  it("brackets the estimate", () => {
    const r = at(24);
    expect(r.low).toBeLessThan(r.value);
    expect(r.high).toBeGreaterThan(r.value);
  });

  it("widens the further out it guesses", () => {
    const near = at(12);
    const far = at(48);
    const width = (e: typeof near) => (e.high - e.low) / e.value;
    expect(width(far)).toBeGreaterThan(width(near));
  });

  it("stops widening, or it would say nothing at all", () => {
    // Measured on the upper half: the lower one is clamped by the floor once
    // the car is old enough, which narrows the band for a different reason.
    const upper = (m: number) => at(m).high / at(m).value - 1;
    expect(upper(120)).toBeCloseTo(config.depreciation.maxSpread, 6);
    expect(upper(240)).toBeCloseTo(upper(120), 6);
  });

  it("keeps the low end above the floor", () => {
    expect(at(30 * 12).low).toBeGreaterThanOrEqual(PRICE * config.depreciation.floorPct - 1e-9);
  });
});

/**
 * The question the residual actually poses.
 *
 * The paydown chart stops reassuringly at the balloon. Whether that is a
 * formality or a bill depends entirely on what the car is worth on the day,
 * and nothing on the site has ever said.
 */
describe("Owing against worth", () => {
  const inputs: LeaseInputs = {
    ...defaultInputs(config),
    fuelType: "electric",
    vehiclePrice: PRICE,
    termYears: 5,
  };
  const finance = buildFinance(inputs, config);
  const schedule = amortisationSchedule(
    finance.amountFinanced,
    finance.residual,
    inputs.interestRatePct,
    60,
  );

  it("reports the gap between the two, signed", () => {
    const e = equityAt(PRICE, "electric", 60, finance.residual, config);
    expect(e.equity).toBeCloseTo(e.value - finance.residual, 6);
    expect(e.underwater).toBe(e.value < finance.residual);
  });

  /**
   * The finding this whole model exists to produce.
   *
   * On a five-year lease over a $60,000 electric car the driver is underwater
   * from somewhere in the first year until somewhere in the third: the car
   * takes its biggest hit immediately while the balance has barely moved, and
   * the balance only overtakes it later. Walk away in year two and the
   * shortfall is real, and it is paid from already-taxed money.
   */
  it("goes underwater during the first year", () => {
    expect(equityAt(PRICE, "electric", 12, schedule[12].balance, config).underwater).toBe(true);
  });

  it("is still underwater two years in", () => {
    expect(equityAt(PRICE, "electric", 24, schedule[24].balance, config).underwater).toBe(true);
  });

  it("is back above water before the end", () => {
    expect(equityAt(PRICE, "electric", 48, schedule[48].balance, config).underwater).toBe(false);
    expect(equityAt(PRICE, "electric", 60, schedule[60].balance, config).underwater).toBe(false);
  });

  it("recovers as the balance falls faster than the car does", () => {
    const early = equityAt(PRICE, "electric", 12, schedule[12].balance, config).equity;
    const late = equityAt(PRICE, "electric", 60, schedule[60].balance, config).equity;
    expect(late).toBeGreaterThan(early);
  });
});
