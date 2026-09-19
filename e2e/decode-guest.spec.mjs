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

import { BASE, assert, assertEqual, check, describe, guestPage } from "./harness.mjs";

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

  await page.context().close();
}
