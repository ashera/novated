// The rate at which a novated lease stops being worth it.
//
// Every lease comparison on this site answers "is this one any good". None of
// them answered the more useful question behind it: how bad would the finance
// rate have to be before a plain bank loan wins? That number exists, it is
// specific to the car, and nobody publishes it — partly because working it out
// requires an engine that models the tax properly, and partly because the
// people who could work it out sell leases.
//
// It turned up while writing a test. Pinning the property "a worse lease rate
// must never widen the lease's lead" meant asking where the lead actually
// runs out, and the answer differed so sharply between an exempt electric car
// and a packaged petrol one that it was worth publishing rather than
// asserting.
//
// Solved rather than tabulated, so it stays true when the tax does. Change the
// FBT rate, the thresholds or the brackets and every figure here moves with
// them — which is the one thing a hand-written article can never do.

import type { EngineConfig } from "./config";
import { calculateLease, type FuelType, type LeaseInputs } from "./novated";

export interface CrossoverPoint {
  ratePct: number;
  savingVsLoan: number;
}

export interface Crossover {
  /** The scenario this was solved for, named for a reader. */
  label: string;
  fuelType: FuelType;
  /** Whether the car draws the electric-car FBT exemption. */
  exempt: boolean;
  /**
   * The lease finance rate at which the lease stops beating a car loan, or
   * null if it still wins at every rate searched — which is itself a finding.
   */
  ratePct: number | null;
  /** A few rates either side, for showing the shape rather than one number. */
  points: CrossoverPoint[];
}

/** Where the search gives up. Beyond this nobody is signing anything. */
const MIN_RATE = 0.5;
const MAX_RATE = 60;

/**
 * The finance rate at which a lease's advantage runs out.
 *
 * Solved by bisection rather than stepped, because the answer is reported to
 * a tenth of a per cent and stepping finely enough to get there would mean
 * hundreds of full tax computations per car.
 *
 * The saving falls monotonically as the rate rises — a more expensive lease is
 * never a better one, and a test in lease-package holds that — so bisection is
 * sound here.
 */
export function crossoverRate(
  inputs: LeaseInputs,
  config: EngineConfig,
): number | null {
  const savingAt = (ratePct: number) =>
    calculateLease({ ...inputs, interestRatePct: ratePct }, config).comparison.savingVsLoan;

  if (savingAt(MIN_RATE) < 0) return MIN_RATE; // already behind at any plausible rate
  if (savingAt(MAX_RATE) > 0) return null; // still ahead at the top of the range

  let lo = MIN_RATE;
  let hi = MAX_RATE;
  for (let i = 0; i < 60 && hi - lo > 0.005; i++) {
    const mid = (lo + hi) / 2;
    if (savingAt(mid) > 0) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 10) / 10;
}

/** The crossover plus the shape around it, for one car. */
export function solveCrossover(
  label: string,
  inputs: LeaseInputs,
  config: EngineConfig,
  sampleRates: number[] = [5, 10, 15, 20, 25, 30],
): Crossover {
  const at = (ratePct: number) => calculateLease({ ...inputs, interestRatePct: ratePct }, config);
  return {
    label,
    fuelType: inputs.fuelType,
    exempt: at(config.lease.defaultInterestRatePct).fbt.exempt,
    ratePct: crossoverRate(inputs, config),
    points: sampleRates.map((ratePct) => ({
      ratePct,
      savingVsLoan: at(ratePct).comparison.savingVsLoan,
    })),
  };
}
