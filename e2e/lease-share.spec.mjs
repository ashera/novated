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
 *
 * The pay breakdown off the same token makes the opposite trade, on purpose,
 * and is checked here too: it carries the ledger and the employer's GST
 * remittances, and not the salary, because it is the document prepared for an
 * accountant rather than a colleague. Notes stay out of both.
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
const REMITTANCE_LINE = "EMPLOYERGST4422";
const SALARY = 155_555;

export default async function run(browser) {
  const userId = await testUserId();
  await cleanup(userId);

  const token = `ls-${Date.now().toString(36)}`;
  const lease = await db(
    `insert into leases (user_id, name, vehicle, scenario, notes, statement, share_token, remittances)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
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
      JSON.stringify([
        { date: "2026-01-01", description: REMITTANCE_LINE, amount: 149.61 },
      ]),
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

  await check("does not carry the employer's GST remittances", () => {
    assert(
      !html.includes(REMITTANCE_LINE),
      "the employer's payment records reached the lease link",
    );
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
   * The pay breakdown, off the same token — and the opposite trade.
   *
   * These two links are deliberately asymmetric and it is worth stating why,
   * because "narrower" is the obvious reading and it is wrong. The lease link
   * carries the salary, since every figure on that page is what the lease
   * costs THIS person, and it carries no ledger. The pay breakdown is the
   * document prepared for an accountant: it carries the ledger, because
   * reconciling a deduction means seeing what actually left the account, and
   * it carries no salary, because none of the deduction depends on one.
   *
   * Each holds what its reader needs and nothing else. Both exclusions and
   * both inclusions are checked here, in one place, so a later edit that
   * widens either query has to walk past this.
   */
  {
    const payRes = await page.goto(`${BASE}/s/${token}/pay`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2500);
    const pay = await page.content();

    describe("The pay breakdown shared off the same token");

    await check("is served", () => assertEqual(payRes.status(), 200, "unexpected status"));

    await check("does carry the ledger, which is what this link is for", () => {
      assert(
        pay.includes(LEDGER_LINE),
        "the transaction ledger is missing from the breakdown prepared for an accountant",
      );
    });

    await check("does not carry the salary", () => {
      assert(
        !pay.includes(String(SALARY)) && !pay.includes(SALARY.toLocaleString("en-AU")),
        "the salary reached the pay breakdown, which is built without one",
      );
    });

    await check("does not carry the owner's private notes either", () => {
      assert(!pay.includes(PRIVATE_NOTE), "a private note reached the pay breakdown");
    });

    /* The employer's GST payments travel with the ledger, for the same
       reason and to the same reader: reconciling a deduction means seeing
       both sides of the GST, and only this link is built for that. */
    await check("does carry the employer's GST remittances", () => {
      assert(
        pay.includes(REMITTANCE_LINE),
        "the employer's GST payments are missing from the accountant's breakdown",
      );
    });

    await check("is not indexable", () => {
      assert(/noindex/i.test(pay), "a shared pay breakdown should not be indexed");
    });

    // Back where the rest of the spec expects to be.
    await page.goto(`${BASE}/s/${token}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
  }

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

    /*
     * What travels and what does not, and the line is not where it first
     * looks.
     *
     * This used to assert that the sender's salary could not come with the
     * copy, and it was right when it was written: a copy opened on our
     * default. Then a reader followed the link and watched the cost move from
     * $120 a week to $133 for no visible reason, because the default was a
     * third figure belonging to nobody. So the panel now opens with the
     * sender's salary in the box, labelled as theirs and selected on focus,
     * and a reader who clicks straight through keeps it deliberately.
     *
     * The salary is on the shared page already — every figure there was
     * worked out from it — so carrying it forward discloses nothing new, and
     * it is the only figure that makes the copy's numbers match the ones they
     * just read. What must NOT travel is a conclusion about the sender that
     * the reader cannot see and would not think to change, which is what the
     * study-loan flag is.
     */
    assertEqual(copy.salary, SALARY, "the salary box did not start from the sender's figure");
    assert(copy.quoteSalary !== SALARY, "the sender's salary rode in on the quote");
    assert(!copy.help, "the sender's study loan came with the copy");
  });

  /* Reloaded, because a client-side navigation leaves the previous page's
     payload in the document. The question is what a fresh workspace holds. */
  await check("a freshly loaded workspace keeps nothing it should not", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const html = await page.content();
    /*
     * The salary is expected here now — it is the reader's own starting
     * figure, in their own workspace, and the box invites them to change it.
     * What is checked instead is that the handoff does not linger: a copy
     * taken once must not be takeable again from a stale sessionStorage
     * payload, which is how a second lease appears that nobody asked for.
     */
    assert(!html.includes(PRIVATE_NOTE), "the sender's notes are in the reader's own page");
    assert(!html.includes(LEDGER_LINE), "the sender's ledger is in the reader's own page");
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
