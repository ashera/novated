import { describe, it, expect } from "vitest";
import { isPreviewHost } from "../app/robots";

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
