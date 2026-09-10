import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sitemap from "../app/sitemap";

// Guards against sitemap drift: every STATIC, public page under app/ must either be in
// app/sitemap.ts or be listed here as intentionally excluded. So a newly added public
// page can't silently fall out of the index —
// the author is forced to make a decision. Dynamic ([slug]) routes and the whole
// /admin area are handled/omitted separately and skipped here.
const APP_DIR = path.join(__dirname, "..", "app");

// Public pages we deliberately keep OUT of the sitemap, each with the reason.
const EXCLUDED = new Set<string>([
  "/login", // auth — noindex
  "/signup/confirm", // auth — noindex (only if it exists)
  "/forgot-password", // auth — noindex
  "/reset-password", // auth — noindex
  "/account", // per-user — noindex
  "/report", // per-user report — noindex
  "/compare", // per-user: your own kept quotes — noindex
]);

/** Every route that has a page.tsx, excluding /admin and dynamic ([param]) segments. */
function staticPublicRoutes(dir: string, route = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith("[")) continue; // dynamic segment — data-driven or per-user
    if (route === "" && name === "admin") continue; // admin area is never indexed
    const seg = name.startsWith("(") && name.endsWith(")") ? "" : `/${name}`; // route groups don't affect the URL
    const childRoute = route + seg;
    if (fs.existsSync(path.join(dir, name, "page.tsx"))) out.push(childRoute || "/");
    out.push(...staticPublicRoutes(path.join(dir, name), childRoute));
  }
  return out;
}

describe("sitemap stays complete", () => {
  const sitemapPaths = new Set(
    sitemap().map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/"),
  );

  it("lists every static public page (or excludes it explicitly)", () => {
    const routes = staticPublicRoutes(APP_DIR);
    // Sanity: the walker actually found the app's pages.
    expect(routes).toContain("/how-it-works");
    expect(routes).toContain("/faq");

    const missing = routes.filter((r) => !sitemapPaths.has(r) && !EXCLUDED.has(r));
    expect(
      missing,
      `Public page(s) missing from app/sitemap.ts — add them there, or to EXCLUDED in this test if they should stay out: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("does not list any excluded (non-indexable) route", () => {
    const listed = [...EXCLUDED].filter((r) => sitemapPaths.has(r));
    expect(listed, `These routes are in EXCLUDED but also in the sitemap: ${listed.join(", ")}`).toEqual([]);
  });
});
