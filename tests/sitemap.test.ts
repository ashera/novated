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
  "/decode", // a destination you reach from inside the site, noindex — never a search landing page
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

/**
 * The decoder is a destination, but never a landing page.
 *
 * It used to be neither: reachable only from a card partway down the
 * calculator, on the reasoning that the calculator was the site's one entry
 * point and the decoder should be opened from it with a lease already
 * defined. The worry was cold traffic landing mid-journey, and it was a fair
 * one.
 *
 * Two things changed it. The content pages are what search engines put people
 * on, and somebody arriving on the FAQ holding a provider's quote had no route
 * at all to the tool that reads it — one door on one page, for the feature
 * that most distinguishes this site. And the page no longer lands anybody
 * mid-journey: it opens on a fully worked example with findings, which is a
 * better first sight of what the site does than the calculator gives.
 *
 * So the shell links to it now, deliberately. What still holds is the half of
 * the original worry that was really about SEARCH traffic: the page is
 * noindex and stays out of the sitemap, so it is somewhere you go once you
 * are here, not somewhere Google sends you cold.
 */
describe("the decoder is a destination, not a landing page", () => {
  const shell = ["TopBar.tsx", "FooterNav.tsx"].map((f) =>
    path.join(__dirname, "..", "components", f),
  );

  it("scans the files it thinks it is scanning", () => {
    // A silent zero-file scan would pass forever.
    expect(shell.every((f) => fs.existsSync(f))).toBe(true);
  });

  it("is reachable from the global nav, so it can actually be found", () => {
    const linked = shell.filter((f) =>
      /["'`]\/decode(?:[?/]|["'`])/.test(fs.readFileSync(f, "utf8")),
    );
    expect(
      linked.map((f) => path.relative(path.join(__dirname, ".."), f)),
      "Nothing in the shell links to /decode. Its only other door is one card on the calculator.",
    ).toHaveLength(shell.length);
  });

  it("stays out of the sitemap", () => {
    const paths = sitemap().map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/");
    expect(paths).not.toContain("/decode");
  });

  it("is noindex, which is what actually stops it collecting cold traffic", () => {
    const src = fs.readFileSync(path.join(APP_DIR, "decode", "page.tsx"), "utf8");
    expect(src).toMatch(/robots:\s*\{[^}]*index:\s*false/);
  });
});
