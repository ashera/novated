// What the car is likely to be worth later.
//
// This is the first FORECAST on the site, and it has to be handled differently
// from everything else here. Every other number is arithmetic on a published
// rule with a citation behind it: get the inputs right and the answer is not a
// matter of opinion. A resale value is a guess about a market three or five
// years out, and the honest version of it is a range.
//
// How wide a range is the whole design. After two years the average Australian
// EV retained 68.7% of its price — but a Model 3 retained 54% and a BYD Seal
// 78%. That 24-point spread is not noise around a good estimate, it IS the
// estimate: the model you choose matters more than the curve. So nothing here
// returns a single number, the interface never shows one without its band, and
// a user with a real Redbook figure can overwrite the lot.
//
// The shape is a first-year drop then declining balance, because that is what
// the market does — a car loses most of what it will lose in the drive home,
// and the curve flattens after. Straight-line depreciation is the wrong shape
// and would understate the early years, which is exactly where a novated lease
// is most likely to end badly.
//
// Measured against the CAR's price, not the drive-away total. Stamp duty,
// registration and CTP are gone the moment they are paid: nobody buying the
// car second-hand pays you back for them.

import type { EngineConfig } from "./config";
import type { FuelType } from "./novated";

/** The depreciation classes we hold a curve for. */
export type DepreciationClass = "electric" | "hybrid" | "other";

/** Which curve a fuel type follows. Plug-in hybrids sit with hybrids: they
 *  are a hybrid to a second-hand buyer, whatever the FBT rules think. */
export function depreciationClass(fuelType: FuelType): DepreciationClass {
  if (fuelType === "electric") return "electric";
  if (fuelType === "hybrid" || fuelType === "phev") return "hybrid";
  return "other";
}

export interface ResaleEstimate {
  /** The middle of the range — what an average example is worth. */
  value: number;
  /** A model that holds its value badly. */
  low: number;
  /** A model that holds it well. */
  high: number;
  /** Fraction of the original price the middle estimate represents. */
  retained: number;
}

/**
 * What the car is worth after a given number of months.
 *
 * `price` is the car's GST-inclusive cost — what it sold for, not what was
 * financed and not the drive-away total.
 *
 * Months rather than years because both callers want arbitrary points: the
 * paydown chart draws one per payment, and an early termination happens
 * whenever it happens.
 */
export function resaleValue(
  price: number,
  fuelType: FuelType,
  months: number,
  config: EngineConfig,
): ResaleEstimate {
  const d = config.depreciation;
  const cls = depreciationClass(fuelType);
  const first = d.firstYearPct[cls];
  const annual = d.annualPct[cls];

  const years = Math.max(0, months) / 12;
  // The first year's drop is applied pro rata within that year, so the curve
  // is continuous rather than stepping down on each anniversary — a chart
  // drawn monthly would otherwise look like a staircase.
  const retainedRaw =
    years <= 1
      ? 1 - first * years
      : (1 - first) * Math.pow(1 - annual, years - 1);

  // A car is never worth nothing. Below this it is a trade-in, and the figure
  // stops meaning anything.
  const retained = Math.max(d.floorPct, retainedRaw);
  const value = price * retained;

  // The band widens with time, because the further out the guess the less the
  // class average tells you about any one car.
  const spread = Math.min(d.maxSpread, d.spread * Math.max(1, years));
  return {
    value,
    low: Math.max(price * d.floorPct, value * (1 - spread)),
    high: value * (1 + spread),
    retained,
  };
}

/**
 * Whether the car is worth less than what is still owed on it.
 *
 * The question the residual actually poses, and the one a paydown chart that
 * stops reassuringly at the balloon never answers.
 */
export function equityAt(
  price: number,
  fuelType: FuelType,
  months: number,
  owing: number,
  config: EngineConfig,
): { value: number; owing: number; equity: number; underwater: boolean } {
  const { value } = resaleValue(price, fuelType, months, config);
  return { value, owing, equity: value - owing, underwater: value < owing };
}
