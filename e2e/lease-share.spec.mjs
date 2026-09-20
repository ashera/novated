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

  /* One quote, so the copy has a provider document to carry and an active
     quote to remap. Its id is deliberately memorable. */
  await db("insert into lease_quotes (lease_id, label, data) values ($1, $2, $3)", [
    leaseId,
    "Provider A",
    JSON.stringify({
      id: "qA",
      label: "Provider A",
      frequency: "monthly",
      termMonths: 60,
      amountFinanced: 55_000,
      residualIncGst: 17_000,
      lines: { finance: 1_050 },
      salary: SALARY,
    }),
  ]);
  await db("update leases set scenario = scenario || '{\"fromQuoteId\":\"qA\"}'::jsonb where id = $1", [
    leaseId,
  ]);

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

  /*
   * The column that used to be empty.
   *
   * A shared lease cannot host the quotes card — the page renders the
   * sender's lease while the store belongs to the viewer, so those controls
   * would edit something that is not on screen. What it can host is the way
   * out: the same car and quotes in a workspace where the controls mean what
   * they say. The half worth guarding is what does NOT come with them.
   */
  describe("Starting from a lease somebody shared");

  await check("offers to work it out on the reader's own salary", async () => {
    const cta = page.getByRole("button", { name: /Work it out on my salary/i });
    assertEqual(await cta.count(), 1, "the invitation is missing");
    const box = await cta.first().boundingBox();
    assert(box && box.x < 520, "it is not in the left column");
  });

  await check("taking a copy brings the car and the quotes, and not the sender", async () => {
    await page.getByRole("button", { name: /Work it out on my salary/i }).first().click();
    await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 });
    await page.waitForTimeout(3500);

    const copy = await page.evaluate(() => {
      const l = JSON.parse(localStorage.getItem("leasewiz-leases") || "[]").at(-1)?.lease;
      return {
        make: l?.vehicle?.make,
        quotes: l?.quotes?.length ?? 0,
        firstQuoteId: l?.quotes?.[0]?.id,
        modelling: l?.scenario?.fromQuoteId,
        salary: l?.scenario?.salary,
        quoteSalary: l?.quotes?.[0]?.salary,
        help: l?.scenario?.hasHelpDebt,
      };
    });
    assertEqual(copy.make, "Tesla", "the car did not come across");
    assert(copy.quotes > 0, "the quotes did not come across");
    assert(copy.firstQuoteId && copy.firstQuoteId !== "qA", "the quote kept the sender's id");
    assertEqual(copy.modelling, copy.firstQuoteId, "the active quote was not remapped");

    /* The whole reason a copy is worth making: the reader supplies these. */
    assert(copy.salary !== SALARY, "the sender's salary came with the copy");
    assert(copy.quoteSalary !== SALARY, "the sender's salary rode in on the quote");
    assert(!copy.help, "the sender's study loan came with the copy");
  });

  /* Reloaded, because a client-side navigation leaves the previous page's
     payload in the document — including the salary that shared page was
     entitled to show. The question is what a fresh workspace holds. */
  await check("a freshly loaded workspace holds no trace of them", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const html = await page.content();
    assert(!html.includes(String(SALARY)), "the sender's salary is in the reader's own page");
    const left = await page.evaluate(() => sessionStorage.getItem("leasewiz-shared-lease"));
    assertEqual(left, null, "the handoff was not consumed");
  });

  await check("a revoked link stops working", async () => {
    await db("update leases set share_token = null where id = $1", [leaseId]);
    const after = await page.goto(`${BASE}/s/${token}`, { waitUntil: "domcontentloaded" });
    assertEqual(after.status(), 404, "the link still resolves after being revoked");
  });

  await page.context().close();
  await cleanup(userId);
}
