import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { modelledDeduction, quotedDeduction } from "@/lib/au/deduction";
import {
  calculateLease,
  defaultInputs,
  luxuryCarAdjustment,
  type LeaseInputs,
} from "@/lib/au/novated";
import { decodeQuote, type Quote } from "@/lib/au/quote";

const config = DEFAULT_CONFIG;

/**
 * Which figures the deduction is built from.
 *
 * Reported from a real lease: the breakdown said $1,945 a month against a
 * payslip of $1,780. Nothing was miscalculated — the page was answering the
 * wrong question. It modelled what the lease ought to cost from the car's
 * price and the GST credit the engine believed was available, where the
 * employer deducts what the provider's quote says.
 *
 * So a quote, once attached, is the deduction. These tests hold that boundary:
 * the quoted breakdown reproduces the document, and the modelled one is only
 * used when there is no document to use.
 */
describe("Where the deduction figures come from", () => {
  /** The reported lease: a Mercedes EQE on a 60-month quote, monthly. */
  const realQuote = (over: Partial<Quote> = {}): Quote => ({
    frequency: "monthly",
    fuelType: "electric",
    termMonths: 60,
    vehiclePrice: 79_794,
    onRoadCosts: 4_635,
    amountFinanced: 78_095,
    residualIncGst: 24_100,
    deferredMonths: 2,
    statedPreTax: 1_780,
    lines: {
      finance: 1_457.1,
      energy: 3.93,
      maintenance: 35,
      tyres: 34.67,
      registration: 50.96,
      insurance: 117.32,
      managementFee: 39,
      luxuryCarAdjustment: 42.15,
    },
    ...over,
  });

  describe("from the provider's quote", () => {
    it("reproduces the deduction the payslip actually shows", () => {
      const d = quotedDeduction(decodeQuote(realQuote(), config));
      // $1,780.13 a month, against the $1,780 the quote states.
      expect(d.total / 12).toBeCloseTo(1_780.13, 2);
      expect(d.statedDeduction! / 12).toBeCloseTo(1_780, 2);
      expect(Math.abs(d.statedDeduction! - d.total)).toBeLessThan(2);
    });

    it("itemises to its own total", () => {
      const d = quotedDeduction(decodeQuote(realQuote(), config));
      expect(d.rows.reduce((t, r) => t + r.annual, 0)).toBeCloseTo(d.total, 6);
    });

    it("carries every line the quote states, and none it does not", () => {
      const d = quotedDeduction(decodeQuote(realQuote(), config));
      const keys = d.rows.map((r) => r.key).sort();
      expect(keys).toEqual(
        [
          "energy",
          "finance",
          "insurance",
          "luxuryCarAdjustment",
          "maintenance",
          "managementFee",
          "registration",
          "tyres",
        ].sort(),
      );
      // Roadside is absent from this quote and must not be invented.
      expect(keys).not.toContain("roadside");
    });

    /*
     * The gap the page reports rather than averages away. Where a provider
     * states a deduction their own lines do not come to, that difference is
     * usually an employer's share of the tax saving — a real thing to ask
     * about, and invisible if the two figures are reconciled silently.
     */
    it("keeps the stated deduction separate from the lines", () => {
      const d = quotedDeduction(decodeQuote(realQuote({ statedPreTax: 1_900 }), config));
      expect(d.statedDeduction! / 12).toBeCloseTo(1_900, 2);
      expect(d.total / 12).toBeCloseTo(1_780.13, 2);
      expect(d.statedDeduction).not.toBeCloseTo(d.total, 2);
    });

    it("says nothing about a stated deduction when the quote does not state one", () => {
      const d = quotedDeduction(decodeQuote(realQuote({ statedPreTax: undefined }), config));
      expect(d.statedDeduction).toBeNull();
    });

    /*
     * The luxury car charge, which now has a card explaining it.
     *
     * The card reads its figure off the printed row rather than recomputing
     * the charge, so that it cannot explain a different number from the one
     * in the table. With a quote attached that row is the provider's amount,
     * and ours is only a benchmark against it — $505.80 charged here against
     * $517.89 our percentage would suggest. If the row ever started carrying
     * the modelled figure instead, the card would silently become an
     * explanation of a number nobody is paying.
     */
    it("carries the provider's luxury car charge, not our benchmark for it", () => {
      const d = quotedDeduction(decodeQuote(realQuote(), config));
      const row = d.rows.find((r) => r.key === "luxuryCarAdjustment")!;
      expect(row.annual).toBeCloseTo(42.15 * 12, 6);

      const ours = luxuryCarAdjustment(78_095, config);
      expect(ours).toBeGreaterThan(0);
      expect(row.annual).not.toBeCloseTo(ours, 2);
    });

    it("drops the charge entirely when the quote does not levy one", () => {
      const lines = { ...realQuote().lines, luxuryCarAdjustment: undefined };
      const d = quotedDeduction(decodeQuote(realQuote({ lines }), config));
      expect(d.rows.some((r) => r.key === "luxuryCarAdjustment")).toBe(false);
    });
  });

  /*
   * What the charge is actually a function of, since the card states it as a
   * reason: the amount financed above the ATO's car limit, not the car's
   * price and not the term.
   */
  describe("the luxury car charge itself", () => {
    const limit = config.gst.carLimit;

    it("is nil at or below the car limit", () => {
      expect(luxuryCarAdjustment(limit, config)).toBe(0);
      expect(luxuryCarAdjustment(limit - 10_000, config)).toBe(0);
    });

    it("is charged on the excess only, not the whole amount financed", () => {
      const excess = 20_000;
      const charge = luxuryCarAdjustment(limit + excess, config);
      expect(charge).toBeCloseTo(excess * (config.lease.luxuryCarAdjustmentPct / 100), 6);
      // The distinction the card turns on: a tenth of the excess, not of the car.
      expect(charge).toBeLessThan((limit + excess) * 0.05);
    });

    it("rises with the amount financed and nothing else", () => {
      const a = luxuryCarAdjustment(limit + 5_000, config);
      const b = luxuryCarAdjustment(limit + 15_000, config);
      expect(b).toBeGreaterThan(a);
      expect(b / a).toBeCloseTo(3, 6);
    });
  });

  describe("against the modelled figures", () => {
    const leaseInputs = (over: Partial<LeaseInputs> = {}): LeaseInputs => ({
      ...defaultInputs(config),
      salary: 0,
      vehiclePrice: 79_794,
      onRoadCosts: 4_635,
      fuelType: "electric",
      state: "NSW",
      termYears: 5,
      annualKm: 15_000,
      interestRatePct: 11.85,
      residualPct: 28.13,
      includeRunningCosts: true,
      payCycle: "monthly",
      adminFeeAnnual: 468,
      purchasedFrom: "private",
      ...over,
    });

    /*
     * The discrepancy that started this, kept as a test so the two sources
     * cannot quietly converge and hide the fact that they answer different
     * questions. A private purchase claims no GST credit, so the model
     * finances the whole drive-away figure; the provider financed it net of a
     * credit. Both are internally right.
     */
    it("differs from the quote when the model finances a different amount", () => {
      const r = calculateLease(leaseInputs(), config);
      const quoted = quotedDeduction(decodeQuote(realQuote(), config));
      expect(r.finance.amountFinanced).toBeCloseTo(84_429, 0);
      expect(quoted.rows.find((x) => x.key === "finance")!.annual / 12).toBeCloseTo(1_457.1, 2);
      expect(r.finance.monthlyPayment).toBeGreaterThan(1_457.1);
    });

    it("still itemises to its own total", () => {
      for (const purchasedFrom of ["private", "dealer"] as const) {
        const r = calculateLease(leaseInputs({ purchasedFrom }), config);
        const d = modelledDeduction(
          r.inputs,
          config,
          r.finance,
          r.running,
          r.fbt,
          r.package.preTaxAnnual,
          r.package.postTaxAnnual,
        );
        expect(d.rows.reduce((t, x) => t + x.annual, 0)).toBeCloseTo(d.total, 6);
        expect(d.total).toBeCloseTo(r.package.preTaxAnnual + r.package.postTaxAnnual, 6);
      }
    });

    it("is labelled as modelled, so a page can say which it is showing", () => {
      const r = calculateLease(leaseInputs(), config);
      expect(
        modelledDeduction(
          r.inputs,
          config,
          r.finance,
          r.running,
          r.fbt,
          r.package.preTaxAnnual,
          r.package.postTaxAnnual,
        ).source,
      ).toBe("modelled");
      expect(quotedDeduction(decodeQuote(realQuote(), config)).source).toBe("quoted");
    });
  });
});
