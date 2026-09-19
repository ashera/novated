/**
 * A very small end-to-end harness.
 *
 * Deliberately not @playwright/test. The project already depends on the
 * `playwright` library and on nothing that runs it, and the runner brings its
 * own config format, its own globals and its own opinions about where tests
 * live — a second testing framework beside vitest, for a handful of specs that
 * need a real browser. What those specs actually need is a page, a way to say
 * "this must be true", and a tally at the end. That is this file.
 *
 * It runs against a DEPLOYED site rather than a dev server, because the things
 * only a browser can check here are the things a dev server would not tell us:
 * that the CDN in front of it serves the right HTML, that the client bundle
 * hydrates, and that a capability link works for somebody with no session.
 *
 * Credentials come from .env.local (gitignored) via `node --env-file`, never
 * from the repo. The test account is an ordinary one — nothing here should
 * need, or be able to use, admin rights.
 */

import { chromium } from "playwright";
import pg from "pg";

export const BASE = (process.env.E2E_BASE_URL ?? "").replace(/\/$/, "");
export const EMAIL = process.env.E2E_EMAIL ?? "";
export const PASSWORD = process.env.E2E_PASSWORD ?? "";

if (!BASE || !EMAIL || !PASSWORD) {
  console.error(
    "Missing E2E_BASE_URL / E2E_EMAIL / E2E_PASSWORD.\n" +
      "They live in .env.local; run via `npm run e2e`, which loads it.",
  );
  process.exit(2);
}

// ── Saying what must be true ────────────────────────────────────────────────

let passed = 0;
const failures = [];
let current = "";

export function describe(name) {
  current = name;
  console.log(`\n${name}`);
}

/** Run one check. A throw is a failure like any other — a selector that never
 *  appears throws rather than returning false, and that is still the test
 *  failing rather than the harness breaking. */
export async function check(what, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${what}`);
  } catch (err) {
    failures.push({ where: current, what, err });
    console.log(`  FAIL ${what}`);
    console.log(`       ${err?.message ?? err}`);
  }
}

export function assert(cond, message) {
  if (!cond) throw new Error(message);
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n       expected: ${expected}\n       actual:   ${actual}`);
  }
}

export function report() {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ${f.where} → ${f.what}\n    ${f.err?.stack ?? f.err}`);
  }
  return failures.length === 0;
}

// ── The browser ─────────────────────────────────────────────────────────────

/** Headed with --headed, so a failing flow can be watched rather than guessed
 *  at. Slowed down there too: a flow that fails in 200ms is unreadable. */
export async function launch() {
  const headed = process.argv.includes("--headed");
  return chromium.launch({ headless: !headed, slowMo: headed ? 250 : 0 });
}

/**
 * A context with nothing in it — no cookies, no storage, no session.
 *
 * This is what a share link's recipient actually is, and testing it any other
 * way would test a case that barely happens. Playwright sets
 * navigator.webdriver, so the app's own bot detection marks these visits and
 * they stay out of the analytics without us having to ask it to.
 */
export async function guestPage(browser) {
  const ctx = await browser.newContext({ locale: "en-AU", timezoneId: "Australia/Sydney" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  return page;
}

/**
 * A context that has signed in with the test account.
 *
 * Reads the page back when it does not leave /login, rather than letting
 * waitForURL time out. A bad password and a broken login form both look
 * identical from a timeout — twenty seconds of nothing and a stack trace
 * pointing at the harness — and the first is a note to the operator while the
 * second is a bug. The form says which; this repeats what it said.
 */
export async function signedInPage(browser) {
  const page = await guestPage(browser);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
  } catch {
    const said = await page
      .locator("body")
      .innerText()
      .then((t) =>
        t
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => /incorrect|invalid|suspend|required|must be/i.test(l)),
      )
      .catch(() => null);
    await page.context().close();
    throw new Error(
      said
        ? `Sign-in refused: "${said}" — check E2E_EMAIL / E2E_PASSWORD in .env.local.`
        : "Sign-in never left /login, and the page gave no reason.",
    );
  }
  return page;
}

// ── The database, for seeding and for clearing up after ─────────────────────

/**
 * Its own variable, not DATABASE_URL.
 *
 * These specs drive a DEPLOYED site, so the rows they seed have to be in the
 * database that site reads — which is never the local one DATABASE_URL points
 * at during development. Sharing the name would mean a run that silently
 * seeded localhost, found nothing on the live site, and reported a failure
 * that had nothing to do with the code.
 *
 * Railway's own DATABASE_URL is an internal hostname and unreachable from a
 * laptop; the value wanted here is the Postgres service's DATABASE_PUBLIC_URL.
 */
const DB_URL = process.env.E2E_DATABASE_URL;

if (!DB_URL) {
  console.error(
    [
      "Missing E2E_DATABASE_URL — the database behind E2E_BASE_URL.",
      "Get it with:  railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL",
      "and add that line to .env.local.",
    ].join("\n"),
  );
  process.exit(2);
}

/** The same rule as sslFor() in lib/db.ts: managed providers want TLS with
 *  relaxed verification, a local socket wants none. Restated rather than
 *  imported because that module is TypeScript and this runner is not. */
const sslFor = (url) =>
  /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /\.railway\.internal[:/]/.test(url)
    ? false
    : { rejectUnauthorized: false };

const pool = new pg.Pool({ connectionString: DB_URL, ssl: sslFor(DB_URL), max: 2 });

export const db = (text, params) => pool.query(text, params);
export const closeDb = () => pool.end();

/** The test account's user id, looked up rather than configured — the account
 *  is created through the app, so its id is not something we get to choose. */
export async function testUserId() {
  const r = await db("select id from users where email = $1", [EMAIL.toLowerCase()]);
  if (!r.rows[0]) throw new Error(`No account for ${EMAIL}. Sign up at ${BASE}/signup first.`);
  return r.rows[0].id;
}

/**
 * Everything a run creates is named with this, and everything named with this
 * is deleted at the end.
 *
 * Seeding through SQL rather than by driving the UI is deliberate: the point
 * of these specs is the share-and-adopt flow, and building a lease through
 * twenty form fields first would mean a broken price input could fail a test
 * about something else entirely. The cleanup is by prefix rather than by id so
 * that a run which crashes half way does not leave rows behind forever — the
 * next run sweeps them.
 */
export const MARKER = "[e2e]";

export async function cleanup(userId) {
  await db("delete from leases where user_id = $1 and name like $2", [userId, `${MARKER}%`]);
}
