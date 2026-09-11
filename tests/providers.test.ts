import { describe, it, expect } from "vitest";
import {
  MAX_NAME,
  PROVIDER_SEEDS,
  findProviderByName,
  providerSlug,
  suggestProviders,
  validateProviderName,
  type Provider,
} from "@/lib/au/providers";

const p = (name: string, status: Provider["status"] = "approved"): Provider => ({
  id: name,
  name,
  slug: providerSlug(name),
  status,
  website: null,
});

describe("Lease providers", () => {
  describe("matching one name to another", () => {
    // The whole reason the table exists: the same company typed six ways is
    // worse than no directory at all.
    it("treats case, spacing and corporate tails as the same company", () => {
      const want = providerSlug("Maxxia");
      for (const v of ["maxxia", "MAXXIA", "  Maxxia  ", "Maxxia Pty Ltd", "Maxxia Australia", "Maxxia Pty Limited"]) {
        expect(providerSlug(v), v).toBe(want);
      }
    });

    it("strips a stacked corporate tail, not just the last word", () => {
      expect(providerSlug("Fleet Network Australia Pty Ltd")).toBe(providerSlug("Fleet Network"));
    });

    it("keeps genuinely different companies apart", () => {
      expect(providerSlug("Fleet Network")).not.toBe(providerSlug("Fleetcare"));
      expect(providerSlug("Smartleasing")).not.toBe(providerSlug("Smartsalary"));
    });

    it("normalises punctuation and accents rather than keying on them", () => {
      expect(providerSlug("Smart & Co")).toBe(providerSlug("Smart and Co"));
      expect(providerSlug("Café Leasing")).toBe(providerSlug("Cafe Leasing"));
      expect(providerSlug("S.G. Fleet")).toBe(providerSlug("SG Fleet"));
    });

    it("does not reduce a name to nothing", () => {
      expect(providerSlug("Pty Ltd")).not.toBe("");
    });
  });

  describe("what someone is allowed to add", () => {
    it("accepts a real name and tidies the whitespace", () => {
      const r = validateProviderName("  Summit   Fleet ");
      expect(r.ok && r.name).toBe("Summit Fleet");
      expect(r.ok && r.slug).toBe("summit-fleet");
    });

    it("turns away what plainly isn't a provider's name", () => {
      expect(validateProviderName("a").ok).toBe(false);
      expect(validateProviderName("   ").ok).toBe(false);
      expect(validateProviderName("x".repeat(MAX_NAME + 1)).ok).toBe(false);
      // This is a public write, so the obvious junk gets refused up front.
      expect(validateProviderName("Visit https://spam.example").ok).toBe(false);
      expect(validateProviderName("<script>alert(1)</script>").ok).toBe(false);
      expect(validateProviderName("!!! ???").ok).toBe(false);
    });
  });

  describe("suggesting as you type", () => {
    const list = ["Maxxia", "Smartleasing", "Smartsalary", "SG Fleet", "Fleetcare", "Fleet Network"].map((n) => p(n));

    it("puts what starts with the typed text above what merely contains it", () => {
      const names = suggestProviders(list, "fleet").map((x) => x.name);
      expect(names.slice(0, 2)).toEqual(["Fleet Network", "Fleetcare"]);
      expect(names).toContain("SG Fleet");
      expect(names.indexOf("SG Fleet")).toBeGreaterThan(names.indexOf("Fleetcare"));
    });

    it("ignores case and punctuation in what was typed", () => {
      expect(suggestProviders(list, "  s.g. ").map((x) => x.name)).toContain("SG Fleet");
    });

    it("offers everything, alphabetically, before anything is typed", () => {
      const names = suggestProviders(list, "").map((x) => x.name);
      expect(names[0]).toBe("Fleet Network");
      expect(names).toHaveLength(list.length);
    });

    it("honours the limit", () => {
      expect(suggestProviders(list, "", 2)).toHaveLength(2);
    });
  });

  describe("deciding whether to offer 'add it'", () => {
    const list = [p("Maxxia"), p("SG Fleet")];

    it("recognises a name we already have, however it was typed", () => {
      expect(findProviderByName(list, "maxxia pty ltd")?.name).toBe("Maxxia");
    });

    it("returns nothing for one we don't, so it can be offered", () => {
      expect(findProviderByName(list, "Some New Leasing Co")).toBeNull();
      expect(findProviderByName(list, "  ")).toBeNull();
    });
  });

  describe("the seed list", () => {
    it("has no two entries that are really the same company", () => {
      const slugs = PROVIDER_SEEDS.map(providerSlug);
      const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
      expect(dupes, `duplicate providers: ${dupes.join(", ")}`).toEqual([]);
    });

    it("is made of names that would pass the same check a user's must", () => {
      for (const n of PROVIDER_SEEDS) expect(validateProviderName(n).ok, n).toBe(true);
    });
  });
});
