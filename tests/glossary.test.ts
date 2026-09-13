import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, type EngineConfig } from "@/lib/au/config";
import { glossary, allTerms, termSlug } from "@/lib/au/glossary";

const config = DEFAULT_CONFIG;
const terms = allTerms(config);
const text = (t: { definition: string; matters?: string }) => `${t.definition} ${t.matters ?? ""}`;
const allText = terms.map(text).join(" ");

/**
 * The glossary's figures must come from the config, not from prose.
 *
 * This is the project's first ground rule and the glossary is the surface most
 * likely to break it — every entry is a sentence, and a sentence is exactly
 * where "47%" gets typed by hand. So rather than checking the current wording,
 * these tests move the config and insist the wording moves with it. A
 * hard-coded figure fails here and nowhere else.
 */
describe("The glossary quotes live reference data", () => {
  const shifted = (): EngineConfig => {
    const c = structuredClone(DEFAULT_CONFIG) as EngineConfig;
    c.fbt.rate = 0.39;
    c.fbt.statutoryRate = 0.11;
    c.fbt.grossUpType1 = 1.9999;
    c.gst.carLimit = 12_345;
    c.lct.rate = 0.22;
    c.lct.thresholdFuelEfficient = 123_456;
    c.lct.thresholdOther = 111_222;
    c.super.guaranteeRatePct = 15;
    c.super.maxContributionBase = 333_444;
    c.lease.residualMinPct["5"] = 31.5;
    c.benchmarks.managementFeeAnnual = { low: 11, high: 22 };
    return c;
  };

  const movedText = allTerms(shifted())
    .map(text)
    .join(" ");

  it.each([
    ["the FBT rate", "47%", "39%"],
    ["the statutory percentage", "20%", "11%"],
    ["the type 1 gross-up", "2.0802", "1.9999"],
    ["the car limit", "$69,674", "$12,345"],
    ["the LCT rate", "33%", "22%"],
    ["the fuel-efficient threshold", "$91,661", "$123,456"],
    ["the other LCT threshold", "$80,809", "$111,222"],
    ["the super guarantee rate", "12%", "15%"],
    ["the maximum contribution base", "$270,830", "$333,444"],
    ["the five-year minimum residual", "28.13%", "31.5%"],
  ])("reads %s from config, not from the prose", (_what, current, moved) => {
    expect(allText).toContain(current);
    expect(movedText).toContain(moved);
    expect(movedText).not.toContain(current);
  });

  it("reads the management fee benchmark range from config", () => {
    expect(allText).toContain("$200");
    expect(allText).toContain("$470");
    expect(movedText).toContain("$11");
    expect(movedText).toContain("$22");
  });

  // A date is reference data too, and printing the stored form at a reader is
  // its own small failure.
  it("says the exemption date the way a person would", () => {
    expect(allText).toContain("1 July 2022");
    expect(allText).not.toContain("2022-07-01");
  });
});

/**
 * The reader arrived holding a quote, with a word from it.
 *
 * Providers do not share a vocabulary: across the sampled quotes the finance
 * line was called "Lease Payment", "Repayments" and "Lease Rental", and the
 * decoder already tells people so, field by field. The glossary is useless to
 * that reader unless it answers the name actually printed on their page — so
 * every alias the decoder shows for a concept the glossary defines has to be
 * findable here.
 *
 * Asserted in both directions, because either side can drift: the aliases must
 * be covered by the glossary, and they must still be the ones the decoder
 * prints.
 */
describe("The glossary answers the names providers actually print", () => {
  // Aliases from QuoteDecoder.tsx, for the concepts this glossary defines.
  // Lines the decoder names but the glossary doesn't (fuel, tyres, insurance)
  // are deliberately absent — they need no definition.
  const PROVIDER_NAMES = [
    "Vehicle Amount Financed",
    "Financed Amount",
    "Residual Value",
    "Balloon",
    "Lease Payment",
    "Repayments",
    "Lease Rental",
    "Lease Management",
    "Admin Fee",
    "Luxury Car Adjustment",
    "Employee Contribution",
    "ECM",
  ];

  const searchable = terms
    .flatMap((t) => [t.term, ...(t.alsoCalled ?? [])])
    .join(" | ")
    .toLowerCase();

  it.each(PROVIDER_NAMES)("can be searched for as %s", (name) => {
    expect(searchable).toContain(name.toLowerCase());
  });

  it("is still quoting names the decoder actually shows", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "components", "QuoteDecoder.tsx"),
      "utf8",
    );
    const stale = PROVIDER_NAMES.filter((n) => !src.includes(n));
    expect(
      stale,
      `The decoder no longer shows these names, so the glossary is answering a question nobody is asking: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});

describe("The glossary holds together as a page", () => {
  it("gives every term a unique anchor, so deep links stay unambiguous", () => {
    const slugs = terms.map((t) => termSlug(t.term));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);
  });

  it("names no term twice", () => {
    const names = terms.map((t) => t.term.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("points only at routes that exist", () => {
    const withLinks = terms.filter((t) => t.seeHref);
    expect(withLinks.length).toBeGreaterThan(0);
    for (const t of withLinks) {
      // Both halves or neither — a label with no link, or a link with no label,
      // renders as nothing.
      expect(t.seeLabel, `${t.term} has a link with no label`).toBeTruthy();
      const route = t.seeHref!.replace(/^\//, "");
      const page = route
        ? path.join(__dirname, "..", "app", route, "page.tsx")
        : path.join(__dirname, "..", "app", "page.tsx");
      expect(fs.existsSync(page), `${t.term} points at /${route}, which has no page`).toBe(true);
    }
  });

  it("leaves no definition empty or unpunctuated", () => {
    for (const t of terms) {
      expect(t.definition.length, t.term).toBeGreaterThan(40);
      expect(t.definition.trim().endsWith("."), `${t.term}: definition`).toBe(true);
      if (t.matters) expect(t.matters.trim().endsWith("."), `${t.term}: matters`).toBe(true);
    }
  });

  // The grouping is the navigation — A–Z only helps a reader who already knows
  // the word they want, and this one is pointing at a line on a page.
  it("groups the terms rather than listing them flat", () => {
    const sections = glossary(config);
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections.every((s) => s.terms.length >= 3)).toBe(true);
    expect(sections.every((s) => s.blurb.length > 20)).toBe(true);
  });

  it("covers the terms the site's own copy leans on", () => {
    const names = terms.map((t) => t.term.toLowerCase());
    for (const required of [
      "residual",
      "novation",
      "employee contribution method",
      "reportable fringe benefits amount",
      "statutory formula method",
      "grossing up",
      "car limit",
      "base value",
    ]) {
      expect(names, `missing: ${required}`).toContain(required);
    }
  });
});
