import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote, derivedAmountFinanced, financeBasis, type Quote } from "@/lib/au/quote";
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

/**
 * The residual is a check on the amount financed.
 *
 * Almost every quote sets the residual at the ATO minimum for the term, so the
 * percentage is effectively known — which makes it a way of testing the figure
 * it is a percentage OF.
 *
 * Reported from a real quote. The price was entered without on-road costs, the
 * derived amount financed came out $2,004 short, and the rate solved at 11.84%
 * instead of 10.46%: a point and a half of error in the headline figure, with
 * nothing on the page suggesting anything was wrong.
 */
describe("When the derived amount financed looks short", () => {
  const smartleasing = (over: Partial<Quote> = {}): Quote => ({
    frequency: "monthly",
    fuelType: "electric",
    termMonths: 60,
    vehiclePrice: 57_195.90,
    residualIncGst: 16_709.33,
    lines: { finance: 965.76 },
    salary: 110_000,
    ...over,
  });
  const finding = (q: Quote) =>
    decodeQuote(q, config).findings.find((f) => f.key === "financed-may-be-short");

  it("notices a residual that is not the ATO minimum of what we derived", () => {
    const f = finding(smartleasing())!;
    expect(f.severity).toBe("warn");
    expect(f.title).toMatch(/29\.21%/);
    expect(f.title).toMatch(/28\.13%/);
  });

  it("names the amount financed the ATO percentage implies, and the gap", () => {
    const f = finding(smartleasing())!;
    expect(f.detail).toMatch(/\$54,000/);
    expect(f.detail).toMatch(/\$2,004/);
    expect(f.detail).toMatch(/on-road costs financed in/i);
  });

  // Why it is worth a warning rather than a note.
  it("is worth a point and a half on the rate", () => {
    const short = decodeQuote(smartleasing(), config).impliedRatePct!;
    const right = decodeQuote(smartleasing({ onRoadCosts: 2_004.08 }), config).impliedRatePct!;
    expect(short).toBeCloseTo(11.84, 1);
    expect(right).toBeCloseTo(10.46, 1);
  });

  it("goes quiet once the on-roads are entered", () => {
    expect(finding(smartleasing({ onRoadCosts: 2_004.08 }))).toBeUndefined();
  });

  /** Nothing to second-guess when the figure came off the document. */
  it("says nothing when the amount financed was typed", () => {
    expect(finding(smartleasing({ amountFinanced: 54_000.36 }))).toBeUndefined();
    // Even where that typed figure is the short one.
    expect(finding(smartleasing({ amountFinanced: 51_996.27 }))).toBeUndefined();
  });

  /**
   * A provider is allowed to set a residual above the minimum, and the
   * existing residual finding covers that. This one only speaks up when the
   * gap is big enough to be a missing chunk of principal.
   *
   * Tested against a quote whose amount financed is already right — the first
   * attempt nudged the residual on the SHORT quote, which was 1.08 points
   * above the minimum before the nudge and further above it after.
   */
  it("tolerates a residual a little above the minimum", () => {
    const barely = smartleasing({
      onRoadCosts: 2_004.08,
      residualIncGst: 16_709.33 * 1.005,
    });
    expect(finding(barely)).toBeUndefined();
  });
});
