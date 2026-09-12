// What you actually pay for a car, and which parts of it matter where.
//
// "Price" is the single most consequential number a user types here, and it is
// the one most often wrong — because a dealer's drive-away figure bundles
// together things the tax rules treat completely differently:
//
//   - the CAR — the negotiated price, dealer delivery, and anything fitted
//     before it is handed over. GST-inclusive. This is what the FBT base value
//     is worked out on and what the GST credit is claimed against.
//
//   - the ON-ROADS — stamp duty, registration, CTP and plates. Usually
//     financed along with the car, so they are part of what you repay, but
//     the ATO expressly excludes them from the base value.
//
// Entering a drive-away figure as "the price" therefore overstates the FBT on
// every non-exempt car, by 20% of the on-roads every year. On a $3,000 on-road
// bill that is $600 of taxable value a year that should not be there.
//
// Sources for the split: ATO, "Taxable value of a car fringe benefit —
// statutory formula method", and TR 2011/3 on cost price. The base value
// includes dealer delivery, GST, luxury car tax, customs duty and fitted
// non-business accessories; it excludes registration, stamp duty, CTP and
// extended warranties.

import type { EngineConfig } from "./config";
import { carGstCredit } from "./novated";

export interface PurchaseBreakdown {
  /** Negotiated price of the vehicle itself, GST inclusive. */
  vehicle?: number;
  /** The dealer's delivery/handling charge. Part of the car's cost. */
  delivery?: number;
  /** Accessories fitted before delivery — tow bar, tint, mats, racks. */
  accessories?: number;
  /** Motor vehicle stamp duty. */
  stampDuty?: number;
  /** Registration for the first period. */
  registration?: number;
  /** Compulsory third party insurance, where it is billed separately. */
  ctp?: number;
  /** Number plates, including a personalised set. */
  plates?: number;
  /** Anything else on the invoice the user wants to carry. */
  other?: number;
  /**
   * Whether the on-road costs are being financed with the car.
   *
   * Normally yes on a novated lease — the provider pays the dealer the whole
   * invoice. Someone paying the on-roads themselves is a real case though, and
   * it changes what is repaid without changing the FBT.
   */
  financeOnRoads?: boolean;
}

/** The parts that make up the car's cost price for tax purposes. */
export const CAR_PARTS = ["vehicle", "delivery", "accessories"] as const;

/** The parts the ATO excludes from the base value. */
export const ON_ROAD_PARTS = ["stampDuty", "registration", "ctp", "plates", "other"] as const;

const sum = (b: PurchaseBreakdown, keys: readonly (keyof PurchaseBreakdown)[]) =>
  keys.reduce((total, k) => total + (typeof b[k] === "number" ? (b[k] as number) : 0), 0);

/**
 * The car's cost price, GST inclusive.
 *
 * Drives the FBT base value, the GST credit and the luxury car tax tests.
 */
export function carCost(b: PurchaseBreakdown): number {
  return sum(b, CAR_PARTS);
}

/** Stamp duty, registration, CTP and the rest — excluded from the base value. */
export function onRoadCosts(b: PurchaseBreakdown): number {
  return sum(b, ON_ROAD_PARTS);
}

/** What the dealer's invoice comes to: the figure usually called drive-away. */
export function driveAwayTotal(b: PurchaseBreakdown): number {
  return carCost(b) + onRoadCosts(b);
}

/** The part of the purchase the lease is written over, before the GST credit
 *  is taken off. On-roads only count when they are being financed. */
export function amountToFinance(b: PurchaseBreakdown): number {
  return carCost(b) + (b.financeOnRoads === false ? 0 : onRoadCosts(b));
}

/**
 * What the lease is actually written over.
 *
 * Not the invoice: the financier buys the car, claims the GST back and writes
 * the lease over what is left. Everything on this site explains that, so the
 * builder cannot be the one place that quietly calls the drive-away total
 * "financed".
 */
export function financedAfterGstCredit(b: PurchaseBreakdown, config: EngineConfig): number {
  return amountToFinance(b) - carGstCredit(carCost(b), config);
}

/** True once there is enough to work with — the car itself is the only part
 *  that cannot be left out. */
export function hasCarCost(b: PurchaseBreakdown): boolean {
  return typeof b.vehicle === "number" && b.vehicle > 0;
}

/** Nothing entered at all, so nothing to carry. */
export function isEmpty(b: PurchaseBreakdown): boolean {
  return (
    !hasCarCost(b) &&
    carCost(b) === 0 &&
    onRoadCosts(b) === 0
  );
}
