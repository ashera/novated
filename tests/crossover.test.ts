import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { crossoverRate, solveCrossover } from "@/lib/au/crossover";
import { exampleInputs, examplePetrolInputs } from "@/lib/au/examples";
import { calculateLease } from "@/lib/au/novated";

const config = DEFAULT_CONFIG;

/**
 * The claim an article is about to make in public.
 *
 * Publishing a number means standing behind it, so these test the property
 * rather than the figure: the crossover must be a real crossing, the exemption
 * must buy room rather than immunity, and the answer must move when the tax
 * moves. The exact percentages are free to change with a budget — that is the
 * point of solving them instead of typing them.
 */
describe("Where a lease stops beating a car loan", () => {
  it("finds a rate where the lease is genuinely ahead on one side and behind on the other", () => {
    for (const inputs of [exampleInputs(config), examplePetrolInputs(config)]) {
      const rate = crossoverRate(inputs, config)!;
      expect(rate).toBeGreaterThan(1);
      const justBelow = calculateLease({ ...inputs, interestRatePct: rate - 1 }, config);
      const justAbove = calculateLease({ ...inputs, interestRatePct: rate + 1 }, config);
      expect(justBelow.comparison.savingVsLoan).toBeGreaterThan(0);
      expect(justAbove.comparison.savingVsLoan).toBeLessThan(0);
    }
  });

  // The headline of the article: an exemption is not a licence to accept any
  // rate, it moves the point where accepting one stops paying.
  it("gives an exempt car more room than a packaged petrol one", () => {
    const ev = crossoverRate(exampleInputs(config), config)!;
    const petrol = crossoverRate(examplePetrolInputs(config), config)!;
    expect(ev).toBeGreaterThan(petrol);
    // And it is a wide gap, not a rounding difference — worth publishing.
    expect(ev - petrol).toBeGreaterThan(5);
  });

  it("still puts both inside the range a real quote could land in", () => {
    // If the crossover were 80% the finding would be academic. These are rates
    // a bad quote genuinely reaches.
    for (const inputs of [exampleInputs(config), examplePetrolInputs(config)]) {
      const rate = crossoverRate(inputs, config)!;
      expect(rate).toBeLessThan(40);
    }
  });

  /**
   * The figure has to move with the tax, or the article is a fossil.
   *
   * This is the whole argument for computing an article rather than writing
   * one: raise the FBT rate and the petrol car's tolerance must fall, because
   * more of its cost is tax.
   */
  it("moves when the tax moves", () => {
    // The statutory percentage, not the FBT rate. Under the employee
    // contribution method the contribution reduces the taxable value to nil,
    // so no FBT is ever charged and its rate never enters the arithmetic —
    // what the car costs is 20% of its price, every year, in post-tax dollars.
    // Raising that shrinks how bad a finance rate the lease can absorb.
    const harsher = structuredClone(config);
    harsher.fbt.statutoryRate = 0.3;
    const before = crossoverRate(examplePetrolInputs(config), config)!;
    const after = crossoverRate(examplePetrolInputs(harsher), harsher)!;
    expect(after).toBeLessThan(before);
  });

  // Worth its own assertion because it is counter-intuitive and it is the
  // thing most people think they are being charged.
  it("does not move with the headline FBT rate, because ECM pays no FBT", () => {
    const harsher = structuredClone(config);
    harsher.fbt.rate = 0.6;
    expect(crossoverRate(examplePetrolInputs(harsher), harsher)).toBe(
      crossoverRate(examplePetrolInputs(config), config),
    );
  });

  it("says so rather than inventing a number when the lease always wins", () => {
    // A free car at any rate: nothing to cross.
    const silly = structuredClone(config);
    silly.benchmarks.loanRatePct = 60;
    expect(crossoverRate(exampleInputs(silly), silly)).toBeNull();
  });
});

describe("The shape either side of the crossing", () => {
  it("falls the whole way, so the crossing is the only one", () => {
    const x = solveCrossover("Electric", exampleInputs(config), config);
    const savings = x.points.map((p) => p.savingVsLoan);
    for (let i = 1; i < savings.length; i++) {
      expect(savings[i]).toBeLessThan(savings[i - 1]);
    }
  });

  it("reports the car it solved for, so an article can't mislabel it", () => {
    const ev = solveCrossover("Electric", exampleInputs(config), config);
    const petrol = solveCrossover("Petrol", examplePetrolInputs(config), config);
    expect(ev.exempt).toBe(true);
    expect(ev.fuelType).toBe("electric");
    expect(petrol.exempt).toBe(false);
    expect(petrol.fuelType).toBe("petrol");
  });

  it("crosses zero between the sample rates it publishes", () => {
    const x = solveCrossover("Petrol", examplePetrolInputs(config), config);
    expect(x.points.some((p) => p.savingVsLoan > 0)).toBe(true);
    expect(x.points.some((p) => p.savingVsLoan < 0)).toBe(true);
  });
});
