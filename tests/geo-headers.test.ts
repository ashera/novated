import { describe, it, expect } from "vitest";
import { clientIp, countryFromHeaders, type HeaderGet } from "@/lib/geoHeaders";

/**
 * Reading the visitor out of the request, once a CDN is in front.
 *
 * Putting Cloudflare in front of the app changed who connects to it. Railway
 * writes `x-forwarded-for` from whoever opens the socket, which is now always
 * a Cloudflare edge node, so the first entry stopped being the visitor. The
 * flag in the header then reported wherever that anycast block geolocates and
 * changed between requests as Cloudflare routed them differently.
 *
 * The addresses below are real ones taken from the production visitors table
 * after the DNS change — every row had one.
 */
const CLOUDFLARE_EDGE = [
  "172.71.124.201", // geolocated to Paris
  "162.158.193.66", // Rio de Janeiro
  "172.71.218.252", // Hong Kong
  "172.70.142.215", // Singapore
  "104.22.127.9",
];

const req = (h: Record<string, string>): HeaderGet => (name) => h[name.toLowerCase()] ?? null;

describe("Finding the visitor's IP", () => {
  it("prefers the address Cloudflare says the client used", () => {
    for (const edge of CLOUDFLARE_EDGE) {
      const get = req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": edge });
      expect(clientIp(get), edge).toBe("203.0.113.7");
    }
  });

  it("falls back to the forwarded chain when there is no CDN in front", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("takes the single-value header some proxies set instead", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("understands the enterprise spelling of the same header", () => {
    expect(clientIp(req({ "true-client-ip": "203.0.113.4", "x-forwarded-for": "172.71.1.1" })))
      .toBe("203.0.113.4");
  });

  it("says nothing rather than guessing when no header carries one", () => {
    expect(clientIp(req({}))).toBeNull();
    expect(clientIp(req({ "x-forwarded-for": "" }))).toBeNull();
    expect(clientIp(req({ "x-forwarded-for": "  ,  " }))).toBeNull();
  });
});

/**
 * The country, which Cloudflare resolves at the edge from the connecting
 * address before any of this runs. Where it has said one, a local database
 * reading an address the edge has already replaced has nothing to add.
 */
describe("Deciding the country", () => {
  // The database that produced the wrong answers, so the test fails the way
  // production did if the preference order is ever reversed.
  const geoliteSaysParis = (ip: string | null) => (ip?.startsWith("172.71.") ? "FR" : "AU");

  it("uses the CDN's verdict over a lookup on an address it replaced", () => {
    const get = req({ "cf-ipcountry": "AU", "x-forwarded-for": "172.71.124.201" });
    expect(countryFromHeaders(get, geoliteSaysParis)).toEqual({
      country: "AU",
      source: "header:cf-ipcountry",
    });
  });

  it("falls back to the database, on the right address", () => {
    const get = req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "172.71.124.201" });
    expect(countryFromHeaders(get, geoliteSaysParis)).toEqual({
      country: "AU",
      source: "geoip",
    });
  });

  /**
   * The bug, written as a test: without the fix the lookup runs on the edge
   * node and an Australian visitor is reported as French.
   */
  it("no longer geolocates the datacentre that served the request", () => {
    for (const edge of CLOUDFLARE_EDGE) {
      const get = req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": edge });
      expect(countryFromHeaders(get, geoliteSaysParis).country, edge).toBe("AU");
    }
  });

  // Cloudflare's own placeholders. Neither is a country.
  it("treats XX and T1 as no answer", () => {
    for (const code of ["XX", "T1"]) {
      const get = req({ "cf-ipcountry": code, "cf-connecting-ip": "203.0.113.7" });
      const r = countryFromHeaders(get, geoliteSaysParis);
      expect(r.country, code).toBe("AU");
      expect(r.source, code).toBe("geoip");
    }
  });

  it("takes Vercel's header where that is the proxy", () => {
    const get = req({ "x-vercel-ip-country": "nz" });
    expect(countryFromHeaders(get, () => null)).toEqual({
      country: "NZ",
      source: "header:x-vercel-ip-country",
    });
  });

  it("returns nothing, with no source, when there is nothing to go on", () => {
    expect(countryFromHeaders(req({}), () => null)).toEqual({ country: null, source: null });
  });
});

/**
 * The reason this module exists rather than four lines in each caller: the
 * four lines were in five files, every one of them read x-forwarded-for
 * first, and only the tracking action was ever taught otherwise.
 */
describe("Nothing reads the raw headers any more", () => {
  it("has no caller parsing x-forwarded-for itself", async () => {
    const { globSync, readFileSync } = await import("node:fs");
    const files = globSync("{lib,components,app}/**/*.{ts,tsx}").filter(
      (f) => !f.endsWith("geoHeaders.ts"),
    );
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      // Reading it in a comment is fine; splitting it is the thing.
      return /get\(["']x-forwarded-for["']\)/.test(src);
    });
    expect(
      offenders,
      `These parse the forwarded-for chain themselves: ${offenders.join(", ")}. ` +
        `Use requestGeo() or clientIp() so the next proxy change is one edit.`,
    ).toEqual([]);
  });
});
