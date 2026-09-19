/**
 * A shared quote becoming the reader's own lease.
 *
 * Unit tests already cover what a copy contains. What they cannot cover is the
 * half that only exists in a browser: that the offer renders on a page served
 * by the real deployment, that clicking it survives the hop between two routes
 * through session storage, and — the one that matters most — that the sender's
 * salary is genuinely not in the bytes the recipient receives.
 *
 * That last check is why the seeded salary is a number that appears nowhere
 * else on earth. Reasoning about where a field is stripped proves nothing; a
 * search of the delivered HTML for 123456 proves it.
 */

import {
  BASE,
  MARKER,
  assert,
  assertEqual,
  check,
  cleanup,
  db,
  describe,
  guestPage,
  signedInPage,
  testUserId,
} from "./harness.mjs";

/** A salary that cannot be confused with anything else on the page. */
const SENDER_SALARY = 123456;
const SHARE_TOKEN = `e2e-${Date.now().toString(36)}`;
const QUOTE_ID = "q-e2e-fixture";

/** A solvable quote. The figures are a real one's, de-identified. */
const QUOTE = {
  id: QUOTE_ID,
  label: "Provider A",
  frequency: "monthly",
  termMonths: 60,
  amountFinanced: 54000.36,
  residualIncGst: 16709.33,
  lines: { finance: 965.76 },
  salary: SENDER_SALARY,
  createdAt: "2025-01-01T00:00:00.000Z",
};

async function seed(userId) {
  const lease = await db(
    `insert into leases (user_id, name, vehicle, scenario, share_token)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      userId,
      `${MARKER} shared quote`,
      JSON.stringify({ make: "Example", model: "EV", fuelType: "electric", price: 57196, annualKm: 15000, state: "VIC" }),
      JSON.stringify({ salary: SENDER_SALARY, termYears: 5, includeRunningCosts: true }),
      SHARE_TOKEN,
    ],
  );
  const leaseId = lease.rows[0].id;
  await db("insert into lease_quotes (lease_id, label, data) values ($1, $2, $3)", [
    leaseId,
    QUOTE.label,
    JSON.stringify(QUOTE),
  ]);
  return leaseId;
}

export default async function run(browser) {
  const userId = await testUserId();
  await cleanup(userId); // sweep anything a crashed run left behind
  await seed(userId);

  const shareUrl = `${BASE}/s/${SHARE_TOKEN}/quote/${QUOTE_ID}`;

  // ── What the recipient is sent ────────────────────────────────────────────

  describe("The shared quote page, seen by a stranger");
  const page = await guestPage(browser);
  const res = await page.goto(shareUrl, { waitUntil: "domcontentloaded" });

  await check("is served, not 404", () => assertEqual(res.status(), 200, "unexpected status"));

  await check("shows the rate it was shared for", async () => {
    const rate = await page.locator("text=/The interest rate behind it/i").count();
    assert(rate > 0, "the rate panel is not on the page");
  });

  await check("offers to price it for the reader", async () => {
    await page.waitForSelector("text=What would this quote cost you?");
    const btn = page.getByRole("button", { name: /price it against my salary/i });
    assertEqual(await btn.count(), 1, "the CTA button is missing");
  });

  /* The one that would matter if it broke. */
  await check("does not carry the sender's salary in the delivered page", async () => {
    const html = await page.content();
    assert(!html.includes(String(SENDER_SALARY)), "the sender's salary is in the page source");
  });

  await check("is not indexable — it is somebody's own figures", async () => {
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    assert(/noindex/i.test(robots ?? ""), `robots meta was "${robots}"`);
  });

  // ── Taking a copy, as a guest ─────────────────────────────────────────────

  describe("Adopting it without an account");

  await check("lands on a workspace of the reader's own", async () => {
    await Promise.all([
      page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 }),
      page.getByRole("button", { name: /price it against my salary/i }).click(),
    ]);
  });

  await check("brings the quote across", async () => {
    await page.waitForSelector("text=/Provider A/i", { timeout: 20_000 });
  });

  /**
   * The gap that nearly shipped: a lease that HOLDS the quote but models our
   * own default rate answers a question nobody asked, and looks like an answer
   * while doing it. The page must show the quote's own solved rate.
   */
  await check("models the quote rather than our defaults", async () => {
    const lease = await page.evaluate(() => {
      const raw = localStorage.getItem("leasewiz-leases");
      const rows = raw ? JSON.parse(raw) : [];
      return rows.at(-1)?.lease ?? null;
    });
    assert(lease, "no lease was written to local storage");
    assertEqual(lease.quotes?.length, 1, "the copy should hold exactly the shared quote");
    assertEqual(
      lease.scenario.fromQuoteId,
      lease.quotes[0].id,
      "the scenario is not modelled on the copied quote",
    );
    assert(
      Math.abs(lease.scenario.interestRatePct - 10.46) < 0.05,
      `expected the quote's solved rate (~10.46%), got ${lease.scenario.interestRatePct}`,
    );
  });

  await check("leaves the sender's salary out of the copy", async () => {
    const stored = await page.evaluate(() => localStorage.getItem("leasewiz-leases") ?? "");
    assert(!stored.includes(String(SENDER_SALARY)), "the sender's salary was stored in the copy");
  });

  await check("gives the copy a fresh identity", async () => {
    const id = await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem("leasewiz-leases") ?? "[]");
      return rows.at(-1)?.lease?.quotes?.[0]?.id ?? null;
    });
    assert(id && id !== "q-e2e-fixture", `the copy reused the sender's quote id (${id})`);
  });

  // ── One shot, and gone ────────────────────────────────────────────────────

  describe("The handoff does not linger");

  await check("is consumed on arrival", async () => {
    const left = await page.evaluate(() => sessionStorage.getItem("leasewiz-shared-quote"));
    assertEqual(left, null, "the shared quote is still sitting in session storage");
  });

  await check("does not resurrect on a reload", async () => {
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem("leasewiz-leases") ?? "[]").length,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=/Provider A/i", { timeout: 20_000 });
    const after = await page.evaluate(
      () => JSON.parse(localStorage.getItem("leasewiz-leases") ?? "[]").length,
    );
    assertEqual(after, before, "a reload created a second copy");
  });

  await page.context().close();

  // ── And the same thing with an account behind it ──────────────────────────

  describe("Adopting it while signed in");
  const signedIn = await signedInPage(browser);

  /** Ids held before the adopt, so cleanup can delete exactly what this run
   *  made rather than anything that happens to be recent. */
  let idsBefore = [];

  await check("writes the copy to the account, not the browser", async () => {
    const before = await db("select id from leases where user_id = $1", [userId]);
    idsBefore = before.rows.map((r) => r.id);
    await signedIn.goto(shareUrl, { waitUntil: "domcontentloaded" });
    await signedIn.waitForSelector("text=What would this quote cost you?");
    await Promise.all([
      signedIn.waitForURL((u) => u.pathname === "/", { timeout: 20_000 }),
      signedIn.getByRole("button", { name: /price it against my salary/i }).click(),
    ]);
    await signedIn.waitForSelector("text=/Provider A/i", { timeout: 20_000 });
    // The save is debounced, so give it a beat to land rather than racing it.
    await signedIn.waitForTimeout(3_000);
    const after = await db("select id from leases where user_id = $1", [userId]);
    assert(
      after.rows.length > idsBefore.length,
      `expected a new lease row; went from ${idsBefore.length} to ${after.rows.length}`,
    );
  });

  await signedIn.context().close();

  /*
   * Delete exactly what this run made.
   *
   * The seeded lease is marked and easy. The copy the signed-in half created
   * is not — its name comes from the car, the way any adopted quote's does —
   * so it is identified by being a lease that was not there before. Deleting
   * by recency instead would be a query that can remove somebody's real work
   * if this is ever pointed at an account that has some.
   */
  await cleanup(userId);
  if (idsBefore.length) {
    await db("delete from leases where user_id = $1 and id <> all($2::uuid[])", [
      userId,
      idsBefore,
    ]);
  }
}
