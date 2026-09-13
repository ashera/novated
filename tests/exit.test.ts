import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { calculateLease, defaultInputs, type LeaseInputs } from "@/lib/au/novated";
import { exitSchedule, worstExit } from "@/lib/au/exit";

const config = DEFAULT_CONFIG;
const base = defaultInputs(config);
const lease = (o: Partial<LeaseInputs> = {}) =>
  calculateLease({ ...base, fuelType: "electric", vehiclePrice: 60_000, termYears: 5, ...o }, config);

/**
 * The part of a novated lease nobody is shown at the start.
 *
 * The novation ends when the job does; the lease does not. It reverts to the
 * employee in full, and from that moment it is paid out of money that has
 * already been taxed. Everything else on this site describes a lease where
 * nothing goes wrong.
 */
describe("Getting out early", () => {
  const points = exitSchedule(lease(), config);

  it("gives a row for every year but the last", () => {
    // Ending on the final day is just paying the residual, which the paydown
    // chart already covers.
    expect(points.map((p) => p.year)).toEqual([1, 2, 3, 4]);
  });

  // The honest difficulty: some financiers rebate the interest you have not
  // yet been charged, and some want every remaining rental. It is in a
  // contract nobody reads until they need to, so both ends get modelled.
  it("brackets the payout rather than picking one convention", () => {
    for (const p of points) {
      expect(p.payoutWorst, `year ${p.year}`).toBeGreaterThan(p.payoutBest);
    }
  });

  it("converges as the term runs out, because there is less interest to rebate", () => {
    const gap = (p: (typeof points)[number]) => p.payoutWorst - p.payoutBest;
    expect(gap(points[points.length - 1])).toBeLessThan(gap(points[0]));
  });

  it("falls over time on both conventions", () => {
    for (let i = 1; i < points.length; i++) {
      expect(points[i].payoutBest).toBeLessThan(points[i - 1].payoutBest);
      expect(points[i].payoutWorst).toBeLessThan(points[i - 1].payoutWorst);
    }
  });

  it("measures the shortfall against what the car would actually fetch", () => {
    for (const p of points) {
      expect(p.shortfallBest).toBeCloseTo(p.payoutBest - p.resale.value, 6);
      expect(p.shortfallWorst).toBeCloseTo(p.payoutWorst - p.resale.value, 6);
      expect(p.short).toBe(p.payoutBest > p.resale.value);
    }
  });

  /**
   * The finding. On a five-year lease over a $60,000 electric car, walking
   * away in the first two years costs real money even on the kinder payout —
   * and it is money that has already been taxed, so a dollar of it is a
   * dollar, not sixty-eight cents.
   */
  it("is short in the early years", () => {
    expect(points[0].short).toBe(true);
    expect(points[0].shortfallBest).toBeGreaterThan(0);
  });

  it("recovers by the end of the term", () => {
    expect(points[points.length - 1].short).toBe(false);
  });

  // Not the first year and not the last: the car takes its hit immediately,
  // the balance catches up later, and the gap is widest in between.
  it("finds the worst year for you", () => {
    const worst = worstExit(points)!;
    expect(worst).toBeTruthy();
    for (const p of points) expect(worst.shortfallBest).toBeGreaterThanOrEqual(p.shortfallBest);
  });

  it("has nothing to say about a one-year lease", () => {
    expect(exitSchedule(lease({ termYears: 1 }), config)).toEqual([]);
    expect(worstExit([])).toBeNull();
  });
});

describe("Different cars, different exposure", () => {
  it("hurts more on a car that depreciates faster", () => {
    const evWorst = worstExit(exitSchedule(lease({ fuelType: "electric" }), config))!;
    const petrolWorst = worstExit(
      exitSchedule(lease({ fuelType: "petrol", fbtMethod: "ecm" }), config),
    )!;
    expect(evWorst.shortfallBest).toBeGreaterThan(petrolWorst.shortfallBest);
  });

  it("scales with the size of the car", () => {
    const big = worstExit(exitSchedule(lease({ vehiclePrice: 90_000 }), config))!;
    const small = worstExit(exitSchedule(lease({ vehiclePrice: 40_000 }), config))!;
    expect(big.shortfallBest).toBeGreaterThan(small.shortfallBest);
  });

  // A bigger residual means less of the debt retired along the way, so more
  // of it is still outstanding whenever the lease stops.
  it("is worse with a padded residual", () => {
    const minimum = worstExit(exitSchedule(lease(), config))!;
    const padded = worstExit(exitSchedule(lease({ residualPct: 45 }), config))!;
    expect(padded.shortfallBest).toBeGreaterThan(minimum.shortfallBest);
  });
});
