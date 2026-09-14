import { describe, it, expect } from "vitest";
import nextConfig from "../next.config.mjs";

/**
 * HSTS is one line that is easy to lose in a config merge and impossible to
 * notice missing — the site behaves identically with and without it, right up
 * until somebody is on a hostile network.
 *
 * What these can and cannot check has changed. Cloudflare now serves HSTS for
 * the zone and overwrites the origin's header, so nothing here describes what
 * a visitor actually receives; that is a dashboard setting, and no test in
 * this repository can see it. These guard the origin-level floor, which still
 * applies to anything reaching the app without passing through the edge.
 *
 * Worth being blunt about, because the previous version of this file was
 * quietly false: it enforced a ceiling of one day on a value the edge had
 * overridden to thirty. A guard that passes for a number nobody serves reads
 * as assurance and provides none.
 */
const EDGE_MAX_AGE = 60 * 60 * 24 * 30; // what Cloudflare is set to serve

describe("Security headers", () => {
  it("sends HSTS on every path", async () => {
    const rules = await nextConfig.headers!();
    const hsts = rules
      .flatMap((r) => r.headers.map((h) => ({ source: r.source, ...h })))
      .find((h) => h.key.toLowerCase() === "strict-transport-security");

    expect(hsts, "no Strict-Transport-Security header is configured").toBeTruthy();
    expect(hsts!.source).toBe("/:path*");
  });

  it("states a max-age that actually does something", async () => {
    const rules = await nextConfig.headers!();
    const value = rules
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === "strict-transport-security")!.value;

    const age = Number(/max-age=(\d+)/.exec(value)?.[1]);
    expect(Number.isFinite(age)).toBe(true);
    expect(age).toBeGreaterThanOrEqual(60 * 60);
  });

  /**
   * The floor tracks the edge, rather than drifting below it.
   *
   * Two numbers for one policy is the whole hazard here: somebody reads
   * next.config.mjs, believes it, and is wrong. Pinning the code to the
   * documented edge value means changing one without the other fails here —
   * which is the only place a repository can notice a dashboard setting
   * moving.
   */
  it("matches the max-age Cloudflare is serving", async () => {
    const rules = await nextConfig.headers!();
    const value = rules
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === "strict-transport-security")!.value;
    const age = Number(/max-age=(\d+)/.exec(value)?.[1]);
    expect(
      age,
      "next.config.mjs and EDGE_MAX_AGE disagree — change both, and change Cloudflare",
    ).toBe(EDGE_MAX_AGE);
  });

  it("has not been raised to a year without preload being considered", async () => {
    // Not a rule against a long max-age — a prompt to read the note in
    // next.config.mjs first, and to raise it in stages at the edge.
    expect(
      EDGE_MAX_AGE,
      "raising past a month is deliberate — see the note in next.config.mjs",
    ).toBeLessThanOrEqual(60 * 60 * 24 * 30);
  });

  it("does not carry preload, which is close to irreversible", async () => {
    const rules = await nextConfig.headers!();
    const value = rules
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === "strict-transport-security")!.value;
    expect(value).not.toContain("preload");
  });

  // Served from www, includeSubDomains reaches subdomains OF www and not the
  // apex, so it buys nothing — and now that the apex IS covered, at the edge,
  // it would read as though this header were the thing covering it.
  it("does not claim subdomains it cannot speak for", async () => {
    const rules = await nextConfig.headers!();
    const value = rules
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === "strict-transport-security")!.value;
    expect(value).not.toContain("includeSubDomains");
  });
});
