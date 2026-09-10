import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { annuityPayment, impliedRate, luxuryCarAdjustment } from "@/lib/au/novated";
import { ALL_QUOTES, EXPECTED_RATES, QUOTE_A } from "./fixtures/quotes";
import { decodeQuote } from "@/lib/au/quote";

const config = DEFAULT_CONFIG;

describe("Implied interest rate", () => {
  it("recovers any rate it is given, across the plausible range", () => {
    for (const rate of [0, 1.5, 4.25, 7.5, 9.99, 12.75, 21, 35]) {
      const payment = annuityPayment(60_000, 18_000, rate, 60);
      expect(impliedRate(60_000, 18_000, payment, 60)).toBeCloseTo(rate, 6);
    }
  });

  it("recovers a rate with no balloon, and with a balloon equal to the principal", () => {
    const noBalloon = annuityPayment(40_000, 0, 8, 48);
    expect(impliedRate(40_000, 0, noBalloon, 48)).toBeCloseTo(8, 6);
    // Interest-only: the balloon repays the whole principal at the end.
    const interestOnly = annuityPayment(40_000, 40_000, 8, 48);
    expect(impliedRate(40_000, 40_000, interestOnly, 48)).toBeCloseTo(8, 6);
  });

  it("returns exactly zero for an interest-free lease", () => {
    // The payment that just amortises the gap is the 0% boundary — it has an
    // answer, and rejecting it would be wrong.
    const payment = (50_000 - 20_000) / 60;
    expect(impliedRate(50_000, 20_000, payment, 60)).toBeCloseTo(0, 6);
  });

  it("returns null when no rate could explain the payment", () => {
    // Below the interest-free floor.
    expect(impliedRate(50_000, 20_000, 100, 60)).toBeNull();
    // Absurdly high — beyond the search window.
    expect(impliedRate(50_000, 20_000, 500_000, 60)).toBeNull();
  });

  it("returns null on nonsense inputs rather than a misleading number", () => {
    expect(impliedRate(0, 0, 500, 60)).toBeNull();
    expect(impliedRate(50_000, 20_000, 0, 60)).toBeNull();
    expect(impliedRate(50_000, 20_000, 900, 0)).toBeNull();
    expect(impliedRate(50_000, 60_000, 900, 60)).toBeNull(); // balloon above principal
  });

  it("rises monotonically with the payment", () => {
    let last = -Infinity;
    for (const payment of [700, 800, 900, 1_000, 1_200]) {
      const r = impliedRate(50_000, 20_000, payment, 60)!;
      expect(r).toBeGreaterThan(last);
      last = r;
    }
  });
});

describe("Real quote fixtures", () => {
  it("solves the rate on all four real quotes", () => {
    const got = ALL_QUOTES.map((q) => decodeQuote(q, config).impliedRatePct);
    expect(got.every((r) => r != null)).toBe(true);
    const [a, b, c, cRe] = got as number[];
    expect(a).toBeCloseTo(EXPECTED_RATES.A, 1);
    expect(b).toBeCloseTo(EXPECTED_RATES.B, 1);
    expect(c).toBeCloseTo(EXPECTED_RATES.C, 1);
    expect(cRe).toBeCloseTo(EXPECTED_RATES.C_REQUOTE, 1);
  });

  it("finds every real quote priced above a comparable car loan", () => {
    // The point of the whole feature: not one of these is a good finance rate,
    // and not one of them says so.
    for (const q of ALL_QUOTES) {
      const d = decodeQuote(q, config);
      expect(d.impliedRatePct!).toBeGreaterThan(config.benchmarks.loanRatePct);
      expect(d.financeMargin!).toBeGreaterThan(0);
    }
  });

  it("puts every real residual at the ATO five-year minimum", () => {
    for (const q of ALL_QUOTES) {
      expect(decodeQuote(q, config).residualPctOfFinanced!).toBeCloseTo(28.13, 1);
    }
  });

  it("derives the financed amount when a quote omits it", () => {
    const withoutFinanced = { ...QUOTE_A, amountFinanced: undefined };
    const d = decodeQuote(withoutFinanced, config);
    expect(d.financedWasDerived).toBe(true);
    // Drive-away less the capped GST credit reproduces the stated figure.
    expect(d.amountFinanced!).toBeCloseTo(QUOTE_A.amountFinanced!, 0);
    // …and therefore recovers the same rate.
    expect(d.impliedRatePct!).toBeCloseTo(EXPECTED_RATES.A, 1);
  });
});

describe("Luxury car adjustment", () => {
  it("charges nothing on a car under the limit", () => {
    expect(luxuryCarAdjustment(50_000, config)).toBe(0);
    expect(luxuryCarAdjustment(config.gst.carLimit, config)).toBe(0);
  });

  it("charges the configured rate on the excess only", () => {
    const financed = config.gst.carLimit + 10_000;
    expect(luxuryCarAdjustment(financed, config)).toBeCloseTo(
      10_000 * (config.lease.luxuryCarAdjustmentPct / 100),
      6,
    );
  });

  it("reproduces the charge the real quotes itemise", () => {
    // Two providers show this line. The model was derived from them, so this
    // guards the derivation rather than discovering it — if the rate is ever
    // edited in the backoffice, these are the numbers it has to keep matching.
    expect(luxuryCarAdjustment(77_885, config)).toBeCloseTo(42.15 * 12, -1);
    expect(luxuryCarAdjustment(74_574, config)).toBeCloseTo(11.58 * 26, -1);
  });
});
