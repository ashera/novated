// Pure staleness calculation for reference-data sources.
// A source is stale when it hasn't been refreshed within its review interval.

export type StaleState = "fresh" | "due" | "stale" | "none";

export interface Staleness {
  state: StaleState;
  neverRefreshed: boolean;
  ageDays: number | null; // days since last refresh
  overdueDays: number | null; // >0 = overdue; negative = days until due
  intervalDays: number | null;
}

// Within this many days of the interval, flag "due soon".
const DUE_SOON_WINDOW = 30;
const DAY_MS = 86_400_000;

function toUtcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function computeStaleness(
  lastUpdatedFrom: string | null,
  intervalDays: number | null,
  now: Date,
): Staleness {
  if (intervalDays == null || intervalDays <= 0) {
    return {
      state: "none",
      neverRefreshed: lastUpdatedFrom == null,
      ageDays: null,
      overdueDays: null,
      intervalDays: intervalDays ?? null,
    };
  }
  if (!lastUpdatedFrom) {
    return {
      state: "stale",
      neverRefreshed: true,
      ageDays: null,
      overdueDays: null,
      intervalDays,
    };
  }
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const ageDays = Math.floor((today - toUtcDay(lastUpdatedFrom)) / DAY_MS);
  const overdueDays = ageDays - intervalDays;
  let state: StaleState = "fresh";
  if (overdueDays > 0) state = "stale";
  else if (overdueDays >= -DUE_SOON_WINDOW) state = "due";
  return { state, neverRefreshed: false, ageDays, overdueDays, intervalDays };
}
