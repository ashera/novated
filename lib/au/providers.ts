// The novated lease providers people get quotes from.
//
// A directory, not reference data: no rate depends on it and nothing in the
// engine reads it. Its whole job is to stop the same company being typed
// fourteen different ways — "Maxxia", "maxxia", "Maxxia Pty Ltd", "MAXXIA" —
// so a quote can be attributed to a recognisable name.
//
// Anyone can add one, because the person holding a quote from a provider we
// have never heard of is exactly who we want to hear from. What they add is
// held for moderation rather than offered to everyone straight away.

/** A provider's life: suggested to everyone, waiting to be looked at, or
 *  turned down (kept, so the same name isn't re-submitted forever). */
export type ProviderStatus = "approved" | "pending" | "rejected";

export interface Provider {
  id: string;
  name: string;
  slug: string;
  status: ProviderStatus;
  website: string | null;
}

/** Company-name noise that should never decide whether two names match. */
const SUFFIXES = [
  "pty ltd",
  "pty limited",
  "pty",
  "ltd",
  "limited",
  "australia",
  "aust",
  "group",
];

/**
 * The key two names are considered the same by.
 *
 * Deliberately aggressive: "Maxxia Pty Ltd", "maxxia" and "MAXXIA Australia"
 * are one company, and a directory that lists all three is worse than no
 * directory. Punctuation, case, spacing and the usual corporate tail all go.
 */
export function providerSlug(name: string): string {
  let s = name
    .normalize("NFKD")
    // Strip combining marks left by NFKD, so "Café" keys the same as "Cafe".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // Strip trailing corporate noise, repeatedly — "Foo Australia Pty Ltd".
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SUFFIXES) {
      if (s.endsWith(` ${suffix}`)) {
        s = s.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
  }
  // Fold runs of single characters back into one word, so "S.G. Fleet" keys
  // the same as "SG Fleet" and "N.L.C." the same as "nlc". Initialisms are
  // punctuated inconsistently more or less always.
  const folded: string[] = [];
  let run = false; // is the previous token part of an initialism?
  for (const w of s.split(" ").filter(Boolean)) {
    if (w.length === 1 && run) {
      folded[folded.length - 1] += w;
    } else {
      folded.push(w);
      run = w.length === 1;
    }
  }
  return folded.join("-");
}

export const MAX_NAME = 80;

/** Check a name someone typed. Pure, so the same rule and the same words
 *  reach the picker and the server action. */
export function validateProviderName(
  raw: string,
): { ok: true; name: string; slug: string } | { ok: false; error: string } {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "That's too short to be a provider's name." };
  if (name.length > MAX_NAME) {
    return { ok: false, error: `Keep it under ${MAX_NAME} characters.` };
  }
  // A name is a name. Anything with a URL or markup in it is not one.
  if (/https?:\/\/|<|>/.test(name)) {
    return { ok: false, error: "Just the company's name, without a web address." };
  }
  const slug = providerSlug(name);
  if (!slug) return { ok: false, error: "That name needs at least one letter or number." };
  return { ok: true, name, slug };
}

/**
 * Rank provider suggestions for what has been typed so far.
 *
 * Ordering matters more than cleverness here: someone typing "sm" wants
 * Smartleasing at the top, not a company with "sm" buried in the middle of
 * it. So: what starts with the typed text first, then what contains it, each
 * alphabetically.
 */
export function suggestProviders(list: Provider[], typed: string, limit = 8): Provider[] {
  const q = providerSlug(typed);
  if (!q) return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);

  const starts: Provider[] = [];
  const contains: Provider[] = [];
  for (const p of list) {
    const hay = `${p.slug} ${providerSlug(p.name)}`;
    if (p.slug.startsWith(q)) starts.push(p);
    else if (hay.includes(q)) contains.push(p);
  }
  const byName = (a: Provider, b: Provider) => a.name.localeCompare(b.name);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

/** Is what they typed already a provider we know? Used to decide whether to
 *  offer "add it" — matching on the slug, so case and "Pty Ltd" don't make a
 *  duplicate look new. */
export function findProviderByName(list: Provider[], typed: string): Provider | null {
  const slug = providerSlug(typed);
  if (!slug) return null;
  return list.find((p) => p.slug === slug) ?? null;
}

/**
 * The providers we ship with.
 *
 * Well-known Australian novated leasing and salary-packaging companies. This
 * is a starting point for the picker, not an endorsement or a directory we
 * claim is complete or current — trading names change, companies merge and
 * rebrand. Everything here is editable and removable at /admin/providers, and
 * the list is expected to be reviewed there.
 */
export const PROVIDER_SEEDS: string[] = [
  "Maxxia",
  "RemServ",
  "Smartleasing",
  "Smartsalary",
  "SG Fleet",
  "LeasePlan",
  "Custom Fleet",
  "Toyota Fleet Management",
  "Fleetcare",
  "Eziway",
  "Paywise",
  "Salary Packaging Australia",
  "Autopia",
  "Fleet Network",
  "Easifleet",
  "Vehicle Solutions",
  "ORIX",
  "Summit Fleet",
  "nlc",
  "Alliance Leasing",
  "Flare Cars",
  "Community Business Bureau",
  "Advantage Salary Packaging",
  "AccessPay",
  "beCarWise",
  "Novated Lease Australia",
  "Fleet Choice",
  "Statewide Novated Leasing",
];
