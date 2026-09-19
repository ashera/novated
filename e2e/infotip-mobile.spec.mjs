/**
 * The little "ⓘ" on a phone.
 *
 * This control has now been fixed three times, and the first two fixes were
 * both correct and both insufficient — which is the reason this spec exists
 * rather than another careful reading of the component.
 *
 * It opened on hover and focus-within, so a phone got nothing. Fixed. Then the
 * leftover CSS pinned it open and the second tap did nothing. Fixed. Then it
 * still did not work in a hand, for a reason no amount of logic review would
 * have found: the icon is 16px square and a thumb needs about 44px. Driven
 * from a script, which taps the exact centre every time, every version passed.
 *
 * So the checks here are deliberately physical. Not "does the state toggle" —
 * that was never the broken part — but "is the thing big enough to hit, and is
 * the panel it opens actually on the screen".
 */

import { BASE, assert, check, describe, phonePage } from "./harness.mjs";

/** Apple asks for 44pt, Android for 48dp. 44 is the number to beat. */
const MIN_TOUCH = 44;

export default async function run(browser) {
  const page = await phonePage(browser);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  const tips = page.locator('button[aria-label="More information"]');
  await tips.first().waitFor({ state: "visible", timeout: 20_000 });
  const count = await tips.count();

  describe("The info icon, on a phone");

  await check("there are some to test", () => assert(count > 0, "no info icons rendered"));

  /*
   * Measured on the ::before, not the button. The icon stays 16px on purpose —
   * making it physically bigger would push the text around it — so the hit
   * area is a pseudo-element laid over it, and that is the thing a thumb
   * actually lands on.
   */
  await check(`every one has a target of at least ${MIN_TOUCH}px`, async () => {
    for (let i = 0; i < count; i++) {
      const size = await tips.nth(i).evaluate((el) => {
        const r = window.getComputedStyle(el, "::before");
        return { w: parseFloat(r.width), h: parseFloat(r.height) };
      });
      assert(
        size.w >= MIN_TOUCH && size.h >= MIN_TOUCH,
        `icon ${i} has a ${size.w}x${size.h}px hit area, under the ${MIN_TOUCH}px minimum`,
      );
    }
  });

  await check("a tap opens it", async () => {
    const btn = tips.first();
    await btn.scrollIntoViewIfNeeded();
    const id = await btn.getAttribute("aria-describedby");
    const tip = page.locator(`[id="${id}"]`);
    assert(
      (await tip.evaluate((el) => getComputedStyle(el).opacity)) === "0",
      "it was already open before anything was tapped",
    );
    await btn.tap();
    await page.waitForTimeout(400);
    assert(
      (await tip.evaluate((el) => getComputedStyle(el).opacity)) === "1",
      "tapping it did nothing",
    );
  });

  /*
   * An explanation half off the screen is the same failure as no explanation.
   * The panel is 224px wide and centred under a 16px icon, so it hangs 112px
   * either side — which runs off a 390px viewport whenever the icon sits near
   * an edge. Checked for every one of them, because whether it overflows
   * depends on where in the line the icon happens to fall.
   */
  await check("the panel it opens is fully on the screen", async () => {
    const width = page.viewportSize().width;
    for (let i = 0; i < count; i++) {
      const btn = tips.nth(i);
      await btn.scrollIntoViewIfNeeded();
      const id = await btn.getAttribute("aria-describedby");
      const tip = page.locator(`[id="${id}"]`);
      await btn.tap();
      await page.waitForTimeout(350);
      const box = await tip.boundingBox();
      assert(box, `tooltip ${i} has no box`);
      assert(box.x >= 0, `tooltip ${i} is clipped off the left by ${Math.abs(box.x).toFixed(0)}px`);
      assert(
        box.x + box.width <= width,
        `tooltip ${i} overflows the right by ${(box.x + box.width - width).toFixed(0)}px`,
      );
      await btn.tap();
      await page.waitForTimeout(250);
    }
  });

  /** The bug the second fix left behind: open, then unable to close. */
  await check("a second tap closes it again", async () => {
    const btn = tips.first();
    await btn.scrollIntoViewIfNeeded();
    const id = await btn.getAttribute("aria-describedby");
    const tip = page.locator(`[id="${id}"]`);
    await btn.tap();
    await page.waitForTimeout(350);
    assert((await tip.evaluate((el) => getComputedStyle(el).opacity)) === "1", "did not open");
    await btn.tap();
    await page.waitForTimeout(350);
    assert(
      (await tip.evaluate((el) => getComputedStyle(el).opacity)) === "0",
      "it opened and could not be closed again",
    );
  });

  await page.context().close();
}
