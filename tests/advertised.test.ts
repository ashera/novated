import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { calculateLease, defaultInputs } from "@/lib/au/novated";
import { checkAdvertised, impliedPrice, type AdvertisedAd } from "@/lib/au/advertised";

const config = DEFAULT_CONFIG;

/**
 * A real letterbox flyer, de-identified.
 *
 * The figures are from a printed advertisement: twelve cars, each with a
 * weekly cost and a "total savings", and a footnote giving the salary, term
 * and distance they were costed at. The provider is not named anywhere here or
 * in the product — the format is universal and every finding is about the
 * format, not about whoever printed this one.
 */
const FLYER = {
  footnoteSalary: 85_000,
  termYears: 5,
  annualKm: 15_000,
} as const;

const ad = (over: Partial<AdvertisedAd> = {}): AdvertisedAd => ({
  ...FLYER,
  weeklyCost: 210,
  fuelType: "electric",
  ...over,
});

describe("Reading a novated lease advertisement", () => {
  /**
   * The whole point of the page: the ads print a weekly cost and hide the
   * price, and the price is the only figure a reader can independently check.
   */
  it("recovers the price the weekly figure was written against", () => {
    const r = checkAdvertised(ad(), config);
    expect(r.impliedDriveAway).toBeGreaterThan(0);
    // And it is the price that actually produces that figure — asserted, not
    // assumed, because a bisection that has run out of range still returns.
    expect(r.solvedWeekly).toBeCloseTo(210, 0);
  });

  it("round-trips: the solved price reproduces the weekly cost through the engine", () => {
    for (const weekly of [146, 210, 245, 449]) {
      const r = impliedPrice(ad({ weeklyCost: weekly }), config)!;
      const again =
        calculateLease(
          {
            ...defaultInputs(config),
            salary: FLYER.footnoteSalary,
            vehiclePrice: r.price,
            fuelType: "electric",
            termYears: FLYER.termYears,
            annualKm: FLYER.annualKm,
            includeRunningCosts: true,
          },
          config,
        ).package.takeHomeReduction / 52;
      expect(again, `$${weekly}/wk`).toBeCloseTo(weekly, 2);
    }
  });

  // A dearer car costs more a week. If that ever stops being true the
  // bisection is invalid, so it is worth pinning rather than assuming.
  it("is monotonic, which is what makes the solve legitimate", () => {
    const prices = [146, 159, 206, 210, 245].map((w) => impliedPrice(ad({ weeklyCost: w }), config)!.price);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    }
  });

  it("says so rather than guessing when no price fits", () => {
    const r = checkAdvertised(ad({ weeklyCost: 5 }), config);
    expect(r.impliedDriveAway).toBeNull();
    expect(r.findings.map((f) => f.key)).toContain("no-price-fits");
    // No number invented to fill the hole.
    expect(r.ourSavingVsLoan).toBeNull();
    expect(r.residualPayable).toBeNull();
  });

  it("leads with the price, whatever else it finds", () => {
    const r = checkAdvertised(ad({ claimedSaving: 39_297, yourSalary: 200_000 }), config);
    expect(r.findings[0].key).toBe("implied-price");
  });
});

/**
 * The residual is the thing an advertisement has no room for.
 *
 * Not a criticism of leasing — it is how a lease works. But a weekly cost
 * quoted without it describes less than the whole obligation, and this is the
 * one omission that is the same on every ad ever printed.
 */
describe("What the weekly figure leaves out", () => {
  it("names the residual and prices it GST-inclusive", () => {
    const r = checkAdvertised(ad(), config);
    const f = r.findings.find((x) => x.key === "residual-not-advertised")!;
    expect(f.severity).toBe("warn");
    expect(r.residualPayable!).toBeGreaterThan(0);
    expect(f.costOverTerm).toBeCloseTo(r.residualPayable!, 6);
    // Inclusive, as a quote states it and as the calculator now settles it.
    const bare = r.residualPayable! / (1 + config.gst.rate);
    expect(r.residualPayable!).toBeGreaterThan(bare);
  });

  it("checks an advertised saving against a like-for-like comparison", () => {
    const r = checkAdvertised(ad({ claimedSaving: 39_297 }), config);
    expect(r.ourSavingVsLoan).toBeGreaterThan(0);
    expect(r.savingGap).toBeCloseTo(39_297 - r.ourSavingVsLoan!, 6);
    const f = r.findings.find((x) => x.key.startsWith("saving-"))!;
    expect(f).toBeTruthy();
  });

  /**
   * The gap is not evidence of dishonesty and must not be written as though it
   * were. "Savings" has no agreed definition; a bigger number nearly always
   * means a different baseline, and the fault is that the baseline isn't
   * printed rather than that the arithmetic is wrong.
   */
  it("explains a large claimed saving rather than accusing anyone", () => {
    const r = checkAdvertised(ad({ weeklyCost: 510, fuelType: "diesel", claimedSaving: 26_736 }), config);
    const f = r.findings.find((x) => x.key === "saving-overstated")!;
    expect(f.detail).toMatch(/baseline|compared against|measured against/i);
    expect(`${f.title} ${f.detail}`).not.toMatch(/\blie|lying|dishonest|misleading|scam\b/i);
    expect(f.question).toBeTruthy();
  });

  it("accepts a claimed saving that agrees with ours", () => {
    const r = checkAdvertised(ad(), config);
    const honest = checkAdvertised(ad({ claimedSaving: r.ourSavingVsLoan! }), config);
    expect(honest.findings.map((f) => f.key)).toContain("saving-agrees");
  });

  it("still measures the deal when the ad states no saving at all", () => {
    const r = checkAdvertised(ad(), config);
    expect(r.claimedSaving).toBeNull();
    expect(r.findings.map((f) => f.key)).toContain("saving-unmeasured");
    expect(r.ourSavingVsLoan).toBeGreaterThan(0);
  });
});

/**
 * The footnote prices the car for somebody the reader has never met.
 *
 * Every one of these ads is costed at one salary, and the entire benefit runs
 * off the marginal rate. It is the most consequential thing in the smallest
 * print, and it is the one thing this page can answer exactly.
 */
describe("The salary in the fine print isn't yours", () => {
  it("re-prices the same car on the reader's salary", () => {
    const r = checkAdvertised(ad({ yourSalary: 200_000 }), config);
    expect(r.weeklyAtYourSalary).toBeGreaterThan(0);
    expect(r.weeklyAtYourSalary).not.toBeCloseTo(210, 1);
    expect(r.findings.map((f) => f.key)).toContain("costs-you-less");
  });

  it("a higher marginal rate makes the same car cost less a week", () => {
    const low = checkAdvertised(ad({ yourSalary: 60_000 }), config).weeklyAtYourSalary!;
    const high = checkAdvertised(ad({ yourSalary: 200_000 }), config).weeklyAtYourSalary!;
    expect(high).toBeLessThan(low);
  });

  it("stays quiet when the reader's salary is the footnote's", () => {
    const r = checkAdvertised(ad({ yourSalary: FLYER.footnoteSalary }), config);
    expect(r.findings.some((f) => f.key.startsWith("costs-you-"))).toBe(false);
  });

  it("says nothing about a salary it wasn't given", () => {
    expect(checkAdvertised(ad(), config).weeklyAtYourSalary).toBeNull();
  });
});

/**
 * An electric car's advertised figures have an expiry date, and no flyer
 * prints one.
 *
 * The concession is fixed at commencement and follows the lease for life, so
 * the same car at the same price is a different deal either side of a phase
 * boundary. Which is a fact about when the paperwork is signed.
 */
describe("The shelf life of an EV advertisement", () => {
  const early = new Date("2026-09-15T00:00:00Z");

  it("warns that the numbers depend on starting before the phase change", () => {
    // A car dear enough to fall outside the narrowed exemption.
    const r = checkAdvertised(ad({ weeklyCost: 245 }), config, early);
    expect(r.evExemptToday).toBe(true);
    expect(r.exemptionEndsFrom).toBe("2027-04-01");
    const f = r.findings.find((x) => x.key === "exemption-has-a-deadline")!;
    expect(f.severity).toBe("warn");
    expect(f.detail).toMatch(/2027-04-01/);
    expect(f.costOverTerm!).toBeGreaterThan(0);
  });

  it("stays silent for a car the change doesn't reach", () => {
    // Cheap enough to stay fully exempt under the narrowed band.
    const r = checkAdvertised(ad({ weeklyCost: 100 }), config, early);
    expect(r.impliedDriveAway!).toBeLessThan(75_000);
    expect(r.exemptionEndsFrom).toBeNull();
    expect(r.findings.some((f) => f.key === "exemption-has-a-deadline")).toBe(false);
  });

  it("says nothing about exemptions for a petrol car", () => {
    const r = checkAdvertised(ad({ weeklyCost: 266, fuelType: "petrol" }), config, early);
    expect(r.evExemptToday).toBe(false);
    expect(r.findings.some((f) => f.key === "exemption-has-a-deadline")).toBe(false);
  });
});

/**
 * Where the reader has done the one piece of homework the ad invites — looking
 * the car up — the two prices can be put beside each other.
 */
describe("Against a price the reader found themselves", () => {
  it("agrees when the implied price matches", () => {
    const solved = impliedPrice(ad(), config)!.price;
    const r = checkAdvertised(ad({ knownDriveAway: solved }), config);
    expect(r.findings.map((f) => f.key)).toContain("price-checks-out");
  });

  it("flags a gap, in money, when the ad implies a dearer car", () => {
    const solved = impliedPrice(ad(), config)!.price;
    const r = checkAdvertised(ad({ knownDriveAway: solved - 12_000 }), config);
    const f = r.findings.find((x) => x.key === "price-above-market")!;
    expect(f.costOverTerm).toBeCloseTo(12_000, 0);
    expect(f.detail).toMatch(/accessories|trim|fees|rate/i);
  });

  it("flags the other direction too", () => {
    const solved = impliedPrice(ad(), config)!.price;
    const r = checkAdvertised(ad({ knownDriveAway: solved + 12_000 }), config);
    expect(r.findings.map((f) => f.key)).toContain("price-below-market");
  });
});

/**
 * The product rule, asserted rather than trusted: this is a tool about a
 * format, not a campaign against a company. Naming one would make it an attack
 * ad, and would be wrong the moment they changed their artwork.
 */
describe("It names no provider", () => {
  it("mentions no company anywhere in its output", () => {
    const r = checkAdvertised(
      ad({ claimedSaving: 39_297, yourSalary: 150_000, knownDriveAway: 60_000 }),
      config,
    );
    const words = r.findings
      .flatMap((f) => [f.title, f.detail, f.question ?? ""])
      .join(" ");
    for (const name of ["Flare", "Maxxia", "SG Fleet", "Smartgroup", "RemServ", "Toyota Fleet"]) {
      expect(words, name).not.toContain(name);
    }
  });
});
