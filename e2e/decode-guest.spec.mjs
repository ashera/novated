/**
 * Arriving at /decode with a quote in hand and no account.
 *
 * The page is built for exactly this: somebody holding a provider's document
 * who has not set anything up. It used to send them to the calculator to
 * create a lease and back again, and that round trip was removed on purpose.
 *
 * It came back by a side door. `readOnly` on this page means two different
 * things bolted together — the quote is locked in, OR no car has been chosen
 * yet — and the second one was applied to the whole form, including the
 * provider's name and the pay frequency. Neither of those is measured against
 * a car; they are facts about the document. So the two fields at the top of
 * the card were dead while the card's own message said to start by typing a
 * price into it, and a guest's first two instincts both failed silently.
 *
 * What this checks is that a guest can actually begin: the identity fields
 * take input, and what they type survives — which is the part a disabled
 * attribute alone would not have told us.
 */

import { BASE, assert, assertEqual, check, describe, guestPage, hydrated } from "./harness.mjs";

export default async function run(browser) {
  const page = await guestPage(browser);
  await page.goto(`${BASE}/decode`, { waitUntil: "domcontentloaded" });

  const provider = page.locator('input[type="text"]').first();
  await provider.waitFor({ state: "visible", timeout: 20_000 });

  describe("Decoding a quote as a guest, with no lease yet");

  await check("the provider field is not held shut", async () => {
    assert(!(await provider.isDisabled()), "the provider name field is disabled");
    assertEqual(await provider.getAttribute("readonly"), null, "it is marked readonly");
  });

  await check("the pay frequency buttons are not held shut", async () => {
    for (const name of ["Weekly", "Fortnightly", "Monthly"]) {
      const b = page.getByRole("button", { name: new RegExp(`^${name}$`) }).first();
      assert(!(await b.isDisabled()), `the ${name} button is disabled`);
    }
  });

  /*
   * Typing, not just tabbing. An enabled control that drops what it is given
   * is the worse failure of the two: disabled at least tells the truth.
   */
  await check("what a guest types into the provider name sticks", async () => {
    /*
     * Hydration first. The field is server-rendered and visible before React
     * attaches to it, so a value set in that window is written to raw DOM and
     * thrown away when React takes over — nothing to do with the store, and
     * not what this check is about. Measured: React is not attached at the
     * moment the field becomes visible.
     */
    await hydrated(provider);
    await provider.fill("Acme Leasing");
    await page.waitForTimeout(1200);
    assertEqual(await provider.inputValue(), "Acme Leasing", "the name did not survive");
  });

  await check("choosing a different pay frequency takes effect", async () => {
    const monthly = page.getByRole("button", { name: /^Monthly$/ }).first();
    await monthly.click();
    await page.waitForTimeout(1500);
    const selected = await monthly.evaluate((el) => el.className.includes("border-accent"));
    assert(selected, "clicking Monthly did not select it");
  });

  /** And it is really saved, not just held in the form. */
  await check("the quote is written to the browser", async () => {
    const quotes = await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem("leasewiz-leases") || "[]");
      return rows.at(-1)?.lease?.quotes ?? [];
    });
    assert(quotes.length > 0, "nothing was saved for this guest");
    assertEqual(quotes[0].frequency, "monthly", "the frequency was not saved");
  });

  /*
   * Adding a car the catalogue does not have.
   *
   * VehicleCard takes an optional onCustom, and this page passed the three
   * custom fields to DISPLAY without passing one — so the modal collected a
   * make, a model and a body type, called a handler that was not there, closed
   * itself, and left nothing behind. An optional prop that silently does
   * nothing is the failure mode worth a permanent test.
   */
  /*
   * Checked HERE, before a car is added, and that ordering is the point: once
   * a custom car is set the catalogue picker is replaced by a text field, so
   * there is no Make select left to ask about. Asserted later, this passed
   * for the wrong reason and then failed for the wrong reason.
   */
  await check("the Make select is announced as just 'Make'", async () => {
    const label = await page.evaluate(() => {
      const sel = document.querySelector("select");
      return sel?.labels?.[0]?.textContent?.trim() ?? null;
    });
    assertEqual(label, "Make", "the select's label has absorbed something else");
  });

  describe("Adding a car the catalogue doesn't have");

  await check("the modal saves the car onto the lease", async () => {
    /*
       Addressed by ROLE on purpose, and this is load-bearing.

       The button used to sit inside the <label> for the Make select, which
       made its text part of that select's accessible name and took the button
       out of the accessibility tree altogether — findable by text, invisible
       to getByRole, and unreachable for anyone not using a mouse. Locating it
       this way means the spec fails if it is ever wrapped back up. */
    await page.getByRole("button", { name: /find your car/i }).first().click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    await dialog.getByPlaceholder("Skoda").fill("Skoda");
    await dialog.getByPlaceholder("Enyaq").fill("Enyaq");
    await dialog.locator('input[type="number"]').first().fill("17.2");
    await dialog.locator("button", { hasText: /^Add this car$/ }).click();
    await page.waitForTimeout(2000);

    const v = await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem("leasewiz-leases") || "[]");
      const l = rows.at(-1)?.lease;
      return {
        make: l?.vehicle?.make,
        model: l?.vehicle?.model,
        cons: l?.vehicle?.consumptionPer100km ?? l?.quotes?.[0]?.consumptionPer100km,
      };
    });
    assertEqual(v.make, "Skoda", "the make was not saved");
    assertEqual(v.model, "Enyaq", "the model was not saved");
    /*
     * The quiet half. VehicleCard's save fires onVehicle, onCustom and
     * onFuelType one after another, and every one of them used to start from
     * the same stale copy of the quote — so the last write won and the
     * consumption disappeared, leaving the engine on a class average with
     * nothing on screen to say so.
     */
    assertEqual(v.cons, 17.2, "the consumption figure was dropped");
  });

  await check("the car it added is named on the page", async () => {
    assert(/Skoda/.test(await page.locator("body").innerText()), "the car is not shown");
  });

  /*
   * Breaking the price down, which this page needs more than the calculator
   * does. A drive-away figure typed in as the car's price puts stamp duty and
   * rego inside the FBT base AND moves the amount financed the interest rate
   * is solved from — a real quote read that way came out 1.4 points high.
   */
  describe("Splitting a drive-away price into the car and the on-roads");

  await check("the breakdown is offered and the split is stored", async () => {
    await page
      .getByRole("button", { name: /^(Work it out|Break it down)$/ })
      .first()
      .click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 10_000 });

    const nums = dialog.locator('input[type="number"]');
    await nums.nth(0).fill("62200"); // the car itself
    await nums.nth(3).fill("2000"); // stamp duty
    await nums.nth(4).fill("569"); // registration
    await dialog.locator("button", { hasText: /^Use these figures$/ }).first().click();
    await page.waitForTimeout(2000);

    const v = await page.evaluate(() => {
      const l = JSON.parse(localStorage.getItem("leasewiz-leases") || "[]").at(-1)?.lease;
      return { price: l?.vehicle?.price, onRoad: l?.vehicle?.onRoadCosts, purchase: l?.vehicle?.purchase };
    });
    // The car alone is what FBT is worked out on: the on-roads must NOT be in it.
    assertEqual(v.price, 62_200, "the car price absorbed the on-road costs");
    assertEqual(v.onRoad, 2_569, "the on-road costs were not kept separate");
    assert(v.purchase, "the itemisation was not kept on the car");
  });

  await page.context().close();
}
