import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { compareQuotes, type Quote } from "@/lib/au/quote";
import { QUOTE_A, QUOTE_B, QUOTE_C, QUOTE_C_REQUOTE } from "./fixtures/quotes";

const config = DEFAULT_CONFIG;

describe("Comparing quotes", () => {
  it("picks the cheapest finance rate", () => {
    // C's re-quote is the best of the four at 8.33%.
    const c = compareQuotes([QUOTE_A, QUOTE_B, QUOTE_C, QUOTE_C_REQUOTE], config);
    expect(c.bestRate).toBe(3);
  });

  it("reports the spread between the best and worst rate", () => {
    const c = compareQuotes([QUOTE_A, QUOTE_C_REQUOTE], config);
    expect(c.rateSpreadPp!).toBeCloseTo(10.8 - 8.33, 1);
    // …and what that spread is worth in money, which is the point.
    expect(c.rateSpreadValue!).toBeGreaterThan(5_000);
  });

  it("keeps the rate spread out of the comparability notes", () => {
    // The UI leads with the spread; repeating it as a note says it twice.
    const c = compareQuotes([QUOTE_A, QUOTE_B], config);
    expect(c.rateSpreadPp).not.toBeNull();
    expect(c.notes.join(" ")).not.toMatch(/percentage points/i);
  });

  it("says nothing about a spread when there is only one quote", () => {
    const c = compareQuotes([QUOTE_A], config);
    expect(c.rateSpreadPp).toBeNull();
    expect(c.rateSpreadValue).toBeNull();
  });

  it("judges lowest interest separately from lowest rate", () => {
    // A smaller loan at a worse rate can still pay less interest overall, so the
    // two measures must be computed independently.
    const small: Quote = {
      ...QUOTE_A,
      vehiclePrice: 40_000,
      amountFinanced: 34_000,
      residualIncGst: 10_522,
      lines: { ...QUOTE_A.lines, finance: 640 }, // worse rate, much smaller loan
    };
    const c = compareQuotes([small, QUOTE_B], config);
    expect(c.quotes[0].decode.impliedRatePct!).toBeGreaterThan(
      c.quotes[1].decode.impliedRatePct!,
    );
    expect(c.bestRate).toBe(1);
    expect(c.bestInterest).toBe(0); // …yet it pays the least interest
  });

  it("picks the leanest running-cost budget", () => {
    const c = compareQuotes([QUOTE_A, QUOTE_C], config);
    // A budgets ~$4,300 of running costs a year; C's insurance alone is $3,495.
    expect(c.bestRunningBudget).toBe(0);
  });
});

describe("Comparison honesty", () => {
  it("refuses to name a cheapest total when the cars are different", () => {
    // A is an $84,219 car; C is $93,423. Comparing totals across those would
    // simply say "the cheaper car costs less", which is not a finding.
    const c = compareQuotes([QUOTE_A, QUOTE_C], config);
    expect(c.vehiclesComparable).toBe(false);
    expect(c.bestTotalCost).toBeNull();
    expect(c.notes.join(" ")).toMatch(/misleading/i);
  });

  it("still compares the rate when the cars are different", () => {
    const c = compareQuotes([QUOTE_A, QUOTE_C], config);
    expect(c.bestRate).not.toBeNull();
    expect(c.rateSpreadPp).not.toBeNull();
  });

  it("does compare totals when the cars are the same price", () => {
    // A and B are both quotes on the same $84,219 vehicle.
    const c = compareQuotes([QUOTE_A, QUOTE_B], config);
    expect(c.vehiclesComparable).toBe(true);
    expect(c.bestTotalCost).not.toBeNull();
  });

  it("treats a small difference in on-road costs as the same car", () => {
    const nudged: Quote = { ...QUOTE_A, vehiclePrice: QUOTE_A.vehiclePrice! * 1.02 };
    expect(compareQuotes([QUOTE_A, nudged], config).vehiclesComparable).toBe(true);
  });

  it("refuses to compare totals across different terms", () => {
    const shorter: Quote = { ...QUOTE_A, termMonths: 36 };
    const c = compareQuotes([QUOTE_A, shorter], config);
    expect(c.vehiclesComparable).toBe(false);
    expect(c.bestTotalCost).toBeNull();
    expect(c.notes.join(" ")).toMatch(/different terms/i);
  });

  it("refuses to compare totals when a quote has no vehicle price", () => {
    const priceless: Quote = { ...QUOTE_A, vehiclePrice: undefined };
    const c = compareQuotes([QUOTE_A, priceless], config);
    expect(c.vehiclesComparable).toBe(false);
    expect(c.bestTotalCost).toBeNull();
  });
});

describe("Comparison arithmetic", () => {
  it("totals the package across the whole term", () => {
    const c = compareQuotes([QUOTE_A], config);
    const row = c.quotes[0];
    expect(row.totalPackageOverTerm).toBeCloseTo(row.decode.annualPackageTotal * 5, 4);
  });

  it("counts only running costs in the running budget", () => {
    const c = compareQuotes([QUOTE_A], config);
    const row = c.quotes[0];
    // Finance, the management fee and the luxury car charge are excluded.
    expect(row.annualRunningBudget).toBeLessThan(row.decode.annualPackageTotal);
    expect(row.annualRunningBudget).toBeCloseTo(
      row.decode.annualLines.energy +
        row.decode.annualLines.maintenance +
        row.decode.annualLines.tyres +
        row.decode.annualLines.registration +
        row.decode.annualLines.insurance,
      2,
    );
  });

  it("handles an empty set without falling over", () => {
    const c = compareQuotes([], config);
    expect(c.quotes).toHaveLength(0);
    expect(c.bestRate).toBeNull();
    expect(c.rateSpreadPp).toBeNull();
    expect(c.vehiclesComparable).toBe(true);
  });

  it("ignores a quote whose rate can't be solved when picking the best", () => {
    const blind: Quote = { ...QUOTE_B, lines: { ...QUOTE_B.lines, finance: undefined } };
    const c = compareQuotes([blind, QUOTE_A], config);
    expect(c.quotes[0].decode.impliedRatePct).toBeNull();
    expect(c.bestRate).toBe(1); // the one we could actually solve
  });
});
