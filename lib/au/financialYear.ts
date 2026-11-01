import { financialYearOf } from "./novated";

/**
 * Australian financial years, for reading a ledger the way an accountant does.
 *
 * 1 July to 30 June, labelled by the year it starts in — "2025-26" runs from
 * 1 July 2025 to 30 June 2026. Not the FBT year, which ends on 31 March and
 * lives in fbtYear.ts; the two are a quarter apart and a lease touches both,
 * so they are kept in separate modules rather than one "year" helper that
 * would invite picking whichever was imported.
 *
 * Pure, and nothing here reads the clock on its own — {@link
 * lastCompletedFinancialYear} is given today rather than finding it, so a
 * server and a browser rendering the same page cannot disagree about which
 * year is the default.
 */

/** The year a date falls in, as "2025-26". */
export function financialYearOfIso(iso: string): string {
  return financialYearOf(new Date(`${iso}T00:00:00Z`));
}

/** First and last day of a financial year, as ISO dates. */
export function financialYearRange(fy: string): { from: string; to: string } {
  const start = Number(fy.slice(0, 4));
  return { from: `${start}-07-01`, to: `${start + 1}-06-30` };
}

/**
 * The most recent year that has finished.
 *
 * On 1 November 2026 that is 2025-26: the current year began on 1 July and
 * has months to run, so the last one an accountant can actually close is the
 * one before it. On 30 June it is still the year before — the year in
 * progress does not become complete until it ends.
 */
export function lastCompletedFinancialYear(today: Date): string {
  const current = financialYearOf(today);
  const start = Number(current.slice(0, 4));
  return `${start - 1}-${String(start % 100).padStart(2, "0")}`;
}

/** Every financial year the given dates touch, most recent first. */
export function financialYearsIn(dates: string[]): string[] {
  const seen = new Set<string>();
  for (const d of dates) if (d) seen.add(financialYearOfIso(d));
  return [...seen].sort().reverse();
}

/** Readable form for a label: "2025-26 (Jul 2025 – Jun 2026)". */
export function financialYearLabel(fy: string): string {
  const start = Number(fy.slice(0, 4));
  return `${fy} (Jul ${start} – Jun ${start + 1})`;
}

/** Keep only what falls in one financial year. `null` keeps everything. */
export function inFinancialYear<T extends { date: string }>(
  rows: T[],
  fy: string | null,
): T[] {
  if (fy == null) return rows;
  const { from, to } = financialYearRange(fy);
  return rows.filter((r) => r.date >= from && r.date <= to);
}
