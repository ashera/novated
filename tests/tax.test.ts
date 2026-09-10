import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import {
  incomeTax,
  lito,
  medicareLevy,
  helpRepayment,
  takeHome,
  marginalRelief,
  marginalRate,
} from "@/lib/au/tax";

const config = DEFAULT_CONFIG;
const tax = config.tax;

// The top-level describe title becomes the "area" in the admin test dashboard.
describe("Income tax", () => {
  it("charges nothing below the tax-free threshold", () => {
    expect(incomeTax(18_200, tax)).toBe(0);
    expect(incomeTax(0, tax)).toBe(0);
  });

  it("charges the second bracket rate on income just above the threshold", () => {
    // $1,000 over the threshold at 15%.
    expect(incomeTax(19_200, tax)).toBeCloseTo(150, 2);
  });

  it("matches the published cumulative tax at each bracket boundary", () => {
    expect(incomeTax(45_000, tax)).toBeCloseTo(4_020, 2);
    expect(incomeTax(135_000, tax)).toBeCloseTo(31_020, 2);
    expect(incomeTax(190_000, tax)).toBeCloseTo(51_370, 2);
  });

  it("charges the top marginal rate above the highest threshold", () => {
    expect(incomeTax(200_000, tax) - incomeTax(190_000, tax)).toBeCloseTo(4_500, 2);
  });

  it("treats a negative taxable income as nil rather than a refund", () => {
    expect(incomeTax(-10_000, tax)).toBe(0);
  });
});

describe("Offsets and levies", () => {
  it("gives the full low income tax offset below the first taper", () => {
    expect(lito(30_000, tax)).toBe(700);
  });

  it("tapers the offset away entirely by the end of the second taper", () => {
    expect(lito(37_500, tax)).toBeCloseTo(700, 6);
    expect(lito(45_000, tax)).toBeCloseTo(325, 6);
    expect(lito(70_000, tax)).toBe(0);
  });

  it("charges no Medicare levy below the low-income threshold", () => {
    expect(medicareLevy(tax.medicare.lowIncomeThreshold, tax)).toBe(0);
  });

  it("shades the Medicare levy in at 10c per dollar, then caps it at the flat rate", () => {
    const t = tax.medicare.lowIncomeThreshold;
    expect(medicareLevy(t + 1_000, tax)).toBeCloseTo(100, 6); // shade-in still cheaper
    expect(medicareLevy(100_000, tax)).toBeCloseTo(2_000, 6); // flat 2%
  });

  it("charges no compulsory HELP repayment below the first threshold", () => {
    expect(helpRepayment(60_000, tax)).toBe(0);
  });

  it("charges HELP marginally, not on the whole income", () => {
    // $10k over the $67,000 threshold at 15c.
    expect(helpRepayment(77_000, tax)).toBeCloseTo(1_500, 6);
    // Second band applies only to income above $125,000.
    expect(helpRepayment(135_000, tax)).toBeCloseTo(58_000 * 0.15 + 10_000 * 0.17, 6);
  });
});

describe("Take-home pay", () => {
  it("leaves take-home equal to gross less tax, levy and any HELP repayment", () => {
    const t = takeHome(110_000, config);
    expect(t.net).toBeCloseTo(110_000 - t.incomeTax - t.medicare - t.help, 6);
    expect(t.help).toBe(0);
  });

  it("only charges a HELP repayment when there is a debt", () => {
    expect(takeHome(110_000, config, { hasHelpDebt: false }).help).toBe(0);
    expect(takeHome(110_000, config, { hasHelpDebt: true }).help).toBeGreaterThan(0);
  });

  it("adds reportable fringe benefits to HELP repayment income but not to taxable income", () => {
    const plain = takeHome(110_000, config, { hasHelpDebt: true });
    const withRfb = takeHome(110_000, config, {
      hasHelpDebt: true,
      repaymentIncomeExtra: 20_000,
    });
    expect(withRfb.incomeTax).toBeCloseTo(plain.incomeTax, 6);
    expect(withRfb.help).toBeGreaterThan(plain.help);
  });
});

describe("Salary packaging relief", () => {
  it("relieves a packaged dollar at the marginal rate plus the Medicare levy", () => {
    // Well inside the 30% bracket, so no boundary effects.
    const r = marginalRelief(110_000, 10_000, config);
    expect(r.effectiveRate).toBeCloseTo(0.32, 4);
  });

  it("relieves at the top rate plus the levy for a high earner", () => {
    const r = marginalRelief(300_000, 20_000, config);
    expect(r.effectiveRate).toBeCloseTo(0.47, 4);
  });

  it("handles a deduction that crosses a bracket boundary", () => {
    // Straddles $135,000: part relieved at 37%, part at 30%, plus the levy.
    const r = marginalRelief(145_000, 20_000, config);
    expect(r.effectiveRate).toBeGreaterThan(0.32);
    expect(r.effectiveRate).toBeLessThan(0.39);
  });

  it("does not credit a HELP saving that the reportable fringe benefit cancels out", () => {
    // The RFB exists only once the car is packaged, so it belongs on the "after"
    // side alone. Applying it to both sides would invent a saving.
    const naive = marginalRelief(110_000, 12_000, config, {
      hasHelpDebt: true,
      repaymentIncomeExtra: 25_000,
    });
    const correct = marginalRelief(
      110_000,
      12_000,
      config,
      { hasHelpDebt: true },
      { hasHelpDebt: true, repaymentIncomeExtra: 25_000 },
    );
    expect(correct.taxSaved).toBeLessThan(naive.taxSaved);
  });

  it("returns no relief for a nil deduction", () => {
    const r = marginalRelief(110_000, 0, config);
    expect(r.taxSaved).toBeCloseTo(0, 6);
    expect(r.effectiveRate).toBe(0);
  });

  it("reports the headline marginal rate for copy", () => {
    expect(marginalRate(110_000, config)).toBeCloseTo(0.32, 6);
    expect(marginalRate(250_000, config)).toBeCloseTo(0.47, 6);
  });
});
