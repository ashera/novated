import { describe, it, expect } from "vitest";
import { isPreviewHost, shouldIndex } from "../app/robots";

describe("Search indexing", () => {
  it("treats a real domain as indexable", () => {
    expect(isPreviewHost("https://www.leasewiz.com.au")).toBe(false);
    expect(isPreviewHost("https://leasewiz.com.au")).toBe(false);
    expect(isPreviewHost("https://novated.com.au")).toBe(false);
  });

  it("treats a platform preview host as not indexable", () => {
    // Indexing one of these competes with the real domain for the same content.
    expect(isPreviewHost("https://novated-production.up.railway.app")).toBe(true);
    expect(isPreviewHost("https://anything.railway.app")).toBe(true);
    expect(isPreviewHost("https://preview.vercel.app")).toBe(true);
    expect(isPreviewHost("https://app.onrender.com")).toBe(true);
  });

  it("treats local development as not indexable", () => {
    expect(isPreviewHost("http://localhost:3000")).toBe(true);
    expect(isPreviewHost("http://127.0.0.1:3000")).toBe(true);
  });

  it("refuses to index when the site URL is unusable", () => {
    // Failing closed matters more than failing open: the cost of not indexing
    // for a day is nil, the cost of indexing a throwaway host is not.
    expect(isPreviewHost("")).toBe(true);
    expect(isPreviewHost("not a url")).toBe(true);
  });

  it("is not fooled by a real domain that merely contains a preview name", () => {
    expect(isPreviewHost("https://railway.app.mysite.com.au")).toBe(false);
    expect(isPreviewHost("https://myrailway.app.au")).toBe(false);
  });
});

/**
 * Which HOST asked is the question, not which domain we're configured for.
 *
 * The original check answered "do we have a real domain yet", which was the
 * whole question while we didn't have one. Once we did, it passed for every
 * host the app answers on — so the platform URL served a full copy of the
 * site under "Allow: /", and so would every future preview deploy.
 */
describe("Search indexing — which host asked", () => {
  const site = "https://www.leasewiz.com.au";

  it("indexes a request that arrived at the canonical host", () => {
    expect(shouldIndex("www.leasewiz.com.au", site)).toBe(true);
  });

  it("refuses a request that arrived at the platform URL", () => {
    // The exact case that was live: a real domain configured, and the app
    // still answering on its Railway address with a full copy of the site.
    expect(shouldIndex("novated-production.up.railway.app", site)).toBe(false);
  });

  it("refuses the bare apex, which only ever redirects to www anyway", () => {
    expect(shouldIndex("leasewiz.com.au", site)).toBe(false);
  });

  it("refuses a host nobody thought to put on a list", () => {
    // The point of testing the canonical rather than a suffix list: the set of
    // addresses that ARE the site has one member, and it can't go stale.
    expect(shouldIndex("leasewiz.fly.dev", site)).toBe(false);
    expect(shouldIndex("staging.leasewiz.com.au", site)).toBe(false);
    expect(shouldIndex("leasewiz.com.au.evil.example", site)).toBe(false);
  });

  it("ignores case and stray whitespace in the header", () => {
    expect(shouldIndex("WWW.LeaseWiz.Com.AU", site)).toBe(true);
    expect(shouldIndex("  www.leasewiz.com.au  ", site)).toBe(true);
  });

  it("fails closed when there is no host header at all", () => {
    expect(shouldIndex(null, site)).toBe(false);
    expect(shouldIndex(undefined, site)).toBe(false);
    expect(shouldIndex("", site)).toBe(false);
  });

  it("still refuses everything while the site URL is itself a preview host", () => {
    // Both gates, not one: the original question still has to be answered.
    expect(shouldIndex("novated-production.up.railway.app", "https://novated-production.up.railway.app")).toBe(false);
    expect(shouldIndex("localhost:3000", "http://localhost:3000")).toBe(false);
  });

  it("refuses when the site URL is unusable, whatever the host says", () => {
    expect(shouldIndex("www.leasewiz.com.au", "not a url")).toBe(false);
    expect(shouldIndex("www.leasewiz.com.au", "")).toBe(false);
  });

  it("matches on the port too, so a stray dev origin isn't the site", () => {
    expect(shouldIndex("www.leasewiz.com.au:8080", site)).toBe(false);
  });
});
