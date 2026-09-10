// The FBT year is not the financial year.
//
// Income tax runs 1 July to 30 June. Fringe benefits tax runs 1 April to
// 31 March. Nearly every mistake in this area starts by assuming they are the
// same, and a novated lease straddles both: the salary deduction is an
// income-tax question, the employee contribution that cancels FBT is an
// FBT-year question.
//
// It matters because the statutory formula pro-rates. Taxable value is
// 20% of base value times the fraction of the FBT year the car was available
// for private use — so a lease delivered in November attracts about five
// months of FBT in its first year, not twelve. Every provider quote is written
// on a full-year assumption and says so in the fine print; the first year's
// deduction is then adjusted, which is a surprise nobody enjoys on a payslip.

const DAY_MS = 86_400_000;

export interface FbtYear {
  /** 1 April. */
  start: Date;
  /** 31 March. */
  end: Date;
  /** 365, or 366 when the year spans a 29 February. */
  days: number;
  /** e.g. "2026-27" — the FBT year is named for the years it spans. */
  label: string;
}

/** The FBT year containing a given date. */
export function fbtYearFor(date: Date): FbtYear {
  const y = date.getUTCFullYear();
  // Before April, the date belongs to the FBT year that began the previous April.
  const startYear = date.getUTCMonth() >= 3 ? y : y - 1;
  const start = new Date(Date.UTC(startYear, 3, 1));
  const end = new Date(Date.UTC(startYear + 1, 2, 31));
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  return {
    start,
    end,
    days,
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}

/** Days the car is available for private use in the FBT year it is first held,
 *  counting the first day and the last. */
export function daysAvailableInFirstFbtYear(firstHeld: Date): number {
  const fy = fbtYearFor(firstHeld);
  const from = firstHeld < fy.start ? fy.start : firstHeld;
  return Math.round((fy.end.getTime() - from.getTime()) / DAY_MS) + 1;
}

/**
 * The fraction of a full FBT year the car is held for, in the year it starts.
 * 1 for a lease beginning on 1 April; about 0.41 for one beginning 1 November.
 *
 * Returns 1 for an unparseable or absent date — a missing start date should
 * leave the full-year assumption alone rather than silently discount it.
 */
export function fbtProRataFactor(firstHeld: Date | string | null | undefined): number {
  if (firstHeld == null) return 1;
  const d = firstHeld instanceof Date ? firstHeld : new Date(`${firstHeld}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 1;
  const fy = fbtYearFor(d);
  return Math.min(1, Math.max(0, daysAvailableInFirstFbtYear(d) / fy.days));
}
