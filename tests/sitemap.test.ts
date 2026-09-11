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
  "/decode", // one entry point: always launched from the calculator, never landed on
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
 * One entry point.
 *
 * The calculator is the only way into the site; the decoder is opened from it,
 * with a lease and usually a car already defined. That is easy to undo by
 * accident — a CTA on a marketing page, a nav item added back for symmetry —
 * and the damage is silent: the page still works, it just starts collecting
 * cold traffic that lands mid-journey.
 *
 * So: no indexed page and no part of the global shell may link to it. The
 * calculator's own CTAs live in components/LeaseCalculator.tsx, and /compare
 * is itself reached from the calculator, so both are deliberately not scanned.
 */
describe("the decoder is never an entry point", () => {
  const indexedPages = sitemap()
    .map((e) => new URL(e.url).pathname.replace(/\/+$/, ""))
    .map((r) => path.join(APP_DIR, r, "page.tsx"))
    .filter((f) => fs.existsSync(f));

  const shell = ["TopBar.tsx", "FooterNav.tsx"].map((f) =>
    path.join(__dirname, "..", "components", f),
  );

  it("scans the pages it thinks it is scanning", () => {
    // A silent zero-file scan would pass forever.
    expect(indexedPages.length).toBeGreaterThan(3);
    expect(shell.every((f) => fs.existsSync(f))).toBe(true);
  });

  it("is not linked from any indexed page or from the global nav", () => {
    const offenders = [...indexedPages, ...shell].filter((f) =>
      // Both shapes: a JSX href="/decode" and a nav array's href: "/decode".
      /["'`]\/decode(?:[?/]|["'`])/.test(fs.readFileSync(f, "utf8")),
    );
    expect(
      offenders.map((f) => path.relative(path.join(__dirname, ".."), f)),
      "These link straight to /decode. The calculator is the only way in.",
    ).toEqual([]);
  });

  it("stays out of the sitemap", () => {
    const paths = sitemap().map((e) => new URL(e.url).pathname.replace(/\/+$/, "") || "/");
    expect(paths).not.toContain("/decode");
  });
});
