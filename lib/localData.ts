/**
 * Everything this site keeps in the browser, and how to get rid of it.
 *
 * A guest's leases live in local storage and nowhere else, which is the right
 * trade — nobody creates an account before finding out what their quote says —
 * but it means there is state a person cannot see, cannot inspect and, until
 * now, could not clear without opening developer tools.
 *
 * Matched by prefix rather than by a list. A list is a second copy of a fact
 * that already lives at each `const KEY =`, and the failure mode is silent: a
 * key added later simply survives the reset, and the bug is that something the
 * user asked to be gone is still there on the next page load. The prefixes are
 * the naming convention the app already follows.
 */

/**
 * Every key this site writes starts with one of these.
 *
 * They still say "leasewiz" after the site was renamed to LeaseInspector, and
 * deliberately so: a storage key is an address, not a label. Renaming these
 * would orphan every lease already sitting in somebody's browser — the new
 * code would look under the new prefix, find nothing, and the user would be
 * told they have no saved leases while the old keys sat there untouched and
 * unreachable, including by the reset below. The prefix is invisible to
 * everyone but a developer reading this file; the cost of changing it is not.
 */
export const APP_STORAGE_PREFIXES = ["leasewiz-", "lw_"] as const;

export function isAppStorageKey(key: string): boolean {
  return APP_STORAGE_PREFIXES.some((p) => key.startsWith(p));
}

/** Keys currently held in a Storage that belong to this site. */
export function ownedKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k != null && isAppStorageKey(k)) keys.push(k);
  }
  return keys;
}

/**
 * Remove the lot, and say how much there was.
 *
 * Deliberately not `localStorage.clear()`. The site shares an origin with
 * anything else served from it, and a reset that reaches beyond what this app
 * wrote would be a wider promise than the button makes. Collecting the keys
 * before removing any of them avoids mutating the collection being walked,
 * which silently skips every second entry.
 *
 * Swallows its own errors like the tracking does: a browser with storage
 * blocked has nothing to clear, and a reset that throws on the way out is
 * worse than one that quietly finds nothing.
 */
export function clearLocalData(): number {
  let removed = 0;
  // Reaching for the accessor is itself what throws in a browser set to block
  // site data, so the try has to start before the reference is taken. Reading
  // `typeof localStorage` outside it looks like a guard and is the throw.
  for (const get of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = get();
      for (const key of ownedKeys(storage)) {
        storage.removeItem(key);
        removed++;
      }
    } catch {
      /* storage blocked — there was nothing of ours to remove */
    }
  }
  return removed;
}
