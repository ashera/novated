import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, reviveConfig, type EngineConfig } from "@/lib/au/config";
import { findDrift, driftByCategory, driftVerdict } from "@/lib/au/drift";
import { PARAM_DESCRIPTORS, configToRows, fmtParamValue, setByPath } from "@/lib/au/params";

const clone = () => structuredClone(DEFAULT_CONFIG) as EngineConfig;

/**
 * What the site serves, against what we believe.
 *
 * The calculator reads its rates from a database row, and withDefaults only
 * backfills keys that are MISSING — so a key already present with a stale
 * value survives any amount of fixing in config.ts. It happened:
 * lct.thresholdOther was verified against the ATO, corrected in code, and the
 * live site went on serving the old figure for six days with nothing to
 * notice. Staleness could not have caught it, because staleness measures how
 * long since a source was reviewed, not whether the number is right.
 */
describe("Drift between the stored config and the source", () => {
  it("finds nothing when they agree", () => {
    expect(findDrift(DEFAULT_CONFIG)).toEqual([]);
    expect(findDrift(clone())).toEqual([]);
  });

  // The actual incident, reproduced.
  it("catches a stale value that a code fix never reached", () => {
    const stored = setByPath(clone(), "lct.thresholdOther", 80_567);
    const drift = findDrift(stored);
    expect(drift).toHaveLength(1);
    expect(drift[0].path).toBe("lct.thresholdOther");
    expect(drift[0].active).toBe(80_567);
    expect(drift[0].expected).toBe(DEFAULT_CONFIG.lct.thresholdOther);
  });

  it("reports enough to act on without another lookup", () => {
    const stored = setByPath(clone(), "fbt.statutoryRate", 0.17);
    const [d] = findDrift(stored);
    expect(d.key).toBeTruthy();
    expect(d.label).toBeTruthy();
    expect(d.category).toBeTruthy();
    expect(d.sourceKey).toBeTruthy();
    expect(d.unit).toBe("percent");
    // The label is what an admin reads before clicking Adopt.
    expect(fmtParamValue(d.expected, d.unit)).toBe("20%");
  });

  it("finds every divergence, not just the first", () => {
    let stored = setByPath(clone(), "lct.thresholdOther", 1);
    stored = setByPath(stored, "gst.carLimit", 2);
    stored = setByPath(stored, "fbt.rate", 0.5);
    expect(findDrift(stored).map((d) => d.path).sort()).toEqual([
      "fbt.rate",
      "gst.carLimit",
      "lct.thresholdOther",
    ]);
  });

  /**
   * A missing key is not drift.
   *
   * withDefaults backfills it, so the site is already serving the default —
   * which is what we believe. Reporting it would put every newly added
   * parameter on the admin's desk for no reason, and the noise is how a real
   * divergence gets scrolled past.
   */
  it("ignores a key the stored config predates", () => {
    const stored = clone() as unknown as Record<string, unknown>;
    delete (stored.lct as Record<string, unknown>).thresholdOther;
    expect(findDrift(stored as unknown as EngineConfig)).toEqual([]);
  });

  /**
   * Infinity has to survive the round trip.
   *
   * The top tax bracket and the top HELP band both use it, and it comes back
   * from Postgres as null before reviveConfig restores it. If that compared
   * unequal to itself, every check would report permanent drift on parameters
   * nobody can edit, and the feature would be ignored within a week.
   */
  it("does not report the top bracket as drift after a database round trip", () => {
    const roundTripped = reviveConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
    expect(findDrift(roundTripped)).toEqual([]);
  });

  it("tolerates floating-point noise but not a real difference", () => {
    expect(findDrift(setByPath(clone(), "fbt.rate", 0.47 + 1e-12))).toEqual([]);
    expect(findDrift(setByPath(clone(), "fbt.rate", 0.4701))).toHaveLength(1);
  });

  /**
   * Every parameter is watched, because the check goes through the
   * descriptors rather than walking the object. reference-data.test.ts
   * already requires a descriptor for every parameter, so the two together
   * mean a new rate is covered the day it is added.
   */
  it("watches every parameter that has a descriptor", () => {
    const covered = new Set<string>();
    for (const d of PARAM_DESCRIPTORS) {
      const stored = setByPath(clone(), d.path, getShiftedValue(d.path));
      for (const found of findDrift(stored)) covered.add(found.key);
    }
    // Bracket thresholds at Infinity have no descriptor and are skipped by
    // params.ts itself, so compare against what configToRows actually offers.
    expect(covered.size).toBe(configToRows(DEFAULT_CONFIG).length);
  });
});

/** A value guaranteed to differ from whatever is there, and to stay finite. */
function getShiftedValue(path: string): number {
  const current = configToRows(DEFAULT_CONFIG).find((r) => r.path === path)?.value ?? 0;
  return Number.isFinite(current) ? current + 1 : 1;
}

describe("Presenting drift to whoever has to fix it", () => {
  it("groups by category, most divergences first", () => {
    // Two in "GST & luxury car tax", one in "Fringe benefits tax".
    let stored = setByPath(clone(), "lct.thresholdOther", 1);
    stored = setByPath(stored, "lct.thresholdFuelEfficient", 2);
    stored = setByPath(stored, "fbt.statutoryRate", 0.17);
    const grouped = driftByCategory(findDrift(stored));
    expect(grouped).toHaveLength(2);
    expect(grouped[0][0]).toBe("GST & luxury car tax");
    expect(grouped[0][1]).toHaveLength(2);
    expect(grouped[1][1]).toHaveLength(1);
    expect(grouped.flatMap(([, rows]) => rows)).toHaveLength(3);
  });

  it("is empty when there is nothing to show", () => {
    expect(driftByCategory([])).toEqual([]);
  });
});

/**
 * What a machine concludes, unattended.
 *
 * /api/refdata exists so nobody has to remember to open the backoffice. That
 * only helps if the endpoint can fail — and the way a check like this really
 * dies is not by going red, it is by quietly measuring nothing and staying
 * green for a year.
 */
describe("The verdict a monitor acts on", () => {
  it("passes only when something was compared and nothing diverged", () => {
    expect(driftVerdict(0, 105)).toEqual({ ok: true, status: 200 });
  });

  it("fails on drift, with a status a monitor can alert on without reading the body", () => {
    const v = driftVerdict(1, 105);
    expect(v.ok).toBe(false);
    expect(v.status).toBe(409);
  });

  // The clause the whole endpoint's credibility rests on.
  it("fails when nothing was checked, rather than calling it clean", () => {
    const v = driftVerdict(0, 0);
    expect(v.ok).toBe(false);
    expect(v.status).toBe(409);
    expect(v.reason).toMatch(/nothing was checked/i);
  });

  it("treats a negative count as nothing checked too", () => {
    expect(driftVerdict(0, -1).ok).toBe(false);
  });

  it("never returns 5xx for drift — the service is fine, its numbers are not", () => {
    for (const [d, c] of [
      [0, 105],
      [1, 105],
      [0, 0],
    ] as const) {
      expect(driftVerdict(d, c).status).toBeLessThan(500);
    }
  });
});

/**
 * The count itself has to stay large.
 *
 * driftVerdict refuses to pass on zero, but a count that silently fell from a
 * hundred to two would still pass while checking almost nothing. This is the
 * backstop: the endpoint reports configToRows(DEFAULT_CONFIG).length, and that
 * has to keep meaning "all of them".
 */
describe("How much the endpoint actually compares", () => {
  it("compares every parameter the backoffice knows about", () => {
    expect(configToRows(DEFAULT_CONFIG).length).toBe(PARAM_DESCRIPTORS.length);
  });

  it("is a number that could not collapse unnoticed", () => {
    expect(configToRows(DEFAULT_CONFIG).length).toBeGreaterThan(50);
  });
});
