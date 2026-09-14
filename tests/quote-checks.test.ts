import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { quoteFieldChecks, hasBlockingCheck } from "@/lib/au/quoteChecks";
import { annuityPayment } from "@/lib/au/novated";
import type { Quote } from "@/lib/au/quote";

const config = DEFAULT_CONFIG;

/**
 * A quote that adds up: $50,000 over five years at 7.5%, to the ATO minimum.
 *
 * The residual is entered GST-inclusive, because that is how providers quote
 * it — but the finance is written over the ex-GST figure, and the ATO
 * percentage is read against that too. Building the fixture the other way
 * round made a correct payment look too low by about 10%, which is the same
 * mistake the checks themselves were making before they shared the decoder's
 * derivation.
 */
const financed = 50_000;
const months = 60;
const residualExGst = financed * (config.lease.residualMinPct["5"] / 100);
const residual = residualExGst * 1.1; // what goes in the box
const monthlyPayment = annuityPayment(financed, residualExGst, 7.5, months);

const sound = (over: Partial<Quote> = {}): Quote => ({
  frequency: "monthly",
  fuelType: "electric",
  termMonths: months,
  vehiclePrice: 55_000,
  amountFinanced: financed,
  residualIncGst: residual,
  lines: { finance: monthlyPayment, managementFee: 35 },
  ...over,
});

describe("A quote that adds up raises nothing", () => {
  it("passes a sound quote clean", () => {
    expect(quoteFieldChecks(sound(), config)).toEqual({});
    expect(hasBlockingCheck(quoteFieldChecks(sound(), config))).toBe(false);
  });

  /**
   * Half a quote must not light up red.
   *
   * Everything is typed one box at a time, so every check has to tolerate the
   * fields it depends on being absent. A check that fires on an empty form is
   * one people learn to ignore before they have finished the first quote.
   */
  it("says nothing while the form is still being filled in", () => {
    expect(quoteFieldChecks({ ...sound(), lines: {} }, config)).toEqual({});
    expect(quoteFieldChecks({ ...sound(), amountFinanced: undefined }, config)).toEqual({});
    expect(quoteFieldChecks({ ...sound(), residualIncGst: undefined }, config).finance).toBeUndefined();
    const empty: Quote = { frequency: "monthly", fuelType: "electric", termMonths: 60, lines: {} };
    expect(quoteFieldChecks(empty, config)).toEqual({});
  });
});

/**
 * The finance line, which is the case this was built for.
 *
 * impliedRate already returns null for a payment that cannot repay the
 * principal and for one too big for any rate — but null cannot say which, and
 * "we could not work out the rate" is a poor thing to tell somebody who has
 * just picked the wrong frequency.
 */
describe("A finance payment that cannot be true", () => {
  it("catches one too low to repay the amount financed", () => {
    const c = quoteFieldChecks(sound({ lines: { finance: 200 } }), config).finance;
    expect(c?.level).toBe("error");
    expect(c?.message).toMatch(/too low/i);
    // The shortfall is the thing that makes somebody look at the frequency.
    expect(c?.message).toMatch(/\$[\d,]+ unpaid/);
  });

  it("catches one too high for any rate to explain", () => {
    const c = quoteFieldChecks(sound({ lines: { finance: monthlyPayment * 6 } }), config).finance;
    expect(c?.level).toBe("error");
    expect(c?.message).toMatch(/too high/i);
  });

  it("warns rather than blocks on a rate that is merely terrible", () => {
    const dear = annuityPayment(financed, residualExGst, 30, months);
    const c = quoteFieldChecks(sound({ lines: { finance: dear } }), config).finance;
    expect(c?.level).toBe("warn");
    expect(c?.message).toMatch(/%/);
  });

  it("leaves an ordinary rate alone", () => {
    for (const rate of [4, 7.5, 12, 18]) {
      const p = annuityPayment(financed, residualExGst, rate, months);
      expect(quoteFieldChecks(sound({ lines: { finance: p } }), config).finance).toBeUndefined();
    }
  });

  /**
   * The commonest mistake, and the reason the message names the frequency.
   *
   * A monthly figure entered under "weekly" is about 4.3x too large; the same
   * figure read the other way is that much too small. Both have to be caught,
   * because everything downstream is computed from it without complaint.
   */
  it("catches a monthly figure entered as weekly, and the reverse", () => {
    const asWeekly = quoteFieldChecks(
      sound({ frequency: "weekly", lines: { finance: monthlyPayment } }),
      config,
    ).finance;
    expect(asWeekly?.level).toBe("error");

    const weekly = monthlyPayment * 12 / 52;
    const asMonthly = quoteFieldChecks(
      sound({ frequency: "monthly", lines: { finance: weekly } }),
      config,
    ).finance;
    expect(asMonthly?.level).toBe("error");
  });

  it("judges the same figure against the frequency it was entered at", () => {
    const weekly = (monthlyPayment * 12) / 52;
    expect(
      quoteFieldChecks(sound({ frequency: "weekly", lines: { finance: weekly } }), config).finance,
    ).toBeUndefined();
  });
});

describe("A residual the ATO would not accept", () => {
  it("catches one under the minimum for the term", () => {
    const c = quoteFieldChecks(sound({ residualIncGst: 2_000 }), config).residualIncGst;
    expect(c?.level).toBe("error");
    expect(c?.message).toContain(`${config.lease.residualMinPct["5"]}%`);
  });

  it("catches one larger than the amount financed", () => {
    // Inc-GST, so it has to clear the financed amount once the GST is removed.
    const c = quoteFieldChecks(sound({ residualIncGst: financed * 1.2 }), config).residualIncGst;
    expect(c?.level).toBe("error");
    expect(c?.message).toMatch(/cannot exceed/i);
  });

  it("accepts the minimum itself, and anything above it", () => {
    for (const r of [residual, residual * 1.2, residual * 1.5]) {
      expect(quoteFieldChecks(sound({ residualIncGst: r }), config).residualIncGst).toBeUndefined();
    }
  });

  // Shorter terms carry HIGHER minimums — 65.63% at one year against 28.13%
  // at five — so the same residual can be fine on one lease and impossible on
  // another. The check has to read the term, not a constant.
  it("uses the minimum for the term it was given, not a fixed one", () => {
    // 50% of the financed amount, ex-GST: clears the three-year floor of
    // 46.88% and misses the one-year floor of 65.63%.
    const mid = financed * 0.5 * 1.1;
    expect(quoteFieldChecks(sound({ termMonths: 36, residualIncGst: mid }), config).residualIncGst)
      .toBeUndefined();
    expect(
      quoteFieldChecks(sound({ termMonths: 12, residualIncGst: mid }), config).residualIncGst?.level,
    ).toBe("error");
  });
});

describe("The other figures", () => {
  it("flags an amount financed well above the drive-away price", () => {
    const c = quoteFieldChecks(sound({ amountFinanced: 90_000 }), config).amountFinanced;
    expect(c?.level).toBe("warn");
  });

  it("flags an amount financed well below the price", () => {
    const c = quoteFieldChecks(sound({ amountFinanced: 20_000 }), config).amountFinanced;
    expect(c?.level).toBe("warn");
  });

  it("leaves the usual GST-credit gap alone", () => {
    // What a financier actually finances: the price less the GST it reclaims.
    const c = quoteFieldChecks(
      sound({ vehiclePrice: 55_000, amountFinanced: 50_000 }),
      config,
    ).amountFinanced;
    expect(c).toBeUndefined();
  });

  it("flags an annual management fee entered as a per-pay one", () => {
    const c = quoteFieldChecks(sound({ lines: { managementFee: 750 } }), config).managementFee;
    expect(c?.level).toBe("warn");
    expect(c?.message).toMatch(/annual figure/i);
  });

  it("leaves a normal management fee alone", () => {
    expect(quoteFieldChecks(sound({ lines: { managementFee: 35 } }), config).managementFee).toBeUndefined();
  });

  it("questions a price that cannot be a car", () => {
    expect(quoteFieldChecks(sound({ vehiclePrice: 900 }), config).vehiclePrice?.level).toBe("warn");
  });

  // A price that low with nothing else filled in must raise a question and
  // not an accusation — there is no finance line to contradict.
  it("treats a low price on its own as a question, not an impossibility", () => {
    const bare: Quote = {
      frequency: "monthly",
      fuelType: "electric",
      termMonths: 60,
      vehiclePrice: 900,
      lines: {},
    };
    expect(hasBlockingCheck(quoteFieldChecks(bare, config))).toBe(false);
  });
});

describe("Telling the two levels apart", () => {
  it("reports a blocking check only for what cannot be true", () => {
    expect(hasBlockingCheck(quoteFieldChecks(sound({ lines: { finance: 200 } }), config))).toBe(true);
    expect(
      hasBlockingCheck(quoteFieldChecks(sound({ lines: { managementFee: 750 } }), config)),
    ).toBe(false);
  });

  it("writes every message to the person who typed it", () => {
    const all = [
      quoteFieldChecks(sound({ lines: { finance: 200 } }), config).finance,
      quoteFieldChecks(sound({ residualIncGst: 2_000 }), config).residualIncGst,
      quoteFieldChecks(sound({ amountFinanced: 90_000 }), config).amountFinanced,
      quoteFieldChecks(sound({ lines: { managementFee: 750 } }), config).managementFee,
    ];
    for (const c of all) {
      expect(c).toBeTruthy();
      expect(c!.message.trim().endsWith(".")).toBe(true);
      expect(c!.message.length).toBeGreaterThan(40);
    }
  });
});
