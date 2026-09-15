import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { derivedAmountFinanced, financeBasis, type Quote } from "@/lib/au/quote";
import { calculateLease, defaultInputs, type LeaseInputs } from "@/lib/au/novated";

const config = DEFAULT_CONFIG;

/**
 * The decoder and the calculator have to agree about what is borrowed.
 *
 * They are two views of one lease: the calculator works it out from the car,
 * and the decoder pre-fills the same figure so somebody can see whether the
 * quote matches. If the two disagree, the greyed number in the box is wrong
 * about the page it came from — which is exactly what happened. The decoder
 * had its own copy of the sum and left the on-road costs out, so a car with
 * $4,558 of on-roads pre-filled $4,558 short of the lease beside it.
 *
 * The engine has always had it right: the financier pays the dealer's whole
 * invoice, car and on-roads together, and claims the GST back on the car
 * alone. This asserts the decoder says the same.
 */
const quoteFor = (inputs: LeaseInputs): Quote => ({
  frequency: "monthly",
  fuelType: inputs.fuelType,
  termMonths: inputs.termYears * 12,
  vehiclePrice: inputs.vehiclePrice,
  onRoadCosts: inputs.onRoadCosts,
  lines: {},
});

describe("What the lease is written over", () => {
  const cases: [string, Partial<LeaseInputs>][] = [
    ["no on-road costs", { vehiclePrice: 55_000, onRoadCosts: undefined }],
    ["ordinary on-road costs", { vehiclePrice: 79_794, onRoadCosts: 4_558 }],
    ["a cheap car with heavy on-roads", { vehiclePrice: 28_000, onRoadCosts: 3_400 }],
    ["above the car limit", { vehiclePrice: 120_000, onRoadCosts: 6_000 }],
    ["exactly at the car limit", { vehiclePrice: config.gst.carLimit, onRoadCosts: 2_000 }],
  ];

  it.each(cases)("agrees with the calculator: %s", (_label, over) => {
    const inputs = { ...defaultInputs(config), ...over };
    const lease = calculateLease(inputs, config);
    expect(derivedAmountFinanced(quoteFor(inputs), config)).toBeCloseTo(
      lease.finance.amountFinanced,
      6,
    );
  });

  it("is what the decoder actually computes with when the field is blank", () => {
    const inputs = { ...defaultInputs(config), vehiclePrice: 79_794, onRoadCosts: 4_558 };
    const q = quoteFor(inputs);
    const basis = financeBasis(q, config);
    expect(basis.financedWasDerived).toBe(true);
    expect(basis.amountFinanced).toBeCloseTo(derivedAmountFinanced(q, config)!, 6);
  });

  // The specific failure: on-roads silently dropped.
  it("includes the on-road costs, which are borrowed alongside the car", () => {
    const withOnRoads = derivedAmountFinanced(
      { ...quoteFor(defaultInputs(config)), vehiclePrice: 55_000, onRoadCosts: 4_000 },
      config,
    )!;
    const without = derivedAmountFinanced(
      { ...quoteFor(defaultInputs(config)), vehiclePrice: 55_000, onRoadCosts: undefined },
      config,
    )!;
    expect(withOnRoads - without).toBeCloseTo(4_000, 6);
  });

  /**
   * On-roads carry no GST credit, so enough of them finances MORE than the car
   * costs. Worth pinning because the copy used to assert the opposite — "the
   * lease is written over less than the price" — which stops being true here.
   */
  it("can exceed the car's own price once on-roads are large enough", () => {
    const q: Quote = { ...quoteFor(defaultInputs(config)), vehiclePrice: 30_000, onRoadCosts: 3_500 };
    expect(derivedAmountFinanced(q, config)!).toBeGreaterThan(q.vehiclePrice!);
  });

  it("says nothing without a price to work from", () => {
    expect(derivedAmountFinanced({ ...quoteFor(defaultInputs(config)), vehiclePrice: undefined }, config))
      .toBeNull();
  });

  // Above the car limit the credit stops growing, so the financed amount does.
  it("caps the GST credit at the car limit", () => {
    const atLimit = derivedAmountFinanced(
      { ...quoteFor(defaultInputs(config)), vehiclePrice: config.gst.carLimit, onRoadCosts: 0 },
      config,
    )!;
    const above = derivedAmountFinanced(
      { ...quoteFor(defaultInputs(config)), vehiclePrice: config.gst.carLimit + 10_000, onRoadCosts: 0 },
      config,
    )!;
    // Every dollar above the limit is financed in full, credit unchanged.
    expect(above - atLimit).toBeCloseTo(10_000, 6);
  });
});
