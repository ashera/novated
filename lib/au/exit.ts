// What happens if the lease ends early.
//
// A novated lease is three agreements at once, and the novation — the part
// where the employer makes the payments out of pre-tax salary — is the part
// that ends when the job does. The lease itself does not. It reverts to the
// employee, in full, and from that moment it is paid out of money that has
// already been taxed.
//
// So the question is not "can I get out" but "what does getting out cost",
// and it has three parts:
//
//   1. what is still owed on the finance
//   2. what the car is actually worth
//   3. the gap, which is a cheque somebody writes
//
// Part 1 has no single answer, and this is the honest difficulty. Some
// financiers take the discounted balance — you pay out the loan and the
// unearned interest goes away. Others require every remaining rental plus the
// residual, which on a five-year lease ended in year two is a very different
// number. It is in a contract nobody reads until they need to, so both ends
// are modelled and neither is presented as THE answer.
//
// Deliberately not modelled: the termination fee. Providers charge one, they
// vary, and inventing a figure would be worse than saying it exists and is not
// in here.

import type { EngineConfig } from "./config";
import { amortisationSchedule, type LeaseResult } from "./novated";
import { resaleValue, type ResaleEstimate } from "./resale";

export interface ExitPoint {
  month: number;
  /** Whole years, for labelling. */
  year: number;
  /** Owed if the financier rebates the interest you haven't yet been charged. */
  payoutBest: number;
  /** Owed if every remaining rental has to be paid, plus the residual. */
  payoutWorst: number;
  /** What the car is likely to fetch, with its range. */
  resale: ResaleEstimate;
  /** Payout less resale. Positive means writing a cheque. */
  shortfallBest: number;
  shortfallWorst: number;
  /** True when even the kinder payout leaves the driver short. */
  short: boolean;
}

/**
 * What walking away costs, at the end of each year of the term.
 *
 * Anniversaries rather than every month because the question people actually
 * ask is "what if I lose my job next year", and a row per month would bury
 * that in 60 rows of arithmetic. The final year is excluded: ending a lease on
 * its last day is just paying the residual, which the chart already covers.
 */
export function exitSchedule(result: LeaseResult, config: EngineConfig): ExitPoint[] {
  const { finance, inputs, term } = result;
  const months = term.years * 12;
  const schedule = amortisationSchedule(
    finance.amountFinanced,
    finance.residual,
    inputs.interestRatePct,
    months,
  );

  const points: ExitPoint[] = [];
  for (let year = 1; year < term.years; year++) {
    const month = year * 12;
    const balance = schedule[month]?.balance ?? finance.residual;
    // Every rental still to come, plus the lump at the end of them.
    const remaining = finance.monthlyPayment * (months - month) + finance.residual;
    const resale = resaleValue(inputs.vehiclePrice, inputs.fuelType, month, config);
    points.push({
      month,
      year,
      payoutBest: balance,
      payoutWorst: remaining,
      resale,
      shortfallBest: balance - resale.value,
      shortfallWorst: remaining - resale.value,
      short: balance > resale.value,
    });
  }
  return points;
}

/**
 * The worst year, which is the one worth knowing about.
 *
 * Not the first and not the last: a lease is usually deepest underwater
 * somewhere in the middle, once the car has taken its first-year hit and the
 * balance has not yet caught up.
 */
export function worstExit(points: ExitPoint[]): ExitPoint | null {
  if (points.length === 0) return null;
  return points.reduce((worst, p) => (p.shortfallBest > worst.shortfallBest ? p : worst));
}
