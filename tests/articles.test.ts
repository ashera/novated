import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ARTICLES, articleBySlug, articlesByDate, ARTICLE_KIND_LABEL } from "@/lib/articles";
import sitemap from "../app/sitemap";

const ARTICLES_DIR = path.join(__dirname, "..", "app", "articles");

/**
 * The registry and the pages have to agree.
 *
 * Three things read this list — the index, the sitemap and the articles
 * themselves, which link to each other by slug — so an entry with no page is a
 * dead card on the index and a 404 in the sitemap, and a page with no entry is
 * unreachable and unindexed. Both are silent.
 */
describe("The article library", () => {
  const pageDirs = fs
    .readdirSync(ARTICLES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("["))
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(ARTICLES_DIR, name, "page.tsx")));

  it("scans the directory it thinks it is scanning", () => {
    expect(pageDirs.length).toBeGreaterThan(0);
  });

  it("gives every registered article a page", () => {
    const missing = ARTICLES.filter((a) => !pageDirs.includes(a.slug)).map((a) => a.slug);
    expect(
      missing,
      `Registered in lib/articles.ts with no app/articles/<slug>/page.tsx: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("registers every article that has a page", () => {
    const unregistered = pageDirs.filter((d) => !articleBySlug(d));
    expect(
      unregistered,
      `These have a page but no entry in lib/articles.ts, so nothing links to them and the sitemap omits them: ${unregistered.join(", ")}`,
    ).toEqual([]);
  });

  it("lists every article in the sitemap", () => {
    const paths = new Set(sitemap().map((e) => new URL(e.url).pathname.replace(/\/+$/, "")));
    expect(paths.has("/articles")).toBe(true);
    for (const a of ARTICLES) {
      expect(paths.has(`/articles/${a.slug}`), `${a.slug} missing from the sitemap`).toBe(true);
    }
  });
});

describe("Each entry is complete enough to render a card", () => {
  it("uses a unique, URL-safe slug", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);
  });

  it("carries a title, a question and a standfirst", () => {
    for (const a of ARTICLES) {
      expect(a.title.length, a.slug).toBeGreaterThan(10);
      expect(a.question.trim().endsWith("?"), `${a.slug}: question should be a question`).toBe(
        true,
      );
      expect(a.standfirst.length, a.slug).toBeGreaterThan(60);
      expect(ARTICLE_KIND_LABEL[a.kind], a.slug).toBeTruthy();
    }
  });

  it("dates every article, and sorts newest first", () => {
    for (const a of ARTICLES) {
      expect(a.published, a.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(a.published))).toBe(false);
    }
    const dates = articlesByDate().map((a) => a.published);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  // The standfirst becomes the meta description, which search engines cut off
  // around here. Anything longer is written for nobody.
  it("keeps the standfirst short enough to survive a search result", () => {
    for (const a of ARTICLES) {
      expect(a.standfirst.length, `${a.slug} standfirst is ${a.standfirst.length} chars`).toBeLessThan(
        320,
      );
    }
  });
});
