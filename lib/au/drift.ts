// Where the running site disagrees with the source.
//
// The calculator reads its rates from a row in the database, not from
// config.ts. getActiveConfig() returns that row; withDefaults backfills keys
// that are MISSING, so a newly added parameter appears with its default and
// everything keeps working. A key that is already there with a stale value is
// never touched.
//
// Which means a reference-data fix made in code does not reach production. It
// happened: lct.thresholdOther was found a year stale, corrected to $80,809 in
// DEFAULT_CONFIG, and the live site went on serving $80,567 for six days. The
// verification was real, the fix was real, and neither arrived.
//
// Nothing noticed, and nothing could have. computeStaleness measures DATES —
// how long since a source was last reviewed — so a value that is wrong but
// recently ticked reads as fresh. Staleness answers "has anyone looked at
// this lately"; this answers "does what we serve match what we believe".
//
// It deliberately does not auto-correct. Storing the config in the database is
// what lets a rate be fixed without a deploy, and an admin's edit is a
// legitimate reason for the two to differ — as is a version kept for a past
// financial year. Overwriting on sight would quietly undo real work. So this
// reports, and a human decides which way each difference should resolve.

import { configToRows, type ParamRow } from "./params";
import { DEFAULT_CONFIG, type EngineConfig } from "./config";

export interface Divergence {
  key: string;
  label: string;
  category: string;
  path: string;
  unit: ParamRow["unit"];
  sourceKey: string;
  /** What the running site serves. */
  active: number;
  /** What config.ts says it should be. */
  expected: number;
}

/**
 * Every parameter where the stored config disagrees with the code default.
 *
 * Compared through configToRows so the check covers every parameter that has
 * a descriptor — which reference-data.test.ts already requires to be all of
 * them. Add a parameter and it is watched here for free; that is the whole
 * reason to go through the descriptors rather than walking the object.
 *
 * A key missing from the stored config is not a divergence. configToRows
 * falls back to the default for those, which is exactly what the running site
 * does, so what it reports is what is actually being served.
 */
export function findDrift(
  active: EngineConfig,
  expected: EngineConfig = DEFAULT_CONFIG,
): Divergence[] {
  const want = new Map(configToRows(expected).map((r) => [r.key, r.value]));
  const out: Divergence[] = [];

  for (const row of configToRows(active)) {
    const e = want.get(row.key);
    if (e === undefined) continue; // descriptor gone from the code — not a value problem
    if (same(row.value, e)) continue;
    out.push({
      key: row.key,
      label: row.label,
      category: row.category,
      path: row.path,
      unit: row.unit,
      sourceKey: row.sourceKey,
      active: row.value,
      expected: e,
    });
  }
  return out;
}

/**
 * Equal enough not to be worth a human's time.
 *
 * Infinity has to compare equal to itself — the top tax bracket and the top
 * HELP band both use it, and it round-trips through Postgres as null before
 * reviveConfig puts it back, so it passes through here on every check. The
 * epsilon is for percentages stored as fractions, where 0.47 can come back
 * from JSON a few bits out and is not news.
 */
function same(a: number, b: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 1e-9;
}

/** Divergences grouped for display, worst-looking category first. */
export function driftByCategory(rows: Divergence[]): [string, Divergence[]][] {
  const by = new Map<string, Divergence[]>();
  for (const r of rows) by.set(r.category, [...(by.get(r.category) ?? []), r]);
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}
