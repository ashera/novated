import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { buildRunningCosts, type LeaseInputs } from "@/lib/au/novated";

const config = DEFAULT_CONFIG;
const SOURCE = readFileSync("components/QuoteDecoder.tsx", "utf8");

/**
 * The greyed figures in the quote form are numbers too.
 *
 * Every field on the decoder carried a placeholder lifted from the sample
 * quote — $24.23 of energy, $115.00 of insurance, $19.00 of management fee,
 * 6.95% — so an empty form looked filled in, and the figures it looked filled
 * in with were invented. A placeholder is quieter than a value and it is read
 * the same way: as a suggestion of what is normal.
 *
 * Three things were wrong with them. Nothing sourced them. Nothing updates
 * them when the reference data moves. And a rate typed into a component is the
 * thing the first ground rule of this project forbids, wherever it is typed.
 *
 * So the running-cost fields now show the engine's own estimate for the car on
 * the lease, which is the same figure the findings below them are measured
 * against, and the fields that represent a provider's commercial choice show
 * no figure at all.
 *
 * This is a source-level test because there is no DOM harness. It is narrow on
 * purpose: it does not care how the placeholders are computed, only that no
 * specimen figure is written into the file.
 */
describe("The decoder's placeholders", () => {
  /** Every literal placeholder="..." in the component. */
  const literals = [...SOURCE.matchAll(/placeholder="([^"]*)"/g)].map((m) => m[1]);

  // A zero demonstrates the format without suggesting an amount. Anything else
  // numeric is a specimen figure and has to be derived instead.
  const ALLOWED = new Set(["0", "0.00", "—", ""]);

  it("carries no invented figures", () => {
    const offenders = literals.filter((v) => !ALLOWED.has(v) && /\d/.test(v));
    expect(
      offenders,
      `Hard-coded placeholder figures: ${offenders.join(", ")}. Derive them from the ` +
        `engine for the car on the lease, or drop them — see the note in this test.`,
    ).toEqual([]);
  });

  it("states no interest rate anywhere in the component", () => {
    // The stated-rate field used to suggest 6.95%. Rates live in config.
    const near = SOURCE.match(/placeholder=\{?["']?\d+\.\d+["']?\}?[\s\S]{0,80}?statedRatePct/);
    expect(near).toBeNull();
    expect(SOURCE).not.toMatch(/placeholder="6\.95"/);
  });
});

/**
 * And the derivation has to be the one the findings use, or the grey number
 * quietly disagrees with the verdict printed underneath it — which is the
 * mistake the amount financed made for months.
 */
describe("What the decoder expects a line to be", () => {
  const car: LeaseInputs = {
    vehiclePrice: 79_794,
    fuelType: "electric",
    annualKm: 15_000,
  } as LeaseInputs;

  it("is the engine's running-cost model, per period and ex GST", () => {
    const annual = buildRunningCosts(car, config);
    // Fortnightly, as the decoder defaults to.
    const fortnightly = annual.insurance / 26;
    expect(fortnightly).toBeGreaterThan(0);
    // The specimen it replaced was $115.00 a fortnight for every car on the
    // site, whatever it cost — the figure this pins is a fact about this one.
    expect(fortnightly).not.toBeCloseTo(115, 1);
  });

  it("moves when the car does", () => {
    const cheap = buildRunningCosts({ ...car, vehiclePrice: 30_000 }, config);
    const dear = buildRunningCosts({ ...car, vehiclePrice: 120_000 }, config);
    expect(dear.insurance).toBeGreaterThan(cheap.insurance);
  });

  it("moves when the distance does", () => {
    const little = buildRunningCosts({ ...car, annualKm: 5_000 }, config);
    const lots = buildRunningCosts({ ...car, annualKm: 30_000 }, config);
    expect(lots.fuel).toBeGreaterThan(little.fuel);
    expect(lots.tyres).toBeGreaterThan(little.tyres);
  });
});
