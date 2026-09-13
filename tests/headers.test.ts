import { describe, it, expect } from "vitest";
import nextConfig from "../next.config.mjs";

/**
 * HSTS is one line that is easy to lose in a config merge and impossible to
 * notice missing — the site behaves identically with and without it, right up
 * until somebody is on a hostile network.
 *
 * The upper bound is the point of the rest. A long max-age is a promise the
 * browser will not let anyone click through, so it has to be raised
 * deliberately, by someone who has watched a certificate renew, rather than
 * arrived at by copying a snippet.
 */
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

  it("has not been quietly raised to a year without preload being considered", async () => {
    // Not a rule against a long max-age — a prompt to read the note above
    // before changing this line, and to raise it in stages.
    const rules = await nextConfig.headers!();
    const value = rules
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === "strict-transport-security")!.value;
    const age = Number(/max-age=(\d+)/.exec(value)?.[1]);
    expect(age, "raising past a day is deliberate — see the note in next.config.mjs").toBeLessThanOrEqual(
      60 * 60 * 24,
    );
  });

  it("does not carry preload, which is close to irreversible", async () => {
    const rules = await nextConfig.headers!();
    const value = rules
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === "strict-transport-security")!.value;
    expect(value).not.toContain("preload");
  });

  // Served from www, includeSubDomains reaches subdomains OF www and not the
  // apex, so it buys nothing and reads as though the apex were covered.
  it("does not claim subdomains it cannot speak for", async () => {
    const rules = await nextConfig.headers!();
    const value = rules
      .flatMap((r) => r.headers)
      .find((h) => h.key.toLowerCase() === "strict-transport-security")!.value;
    expect(value).not.toContain("includeSubDomains");
  });
});
