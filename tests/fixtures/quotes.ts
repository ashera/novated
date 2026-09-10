// Fixtures taken from four real novated lease quotes, collected July–August 2025
// for the same class of vehicle (a battery-electric compact SUV, ~$84k–93k
// drive-away) on a $130,000 salary over 60 months.
//
// DE-IDENTIFIED ON PURPOSE. Providers are "A", "B" and "C", and no customer
// detail is carried over. This repository is public, and the standing decision
// is that market findings are published as anonymised ranges — a provider is
// named only to the user who holds that quote, inside their own account. The
// figures themselves are unaltered, because the whole value of the fixture is
// that the engine has to reproduce real documents.
//
// What makes them worth keeping as fixtures:
//   • not one of the four states an interest rate
//   • all four break the finance line out, so all four can be solved
//   • two are the same car from the same provider three days apart, and differ
//     in both the rate and the running-cost budget
//   • two of them do not reconcile: the itemised lines don't sum to the stated
//     salary deduction

import type { Quote } from "@/lib/au/quote";

/** Provider A — monthly figures, ex GST. Itemises a luxury car charge. */
export const QUOTE_A: Quote = {
  label: "Provider A",
  frequency: "monthly",
  vehiclePrice: 84_219,
  fuelType: "electric",
  amountFinanced: 77_885,
  residualIncGst: 24_100,
  termMonths: 60,
  salary: 130_000,
  annualKm: 15_000,
  lines: {
    finance: 1_408.53,
    energy: 52.5,
    luxuryCarAdjustment: 42.15,
    tyres: 34.67,
    registration: 50.96,
    maintenance: 35.0,
    insurance: 117.32,
    managementFee: 39.0,
  },
};

/** Provider B — fortnightly, net of GST. The only quote of the four whose
 *  itemised lines reconcile exactly to the stated deduction, because it is the
 *  only one that shows the luxury car adjustment as its own line. */
export const QUOTE_B: Quote = {
  label: "Provider B",
  frequency: "fortnightly",
  vehiclePrice: 84_219,
  fuelType: "electric",
  amountFinanced: 74_574,
  residualIncGst: 23_075.56,
  termMonths: 60,
  salary: 102_078,
  annualKm: 15_000,
  statedPreTax: 841.89,
  statedPostTax: 0,
  lines: {
    finance: 600.51,
    energy: 24.23,
    maintenance: 18.46,
    tyres: 15.38,
    registration: 35.27,
    insurance: 120.28,
    roadside: 0,
    managementFee: 16.15,
    luxuryCarAdjustment: 11.58,
  },
};

/** Provider C — fortnightly, ex GST. States the amount financed outright. */
export const QUOTE_C: Quote = {
  label: "Provider C",
  frequency: "fortnightly",
  vehiclePrice: 93_423.15,
  fuelType: "electric",
  amountFinanced: 87_089.15,
  residualIncGst: 26_948.0,
  termMonths: 60,
  salary: 130_000,
  annualKm: 15_000,
  statedPreTax: 990.7,
  statedPostTax: 0,
  lines: {
    finance: 711.25,
    energy: 24.23,
    registration: 29.23,
    maintenance: 20.77,
    tyres: 15.69,
    insurance: 134.42,
    managementFee: 13.85,
  },
};

/** Provider C again — same car, three days later, after a cheaper dealer price
 *  was supplied. Both the rate and the maintenance budget moved. */
export const QUOTE_C_REQUOTE: Quote = {
  label: "Provider C (re-quote)",
  frequency: "fortnightly",
  vehiclePrice: 84_429.0,
  fuelType: "electric",
  amountFinanced: 78_095.0,
  residualIncGst: 24_164.93,
  termMonths: 60,
  salary: 130_000,
  annualKm: 15_000,
  statedPreTax: 840.88,
  statedPostTax: 0,
  lines: {
    finance: 599.81,
    energy: 24.23,
    registration: 30.77,
    maintenance: 4.62,
    tyres: 13.23,
    insurance: 134.42,
    managementFee: 13.85,
  },
};

/** The rate each quote is actually written at, solved from its own figures.
 *  None of the four documents states one. */
export const EXPECTED_RATES = {
  A: 10.8,
  B: 9.72,
  C: 10.14,
  C_REQUOTE: 8.33,
};

export const ALL_QUOTES = [QUOTE_A, QUOTE_B, QUOTE_C, QUOTE_C_REQUOTE];
