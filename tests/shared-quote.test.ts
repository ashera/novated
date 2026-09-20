import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote } from "@/lib/au/quote";
import {
  applyScenarioFromQuote,
  leaseFromSharedLease,
  leaseToInputs,
  leaseFromSharedQuote,
  leaseToQuote,
  newLease,
  type Lease,
  type QuoteSpec,
  type VehicleSpec,
} from "@/lib/au/lease";
import { stashSharedQuote, takeSharedQuote } from "@/lib/quoteHandoff";

const config = DEFAULT_CONFIG;

/**
 * Turning somebody else's quote into your own lease.
 *
 * A share link is read-only and narrow by design: it carries a car and one
 * provider's document, and nothing about the person who was quoted. That makes
 * it safe to send and useless to act on — the figures are priced against a
 * salary that isn't the reader's, and two people on the same car at the same
 * rate can be thousands apart once their brackets and HELP are in it.
 *
 * So the reader gets a copy to work from. What matters is what a copy does
 * and does not contain, and the "does not" is the half that can leak somebody
 * else's finances without anybody noticing.
 */

/** The car on the share — a real quote's figures, de-identified. */
const vehicle: VehicleSpec = {
  make: "Example",
  model: "EV",
  fuelType: "electric",
  price: 57_196,
  annualKm: 15_000,
  state: "VIC",
};

/** The sender's quote, including the salary it was written against. */
const senderSpec = (over: Partial<QuoteSpec> = {}): QuoteSpec => ({
  id: "q-original",
  label: "Provider A",
  frequency: "monthly",
  termMonths: 48,
  amountFinanced: 54_000.36,
  residualIncGst: 16_709.33,
  lines: { finance: 965.76 },
  salary: 185_000,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-02-01T00:00:00.000Z",
  ...over,
});

const senderLease = (): Lease => ({
  ...newLease("Their lease"),
  vehicle,
  scenario: { ...newLease().scenario, salary: 185_000 },
  quotes: [senderSpec()],
  lockedQuoteId: "q-original",
});

describe("A quote somebody shared, made your own", () => {
  it("brings the car and the provider's figures across", () => {
    const copy = leaseFromSharedQuote(vehicle, senderSpec(), config, "Example EV");
    expect(copy.vehicle).toEqual(vehicle);
    expect(copy.quotes).toHaveLength(1);
    const q = copy.quotes[0];
    expect(q.amountFinanced).toBe(54_000.36);
    expect(q.residualIncGst).toBe(16_709.33);
    expect(q.lines.finance).toBe(965.76);
    expect(q.label).toBe("Provider A");
    expect(copy.name).toBe("Example EV");
  });

  /**
   * The one that matters. A QuoteSpec can carry the salary it was written
   * against; the share page strips it before serialising, and this strips it
   * again — because a second caller should not have to know to.
   */
  it("leaves the sender's salary behind", () => {
    const copy = leaseFromSharedQuote(vehicle, senderSpec(), config, "Example EV");
    expect(copy.quotes[0].salary).toBeUndefined();
    // And not hiding anywhere else in what got copied.
    expect(JSON.stringify(copy)).not.toContain("185000");
  });

  it("gives the copy its own identity", () => {
    const copy = leaseFromSharedQuote(vehicle, senderSpec(), config, "Example EV");
    expect(copy.quotes[0].id).not.toBe("q-original");
    // "Processed on" means when it reached THIS workspace.
    expect(copy.quotes[0].createdAt).not.toBe("2025-01-01T00:00:00.000Z");
    expect(copy.quotes[0].updatedAt).toBeUndefined();
  });

  /** A four-year quote modelled over five is not that quote any more. */
  it("takes the term from the quote rather than a default", () => {
    expect(leaseFromSharedQuote(vehicle, senderSpec(), config, "x").scenario.termYears).toBe(4);
    expect(
      leaseFromSharedQuote(vehicle, senderSpec({ termMonths: 60 }), config, "x").scenario.termYears,
    ).toBe(5);
  });

  /**
   * A lock is a decision — "this is the lease I am having" — and it turns the
   * page into a payslip. Inheriting somebody else's would tell the reader they
   * had signed for a car they have not been quoted on.
   */
  it("arrives undecided, however settled the sender was", () => {
    const copy = leaseFromSharedQuote(vehicle, senderSpec(), config, "x");
    expect(copy.lockedQuoteId).toBeUndefined();
    expect(senderLease().lockedQuoteId).toBe("q-original");
  });

  /**
   * The point of the whole exercise: the reader sees the same document, and
   * the rate it implies is a fact about the document rather than about whose
   * salary it was priced against. If these diverged, the copy would be
   * answering a different question from the page that offered it.
   */
  it("decodes to the same rate the reader was shown", () => {
    const theirs = senderLease();
    const before = decodeQuote(leaseToQuote(theirs, theirs.quotes[0]), config);

    const copy = leaseFromSharedQuote(vehicle, senderSpec(), config, "Example EV");
    const after = decodeQuote(leaseToQuote(copy, copy.quotes[0]), config);

    expect(after.impliedRatePct).toBeCloseTo(before.impliedRatePct!, 6);
    expect(after.amountFinanced).toBe(before.amountFinanced);
    expect(after.totalInterest).toBeCloseTo(before.totalInterest!, 6);
  });

  /**
   * Attached is not enough. A reader who followed a link about one quote and
   * landed on figures computed from our own default rate would be reading an
   * answer to a question nobody asked — and it looks like an answer, which is
   * what makes it worse than a blank.
   */
  it("models the quote, rather than merely holding it", () => {
    const copy = leaseFromSharedQuote(vehicle, senderSpec(), config, "Example EV");
    const solved = decodeQuote(leaseToQuote(copy, copy.quotes[0]), config).impliedRatePct!;

    expect(copy.scenario.fromQuoteId).toBe(copy.quotes[0].id);
    // To 2dp: the scenario stores a rate a person could have typed, and the
    // solver's is carried to more places than that.
    expect(copy.scenario.interestRatePct).toBeCloseTo(solved, 2);
    // And that is not simply the default it would have had anyway.
    expect(copy.scenario.interestRatePct).not.toBeCloseTo(newLease().scenario.interestRatePct, 2);
  });

  /** A quote too thin to solve still tells us the term. The arithmetic falls
   *  back to defaults; the term is not a default. */
  it("keeps the term when the quote cannot be solved", () => {
    const thin = senderSpec({ amountFinanced: undefined, lines: {}, termMonths: 36 });
    const copy = leaseFromSharedQuote(vehicle, thin, config, "x");
    expect(copy.scenario.termYears).toBe(3);
    expect(copy.quotes).toHaveLength(1);
    expect(copy.scenario.fromQuoteId).toBeUndefined();
  });

  it("does not disturb the lease it was copied from", () => {
    const theirs = senderLease();
    const snapshot = JSON.stringify(theirs);
    leaseFromSharedQuote(theirs.vehicle, theirs.quotes[0], config, "Mine");
    expect(JSON.stringify(theirs)).toBe(snapshot);
  });
});

/**
 * The handoff itself: one shot, and gone on read.
 *
 * Someone who followed a share link, wandered off and came back next week
 * should not find a stranger's quote waiting in their workspace.
 */
describe("Carrying a shared quote to the calculator", () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    } as Storage;
  });

  const payload = () => ({
    vehicle,
    quote: { ...senderSpec(), salary: undefined },
    leaseName: "Example EV",
  });

  it("round-trips what the page put in it", () => {
    stashSharedQuote(payload());
    const back = takeSharedQuote();
    expect(back?.leaseName).toBe("Example EV");
    expect(back?.quote.lines.finance).toBe(965.76);
    expect(back?.vehicle.price).toBe(57_196);
  });

  it("is consumed once", () => {
    stashSharedQuote(payload());
    expect(takeSharedQuote()).not.toBeNull();
    expect(takeSharedQuote()).toBeNull();
  });

  it("says nothing when there is nothing", () => {
    expect(takeSharedQuote()).toBeNull();
  });

  /** Half a lease is worse than none: without a term there is nothing to
   *  amortise, and the reader would land on a workspace that cannot answer. */
  it("refuses a payload that could not build a lease", () => {
    for (const bad of [
      { vehicle, leaseName: "x" },
      { quote: senderSpec(), leaseName: "x" },
      { vehicle, quote: { ...senderSpec(), termMonths: 0 }, leaseName: "x" },
      { vehicle, quote: { ...senderSpec(), termMonths: undefined }, leaseName: "x" },
    ]) {
      sessionStorage.setItem("leasewiz-shared-quote", JSON.stringify(bad));
      expect(takeSharedQuote()).toBeNull();
    }
  });

  it("survives a corrupt payload without throwing", () => {
    sessionStorage.setItem("leasewiz-shared-quote", "{not json");
    expect(takeSharedQuote()).toBeNull();
  });

  /** It is browser state the app wrote, so "Start fresh" has to reach it. */
  it("uses a key the data reset will claim", async () => {
    const { isAppStorageKey } = await import("@/lib/localData");
    expect(isAppStorageKey("leasewiz-shared-quote")).toBe(true);
  });
});

/**
 * The figures keep their denomination when a copy is taken.
 *
 * Reported from use: a shared lease quoted weekly opened as fortnightly in
 * the reader's own workspace, so the first thing they saw was the cost they
 * had just been shown, changed, for no reason visible on the page. The pay
 * period is a fact about the sender — which is why it was left out — but it
 * is not a financial one, and continuity is worth more than the principle
 * was.
 */
describe("A copy is quoted in the same period as the original", () => {
  const sharedLease = (payCycle: "weekly" | "fortnightly" | "monthly"): Lease => ({
    ...newLease("Theirs"),
    vehicle,
    scenario: { ...newLease().scenario, salary: 185_000, payCycle },
    quotes: [senderSpec()],
  });

  it("carries the pay period across a whole-lease copy", () => {
    for (const cycle of ["weekly", "fortnightly", "monthly"] as const) {
      expect(leaseFromSharedLease(sharedLease(cycle), config).scenario.payCycle).toBe(cycle);
    }
  });

  /** A single quote has no pay cycle of its own, but it has a frequency —
   *  and that is the period the reader was just looking at. */
  it("takes the period from the quote when only a quote is copied", () => {
    for (const freq of ["weekly", "fortnightly", "monthly"] as const) {
      const copy = leaseFromSharedQuote(vehicle, senderSpec({ frequency: freq }), config, "x");
      expect(copy.scenario.payCycle).toBe(freq);
    }
  });

  /** The things that change the answer rather than the units still stay
   *  behind — loosening one exclusion must not loosen the rest. */
  it("still leaves the sender's own circumstances out of it", () => {
    const theirs: Lease = {
      ...sharedLease("weekly"),
      scenario: {
        ...sharedLease("weekly").scenario,
        hasHelpDebt: true,
        employerSavingSharePct: 50,
        capUsedSpendable: 9_000,
        employerFbtStatus: "hospital",
      },
    };
    const copy = leaseFromSharedLease(theirs, config);
    expect(copy.scenario.salary).not.toBe(185_000);
    expect(copy.scenario.hasHelpDebt).toBeFalsy();
    expect(copy.scenario.employerSavingSharePct).toBeUndefined();
    expect(copy.scenario.capUsedSpendable).toBeUndefined();
    expect(copy.scenario.employerFbtStatus).toBeUndefined();
  });
});

/**
 * The reader's own salary, asked for at the moment it is promised.
 *
 * A lease shared at $150,000 opened at our $110,000 default, so the cost
 * moved from $120 a week to $133 with nothing on the page explaining it —
 * a third figure, neither the sender's nor the reader's, shown as
 * confidently as the one they had just read. The button says "on my salary";
 * it now has one to use.
 */
describe("Taking a copy on your own salary", () => {
  const theirs = (): Lease => ({
    ...newLease("Theirs"),
    vehicle,
    scenario: { ...newLease().scenario, salary: 150_000, payCycle: "weekly" },
    quotes: [senderSpec()],
  });

  it("uses the salary the reader gave", () => {
    expect(leaseFromSharedLease(theirs(), config, undefined, 92_000).scenario.salary).toBe(92_000);
  });

  it("never inherits the sender's, with or without one given", () => {
    expect(leaseFromSharedLease(theirs(), config, undefined, 92_000).scenario.salary).not.toBe(150_000);
    expect(leaseFromSharedLease(theirs(), config).scenario.salary).not.toBe(150_000);
  });

  /** A blank box is not a salary of zero — it means "use the default", and a
   *  lease priced on nothing would be nonsense rather than a starting point. */
  it("falls back to the default rather than to nothing", () => {
    for (const bad of [undefined, 0, -5, Number.NaN]) {
      const copy = leaseFromSharedLease(theirs(), config, undefined, bad as number | undefined);
      expect(copy.scenario.salary).toBe(newLease().scenario.salary);
    }
  });

  it("still keeps the pay period, so only the salary moves", () => {
    const copy = leaseFromSharedLease(theirs(), config, undefined, 92_000);
    expect(copy.scenario.payCycle).toBe("weekly");
  });
});

/**
 * Whose rate is it, on a copy?
 *
 * The cost card names where its interest rate came from, and had three
 * answers: a quote, our default, or "the rate you entered". A copied lease
 * fitted none of them — the rate arrived from somebody else's scenario, and
 * telling the reader they entered it is the same sin as calling our default a
 * fact, only smaller.
 */
describe("A rate that came in with somebody else's lease", () => {
  const theirs = (over: Partial<Lease["scenario"]> = {}): Lease => ({
    ...newLease("Theirs"),
    vehicle,
    scenario: { ...newLease().scenario, salary: 150_000, interestRatePct: 13.2, ...over },
    quotes: [senderSpec()],
  });

  it("is marked as inherited when no quote explains it", () => {
    expect(leaseFromSharedLease(theirs(), config).scenario.rateInherited).toBe(true);
  });

  /** A quote names itself, so the weaker claim is not needed. */
  it("is not marked where the copy is modelling a quote", () => {
    const withQuote = theirs({ fromQuoteId: senderSpec().id });
    expect(leaseFromSharedLease(withQuote, config).scenario.rateInherited).toBeUndefined();
  });

  it("is dropped once the reader models a quote themselves", () => {
    const copy = leaseFromSharedLease(theirs(), config);
    expect(copy.scenario.rateInherited).toBe(true);
    const after = applyScenarioFromQuote(copy, leaseToInputs(copy), copy.quotes[0].id);
    expect(after.scenario.rateInherited).toBeUndefined();
  });

  /** An ordinary lease nobody shared must not claim to be inherited. */
  it("says nothing about a lease built the normal way", () => {
    expect(newLease().scenario.rateInherited).toBeUndefined();
  });
});
