import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { isAppStorageKey, ownedKeys, clearLocalData } from "@/lib/localData";

/**
 * A reset that misses something is worse than no reset.
 *
 * The user asked for their data gone and the page reloads looking clean; the
 * key that was missed is still there, and the lease it belongs to comes back
 * on the next visit. Silent, and impossible to tell from a browser being odd.
 *
 * So the keys are matched by prefix rather than listed, and this checks that
 * every key the app actually writes is covered by a prefix.
 */

/** A tiny Storage, since there is no DOM harness in this project. */
function fakeStorage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

describe("Clearing what this browser holds", () => {
  it("claims the keys the app writes", () => {
    for (const key of [
      "leasewiz-leases",
      "leasewiz-active-lease",
      "leasewiz-unsaved",
      "leasewiz-handoff",
      "lw_conv_lease_priced",
    ]) {
      expect(isAppStorageKey(key), key).toBe(true);
    }
  });

  // The origin may hold things this site did not write, and the button does
  // not promise to touch them.
  it("leaves anything else alone", () => {
    for (const key of ["ga_session_id", "theme", "_vercel_jwt", "leasewiz"]) {
      expect(isAppStorageKey(key), key).toBe(false);
    }
  });

  it("removes every owned key and counts them", () => {
    const s = fakeStorage({
      "leasewiz-leases": "[]",
      "leasewiz-active-lease": "L1",
      "lw_conv_lease_priced": "1",
      "someone-elses-key": "keep",
    });
    expect(ownedKeys(s).sort()).toEqual([
      "leasewiz-active-lease",
      "leasewiz-leases",
      "lw_conv_lease_priced",
    ]);
  });

  /**
   * Removing while walking a live Storage skips every second entry, because
   * the indices shift under the loop. Collecting first is the fix, and this is
   * the case that would have caught it.
   */
  it("does not skip keys when several are removed at once", () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 10; i++) entries[`leasewiz-${i}`] = "x";
    const s = fakeStorage(entries);
    for (const k of ownedKeys(s)) s.removeItem(k);
    expect(s.length).toBe(0);
  });

  it("survives a browser with storage blocked", () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(() => clearLocalData()).not.toThrow();
    } finally {
      if (original === undefined) {
        // @ts-expect-error restoring the absent global
        delete globalThis.localStorage;
      } else {
        Object.defineProperty(globalThis, "localStorage", {
          configurable: true,
          value: original,
        });
      }
    }
  });
});

/**
 * The guard that makes the prefix approach safe: a key added later has to be
 * named the way the existing ones are, or the reset silently stops covering
 * everything.
 */
describe("Every storage key the app declares", () => {
  const files = globSync("{lib,components,app}/**/*.{ts,tsx}", { exclude: ["**/node_modules/**"] });

  it("is covered by a clearing prefix", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // `const KEY = "…"`, `const ACTIVE_KEY = "…"`, and the once-key handed
      // to trackConversion — the two shapes this app actually uses.
      const patterns = [
        /const\s+[A-Z][A-Z0-9_]*KEY[A-Z0-9_]*\s*=\s*"([^"]+)"/g,
        /trackConversion\([^,)]+,\s*"([^"]+)"/g,
      ];
      for (const re of patterns) {
        for (const m of src.matchAll(re)) {
          const key = m[1];
          // Not every constant ending in KEY is a storage key — env vars and
          // API keys end up here too, and they are not ours to clear.
          if (/^[A-Z_]+$/.test(key)) continue;
          if (!isAppStorageKey(key)) offenders.push(`${file}: ${key}`);
        }
      }
    }
    expect(
      offenders,
      `Storage keys not covered by APP_STORAGE_PREFIXES: ${offenders.join(", ")}. ` +
        `Rename to leasewiz-… or lw_…, or "Start fresh" will leave them behind.`,
    ).toEqual([]);
  });
});
