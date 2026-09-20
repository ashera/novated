/**
 * Sharing a whole lease, as against sharing one quote's analysis.
 *
 * Both links hang off the same capability token on the lease row, and that is
 * where the resemblance stops. A quote link carries a provider's document and
 * the arithmetic on it, with the salary stripped before the page is
 * serialised. A lease link carries the lease: the salary is the point of it,
 * because every figure on that page is "what this costs you".
 *
 * So the thing worth guarding is not that it renders. It is the boundary —
 * what the query behind it does NOT select. Notes are the owner's private
 * working notes and the statement ledger is a record of their actual
 * spending; neither belongs in something sent to a colleague to look over.
 * Both are excluded by the shape of one SELECT, which is exactly the kind of
 * thing a later edit widens without noticing.
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
  testUserId,
} from "./harness.mjs";

/** Strings that exist nowhere else, so finding one is proof, not inference. */
const PRIVATE_NOTE = "PRIVATENOTE7788";
const LEDGER_LINE = "SECRETTXN9911";
const SALARY = 155_555;

export default async function run(browser) {
  const userId = await testUserId();
  await cleanup(userId);

  const token = `ls-${Date.now().toString(36)}`;
  const lease = await db(
    `insert into leases (user_id, name, vehicle, scenario, notes, statement, share_token)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      userId,
      `${MARKER} shared lease`,
      JSON.stringify({
        make: "Tesla",
        model: "Model Y",
        fuelType: "electric",
        price: 62_200,
        annualKm: 15_000,
        state: "NSW",
      }),
      JSON.stringify({
        salary: SALARY,
        termYears: 5,
        interestRatePct: 7,
        includeRunningCosts: true,
        fbtMethod: "statutory",
        hasHelpDebt: true,
      }),
      PRIVATE_NOTE,
      JSON.stringify([
        { date: "2026-01-01", description: LEDGER_LINE, amount: -100, balance: 500, kind: "finance" },
      ]),
      token,
    ],
  );
  const leaseId = lease.rows[0].id;

  const page = await guestPage(browser);
  const res = await page.goto(`${BASE}/s/${token}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const html = await page.content();

  describe("A lease shared by link, opened by a stranger");

  await check("is served", () => assertEqual(res.status(), 200, "unexpected status"));

  await check("shows the lease it was made from", () => {
    assert(/Model Y/i.test(html), "the car is not on the page");
  });

  /* The two that matter. */
  await check("does not carry the owner's private notes", () => {
    assert(!html.includes(PRIVATE_NOTE), "a private note reached the shared page");
  });

  await check("does not carry the statement ledger", () => {
    assert(!html.includes(LEDGER_LINE), "the owner's transactions reached the shared page");
  });

  /*
   * Asserted deliberately, as the boundary rather than a leak. A lease's
   * figures ARE its salary; a link that hid it would show a page of numbers
   * that could not be checked. It is the reason the control that mints this
   * link says so before the link is sent.
   */
  await check("does carry the salary, which is what a lease link is", () => {
    assert(
      html.includes(String(SALARY)) || html.includes(SALARY.toLocaleString("en-AU")),
      "the salary is missing, so the page cannot be showing the lease's own figures",
    );
  });

  await check("is not indexable", () => {
    assert(/noindex/i.test(html), "a shared lease should not be indexed");
  });

  await check("a revoked link stops working", async () => {
    await db("update leases set share_token = null where id = $1", [leaseId]);
    const after = await page.goto(`${BASE}/s/${token}`, { waitUntil: "domcontentloaded" });
    assertEqual(after.status(), 404, "the link still resolves after being revoked");
  });

  await page.context().close();
  await cleanup(userId);
}
