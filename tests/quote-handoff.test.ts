import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote, quoteToLeaseInputs, type Quote } from "@/lib/au/quote";
import { calculateLease, defaultInputs } from "@/lib/au/novated";
import { QUOTE_A, QUOTE_B } from "./fixtures/quotes";

const config = DEFAULT_CONFIG;
const handoff = (q: Quote) => quoteToLeaseInputs(q, decodeQuote(q, config), config);

describe("Quote to calculator", () => {
  it("carries the car, the salary and the term across", () => {
    const i = handoff(QUOTE_A);
    expect(i.vehiclePrice).toBe(QUOTE_A.vehiclePrice);
    expect(i.salary).toBe(QUOTE_A.salary);
    expect(i.fuelType).toBe("electric");
    expect(i.termYears).toBe(5);
    expect(i.annualKm).toBe(15_000);
  });

  it("models the lease at the rate we solved, not at our default", () => {
    // This is the point of the handoff: their deal, not a representative one.
    const i = handoff(QUOTE_A);
    expect(i.interestRatePct).toBeCloseTo(10.8, 1);
    expect(i.interestRatePct).not.toBe(defaultInputs(config).interestRatePct);
  });

  it("rounds the rate to something a person would type", () => {
    // The solver returns full precision; an editable input must not show
    // 10.49820794350002.
    const i = handoff(QUOTE_A);
    expect(i.interestRatePct).toBe(Math.round(i.interestRatePct * 100) / 100);
    expect(String(i.interestRatePct).replace(/^\d+\.?/, "").length).toBeLessThanOrEqual(2);
    expect(handoff(QUOTE_A).residualPct).toBe(28.13);
  });

  it("carries the quote's own running-cost budgets", () => {
    const d = decodeQuote(QUOTE_A, config);
    const i = handoff(QUOTE_A);
    expect(i.includeRunningCosts).toBe(true);
    expect(i.runningCostOverrides?.fuel).toBeCloseTo(d.annualLines.energy, 4);
    expect(i.runningCostOverrides?.insurance).toBeCloseTo(d.annualLines.insurance, 4);
    expect(i.adminFeeAnnual).toBeCloseTo(d.annualLines.managementFee, 4);
  });

  it("carries the residual the quote actually uses", () => {
    expect(handoff(QUOTE_A).residualPct!).toBeCloseTo(28.13, 1);
  });

  it("does not invent a running cost the quote never listed", () => {
    // A zero here would tell the user this car needs no tyres.
    const sparse: Quote = { ...QUOTE_A, lines: { finance: 1_408.53 } };
    const i = handoff(sparse);
    expect(i.runningCostOverrides).toBeUndefined();
    expect(i.includeRunningCosts).toBe(false);
  });

  it("falls back to engine defaults for anything the quote omits", () => {
    const bare: Quote = {
      frequency: "monthly",
      fuelType: "petrol",
      termMonths: 48,
      lines: {},
    };
    const i = handoff(bare);
    const base = defaultInputs(config);
    expect(i.salary).toBe(base.salary);
    expect(i.vehiclePrice).toBe(base.vehiclePrice);
    expect(i.interestRatePct).toBe(base.interestRatePct);
    expect(i.termYears).toBe(4);
  });

  it("produces inputs the engine can run without complaint", () => {
    for (const q of [QUOTE_A, QUOTE_B]) {
      const r = calculateLease(handoff(q), config);
      expect(Number.isFinite(r.package.netAnnualCost)).toBe(true);
      expect(r.package.preTaxAnnual).toBeGreaterThan(0);
    }
  });

  it("reproduces the quote's own package cost closely", () => {
    // The calculator, fed a quote, should land near what the quote itself says
    // the package costs — otherwise the handoff has lost something.
    const d = decodeQuote(QUOTE_A, config);
    const r = calculateLease(handoff(QUOTE_A), config);
    const quoted = d.annualPackageTotal;
    const modelled = r.package.preTaxAnnual + r.package.postTaxAnnual;
    expect(Math.abs(modelled - quoted) / quoted).toBeLessThan(0.05);
  });
});
