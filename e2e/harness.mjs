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

import { chromium, webkit, devices } from "playwright";
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
 * A phone, with touch events rather than a mouse.
 *
 * The distinction is the whole point of the specs that use it: a pointer that
 * hovers and a finger that taps take different paths through the same code,
 * and the desktop path has repeatedly worked while the touch one did not.
 * Playwright also taps the exact centre of an element every time, which a
 * thumb does not — so a spec here has to check the SIZE of what it is tapping
 * as well as the result of tapping it.
 */
export async function phonePage(browser) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  return page;
}

/**
 * A phone running Safari's engine, not Chromium wearing an iPhone's
 * user-agent.
 *
 * The difference is not academic, and this project has now paid for learning
 * it twice. Safari fires pointerdown and pointerup with pointerType "touch"
 * and then fires the CLICK with pointerType "mouse"; Chromium says "touch"
 * throughout. Code that reads the type off the click therefore works
 * everywhere except the browser most Australians open a link in — and a
 * Chromium-based mobile spec reports it green.
 *
 * Anything whose behaviour turns on touch versus mouse belongs here. The
 * caller closes the browser it is given.
 */
export async function launchWebkit() {
  const headed = process.argv.includes("--headed");
  return webkit.launch({ headless: !headed, slowMo: headed ? 250 : 0 });
}

export async function safariPhonePage() {
  const browser = await launchWebkit();
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);
  return { browser, page };
}

/**
 * Wait until React has actually taken over a given element.
 *
 * Server-rendered HTML contains the button long before anything is listening
 * to it, and Playwright will happily click it: visible, enabled, actionable,
 * and completely inert. The click lands, nothing happens, and the failure
 * arrives twenty seconds later as a navigation timeout that says nothing about
 * the cause. That is exactly how the signed-in half of the share spec failed —
 * the guest half only passed because five assertions ran first and hydration
 * finished while they did.
 *
 * `networkidle` plus a sleep would paper over it, but this app polls its own
 * version endpoint, so the network is never reliably idle, and a sleep is a
 * guess that gets slower or flakier as the page changes.
 *
 * React attaches a `__reactProps$…` key to every DOM node it owns, and it does
 * so at hydration. Its presence on THIS element is the precise fact we want:
 * not "the page looks settled" but "this button now has a handler".
 */
export async function hydrated(locator, timeout = 20_000) {
  await locator.waitFor({ state: "visible", timeout });
  await locator.evaluate(
    (el, deadline) =>
      new Promise((resolve, reject) => {
        const tick = () => {
          if (Object.keys(el).some((k) => k.startsWith("__reactProps$"))) return resolve(true);
          if (Date.now() > deadline) return reject(new Error("element never hydrated"));
          requestAnimationFrame(tick);
        };
        tick();
      }),
    Date.now() + timeout,
  );
  return locator;
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
