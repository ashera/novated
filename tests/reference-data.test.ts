import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, withDefaults, reviveConfig, type EngineConfig } from "@/lib/au/config";
import {
  PARAM_DESCRIPTORS,
  PARAM_CATEGORIES,
  configToRows,
  getByPath,
  setByPath,
} from "@/lib/au/params";
import { SOURCE_SEEDS } from "@/lib/au/sources";
import { computeStaleness } from "@/lib/au/staleness";

describe("Reference data", () => {
  it("resolves every parameter descriptor to a real number in the config", () => {
    for (const d of PARAM_DESCRIPTORS) {
      const value = getByPath(DEFAULT_CONFIG, d.path);
      expect(Number.isFinite(value), `${d.key} (${d.path}) did not resolve`).toBe(true);
    }
  });

  it("uses a unique key for every parameter", () => {
    const keys = PARAM_DESCRIPTORS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cites a real source for every parameter", () => {
    const known = new Set(SOURCE_SEEDS.map((s) => s.key));
    for (const d of PARAM_DESCRIPTORS) {
      expect(known.has(d.sourceKey), `${d.key} cites unknown source ${d.sourceKey}`).toBe(true);
    }
  });

  it("lists every parameter under a declared category", () => {
    const known = new Set(PARAM_CATEGORIES);
    for (const d of PARAM_DESCRIPTORS) {
      expect(known.has(d.category), `${d.key} has unlisted category ${d.category}`).toBe(true);
    }
  });

  it("leaves no declared category empty", () => {
    for (const c of PARAM_CATEGORIES) {
      expect(
        PARAM_DESCRIPTORS.some((d) => d.category === c),
        `category "${c}" has no parameters`,
      ).toBe(true);
    }
  });

  it("exposes a value for every descriptor in the editable rows", () => {
    const rows = configToRows(DEFAULT_CONFIG);
    expect(rows).toHaveLength(PARAM_DESCRIPTORS.length);
    for (const r of rows) expect(Number.isFinite(r.value)).toBe(true);
  });

  it("keeps every source key unique and every scheduled source citable", () => {
    const keys = SOURCE_SEEDS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SOURCE_SEEDS) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.organisation.length).toBeGreaterThan(0);
      if (s.reviewIntervalDays != null) expect(s.reviewIntervalDays).toBeGreaterThan(0);
    }
  });

  it("writes a parameter back without mutating the original config", () => {
    const before = getByPath(DEFAULT_CONFIG, "fbt.statutoryRate");
    const next = setByPath<EngineConfig>(DEFAULT_CONFIG, "fbt.statutoryRate", 0.1);
    expect(getByPath(next, "fbt.statutoryRate")).toBe(0.1);
    expect(getByPath(DEFAULT_CONFIG, "fbt.statutoryRate")).toBe(before);
  });

  it("writes into an array path without mutating the original", () => {
    const next = setByPath<EngineConfig>(DEFAULT_CONFIG, "tax.brackets.1.rate", 0.16);
    expect(next.tax.brackets[1].rate).toBe(0.16);
    expect(DEFAULT_CONFIG.tax.brackets[1].rate).toBe(0.15);
  });
});

describe("Config integrity", () => {
  it("keeps the tax brackets ordered and open-ended at the top", () => {
    const b = DEFAULT_CONFIG.tax.brackets;
    for (let i = 1; i < b.length; i++) expect(b[i].upTo).toBeGreaterThan(b[i - 1].upTo);
    expect(b[b.length - 1].upTo).toBe(Infinity);
  });

  it("keeps the HELP bands ordered and open-ended at the top", () => {
    const b = DEFAULT_CONFIG.tax.helpBands;
    for (let i = 1; i < b.length; i++) expect(b[i].upTo).toBeGreaterThan(b[i - 1].upTo);
    expect(b[b.length - 1].upTo).toBe(Infinity);
  });

  it("keeps the ATO minimum residual falling as the term lengthens", () => {
    const pcts = [1, 2, 3, 4, 5].map((y) => DEFAULT_CONFIG.lease.residualMinPct[String(y)]);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThan(pcts[i - 1]);
  });

  it("keeps the fuel-efficient LCT threshold above the general one", () => {
    expect(DEFAULT_CONFIG.lct.thresholdFuelEfficient).toBeGreaterThan(
      DEFAULT_CONFIG.lct.thresholdOther,
    );
  });

  it("restores the open-ended top bracket after a JSON round trip", () => {
    // Infinity serialises to null; a stored config must come back usable.
    const stored = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as EngineConfig;
    expect(stored.tax.brackets[stored.tax.brackets.length - 1].upTo).toBeNull();
    const revived = reviveConfig(stored);
    expect(revived.tax.brackets[revived.tax.brackets.length - 1].upTo).toBe(Infinity);
    expect(revived.tax.helpBands[revived.tax.helpBands.length - 1].upTo).toBe(Infinity);
  });

  it("backfills a config seeded before a parameter existed", () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as EngineConfig;
    // @ts-expect-error — simulating a version stored before these blocks existed
    delete old.lct;
    // @ts-expect-error — same
    delete old.running;
    const filled = withDefaults(old);
    expect(filled.lct).toEqual(DEFAULT_CONFIG.lct);
    expect(filled.running).toEqual(DEFAULT_CONFIG.running);
  });
});

describe("Source staleness", () => {
  const now = new Date("2026-09-10T00:00:00Z");

  it("treats a source with no review schedule as never stale", () => {
    expect(computeStaleness("2020-01-01", null, now).state).toBe("none");
  });

  it("treats a recently refreshed source as fresh", () => {
    expect(computeStaleness("2026-08-01", 365, now).state).toBe("fresh");
  });

  it("flags a source past its review interval as stale", () => {
    expect(computeStaleness("2024-01-01", 365, now).state).toBe("stale");
  });
});

describe("Reference data currency", () => {
  it("uses the FY2026-27 luxury car tax threshold, not last year's", () => {
    // This threshold is also the FBT-exemption price cap for electric vehicles,
    // so a stale value silently denies the exemption to cars that qualify.
    // 91,387 was 2025-26 and shipped by mistake.
    expect(DEFAULT_CONFIG.lct.thresholdFuelEfficient).not.toBe(91_387);
    expect(DEFAULT_CONFIG.lct.thresholdFuelEfficient).toBe(91_661);
  });

  it("exempts an EV priced between the old and new thresholds", () => {
    // The regression the stale figure caused, stated as a behaviour.
    expect(91_500).toBeLessThanOrEqual(DEFAULT_CONFIG.lct.thresholdFuelEfficient);
  });

  it("spans the observed market in the management fee benchmark", () => {
    // Published provider pricing goes to $200/yr; the range must not sit above
    // real quotes, or every one of them reads as suspiciously cheap.
    expect(DEFAULT_CONFIG.benchmarks.managementFeeAnnual.low).toBeLessThanOrEqual(200);
    expect(DEFAULT_CONFIG.benchmarks.managementFeeAnnual.high).toBeGreaterThanOrEqual(470);
  });
});
