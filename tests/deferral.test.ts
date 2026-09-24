import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { annuityPayment } from "@/lib/au/novated";
import { decodeQuote, type Quote } from "@/lib/au/quote";
import { applyQuoteEdit, leaseToQuote, newLease, newQuoteSpec, type Lease } from "@/lib/au/lease";

const config = DEFAULT_CONFIG;

const financed = 59_527;
const months = 60;
const residualExGst = 16_745;
const residualIncGst = residualExGst * 1.1;
const at = (rate: number, n = months, principal = financed) =>
  annuityPayment(principal, residualExGst, rate, n);

/** What a financier actually does: accrue through the deferral, then repay. */
const withDeferral = (rate: number, defer: number, extendsTerm: boolean) =>
  annuityPayment(
    financed * Math.pow(1 + rate / 100 / 12, defer),
    residualExGst,
    rate,
    extendsTerm ? months : months - defer,
  );

const quote = (over: Partial<Quote> = {}): Quote => ({
  frequency: "monthly",
  fuelType: "electric",
  termMonths: months,
  vehiclePrice: 65_000,
  amountFinanced: financed,
  residualIncGst,
  lines: { finance: at(9.5) },
  salary: 110_000,
  statedRatePct: 9.5,
  ...over,
});

/**
 * "The payment is higher because of the two-month deferral."
 *
 * The commonest verbal explanation for a payment above a stated rate, and the
 * only one that costs a provider nothing to say. It is usually true — their
 * money is out from the day they pay the dealer — and it is BOUNDED, which is
 * what makes it worth testing rather than accepting.
 *
 * The bound depends on a question nobody volunteers: does the lease still end
 * when it was going to? Holding the end date, the deferred months come out of
 * the payment count and everything is repaid by fewer, larger payments.
 * Moving it, the payment rises by little more than the interest that accrued.
 */
describe("A deferral before the first payment", () => {
  it("opens the reconciliation on its own, with no fee named", () => {
    const d = decodeQuote(
      quote({ lines: { finance: withDeferral(9.5, 2, false) }, deferredMonths: 2 }),
      config,
    );
    expect(d.reconciliation).not.toBeNull();
    expect(d.reconciliation!.reconciles).toBe(true);
  });

  it("stays silent when nobody has claimed one", () => {
    expect(decodeQuote(quote(), config).reconciliation).toBeNull();
  });

  /**
   * The whole point. A payment that a deferral explains solves to a rate well
   * above the stated one, and that is not evidence of anything — it is what a
   * deferral does.
   */
  it("explains a payment that solves above the stated rate", () => {
    const q = quote({ lines: { finance: withDeferral(9.5, 2, false) }, deferredMonths: 2 });
    const d = decodeQuote(q, config);
    // The all-in figure really is higher: that is the honest headline.
    expect(d.impliedRatePct!).toBeGreaterThan(10.5);
    // And the money itself is at the rate they stated.
    expect(d.ratePaidOnBorrowingPct!).toBeCloseTo(9.5, 1);
    expect(d.findings.map((f) => f.key)).toContain("explanation-reconciles");
  });

  it("does the same where the schedule shifts instead", () => {
    const q = quote({
      lines: { finance: withDeferral(9.5, 2, true) },
      deferredMonths: 2,
      deferralExtendsTerm: true,
    });
    const d = decodeQuote(q, config);
    expect(d.reconciliation!.reconciles).toBe(true);
    expect(d.ratePaidOnBorrowingPct!).toBeCloseTo(9.5, 1);
  });

  /**
   * The two structures are worth very different amounts, and a page that
   * treated them as one would let the dearer arrangement hide behind the
   * cheaper one's arithmetic.
   */
  it("costs materially more when the end date holds", () => {
    const hold = withDeferral(9.5, 2, false);
    const shift = withDeferral(9.5, 2, true);
    const bare = at(9.5);
    expect(hold).toBeGreaterThan(shift);
    // Roughly +4% against +2% on these figures — an order apart, not a nuance.
    expect((hold / bare - 1) * 100).toBeGreaterThan(3.5);
    expect((shift / bare - 1) * 100).toBeLessThan(2.5);
  });

  it("prices what the deferral alone accounts for", () => {
    const q = quote({ lines: { finance: withDeferral(9.5, 2, false) }, deferredMonths: 2 });
    const r = decodeQuote(q, config).reconciliation!;
    expect(r.deferralOverTerm).toBeGreaterThan(0);
    // With no fees named it is the whole of the explanation.
    expect(r.deferralOverTerm).toBeCloseTo(r.feesOverTerm, 6);
  });

  it("reports nothing for a deferral where there is none", () => {
    const q = quote({ lines: { finance: at(9.5) }, explainedFeesFinanced: 900 });
    expect(decodeQuote(q, config).reconciliation!.deferralOverTerm).toBe(0);
  });

  /** A deferral longer than the lease is not a lease. */
  it("cannot swallow the whole term", () => {
    const q = quote({ lines: { finance: at(9.5) }, deferredMonths: 600 });
    const d = decodeQuote(q, config);
    expect(Number.isFinite(d.reconciliation!.expectedMonthly)).toBe(true);
    expect(d.reconciliation!.expectedMonthly).toBeGreaterThan(0);
  });
});

/**
 * The claim has to be testable in both directions, or it is just a nicer way
 * of agreeing with the provider.
 */
describe("When the deferral does not cover the gap", () => {
  it("says how much is left over and asks about the end date", () => {
    // Charged as though at 13%, blamed on a two-month deferral.
    const q = quote({ lines: { finance: at(13) }, deferredMonths: 2 });
    const d = decodeQuote(q, config);
    const f = d.findings.find((x) => x.key === "explanation-falls-short")!;
    expect(f.severity).toBe("warn");
    expect(d.reconciliation!.unexplainedOverTerm).toBeGreaterThan(0);
    expect(f.question).toMatch(/end on its original date|run 2 months longer/i);
    expect(f.question).toMatch(/covers/i);
  });

  it("catches a deferral used to explain more than it can", () => {
    // The shift structure is the cheap one; a payment priced as though the end
    // date held cannot be explained by it.
    const q = quote({
      lines: { finance: withDeferral(9.5, 2, false) },
      deferredMonths: 2,
      deferralExtendsTerm: true,
    });
    expect(decodeQuote(q, config).findings.map((f) => f.key)).toContain(
      "explanation-falls-short",
    );
  });

  it("names the structure it assumed, so a mismatch is visible", () => {
    const hold = decodeQuote(
      quote({ lines: { finance: withDeferral(9.5, 2, false) }, deferredMonths: 2 }),
      config,
    ).findings.find((f) => f.key === "explanation-reconciles")!;
    expect(hold.detail).toMatch(/still ending on its original date/);

    const shift = decodeQuote(
      quote({
        lines: { finance: withDeferral(9.5, 2, true) },
        deferredMonths: 2,
        deferralExtendsTerm: true,
      }),
      config,
    ).findings.find((f) => f.key === "explanation-reconciles")!;
    expect(shift.detail).toMatch(/running 2 months longer/);
  });

  // Not an accusation: a deferral is a real thing and usually honestly meant.
  it("does not call anybody dishonest about it", () => {
    const said = decodeQuote(quote({ lines: { finance: at(13) }, deferredMonths: 2 }), config)
      .findings.flatMap((f) => [f.title, f.detail, f.question ?? ""])
      .join(" ");
    expect(said).not.toMatch(/\blie|lying|dishonest|misleading|scam\b/i);
  });
});

describe("It survives being stored", () => {
  it("round-trips through the lease", () => {
    const spec = newQuoteSpec("Provider A", months);
    let lease: Lease = { ...newLease(), quotes: [spec] };
    lease = applyQuoteEdit(lease, spec.id, {
      ...quote({ deferredMonths: 2, deferralExtendsTerm: true }),
    });
    expect(lease.quotes[0].deferredMonths).toBe(2);
    expect(lease.quotes[0].deferralExtendsTerm).toBe(true);
    const back = leaseToQuote(lease, lease.quotes[0]);
    expect(back.deferredMonths).toBe(2);
    expect(back.deferralExtendsTerm).toBe(true);
  });
});

/**
 * A deferral on its own, with no rate stated to reconcile against.
 *
 * The reconciliation needs a rate the provider claimed, and real quotes
 * disclose the deferral and not the rate — "Months deferred: 2" printed
 * beside the term, nothing about interest anywhere. Tying the two together
 * meant the commonest case did nothing at all: somebody typed the 2 off their
 * document and no figure on the page moved.
 */
describe("What a disclosed deferral does to the solved rate", () => {
  /** The real quote it was checked against: $965.76 a month, 60 months, two
   *  deferred, no rate anywhere on the document. */
  const real = (over: Partial<Quote> = {}): Quote => ({
    frequency: "monthly",
    fuelType: "electric",
    termMonths: 60,
    vehiclePrice: 57_196,
    amountFinanced: 54_000.36,
    residualIncGst: 16_709.33,
    lines: { finance: 965.76 },
    salary: 110_000,
    ...over,
  });

  it("says nothing when no deferral is disclosed", () => {
    const d = decodeQuote(real(), config);
    expect(d.rateAfterDeferralPct).toBeNull();
    expect(d.findings.some((f) => f.key === "deferral-explains-part-of-the-rate")).toBe(false);
  });

  it("works with no stated rate at all, which is the case that matters", () => {
    const d = decodeQuote(real({ deferredMonths: 2 }), config);
    expect(d.statedRatePct).toBeNull();
    expect(d.reconciliation).toBeNull();
    // And still says something useful.
    expect(d.rateAfterDeferralPct).toBeCloseTo(9.2, 1);
  });

  /** The two structures are worth very different amounts, and which one it is
   *  is the question the finding sends back. */
  it("prices both structures", () => {
    expect(decodeQuote(real({ deferredMonths: 2 }), config).rateAfterDeferralPct).toBeCloseTo(9.2, 1);
    expect(
      decodeQuote(real({ deferredMonths: 2, deferralExtendsTerm: true }), config)
        .rateAfterDeferralPct,
    ).toBeCloseTo(9.86, 1);
  });

  it("leaves the all-in rate alone — it is what the payment costs", () => {
    for (const over of [{}, { deferredMonths: 2 }, { deferredMonths: 2, deferralExtendsTerm: true }]) {
      expect(decodeQuote(real(over), config).impliedRatePct).toBeCloseTo(10.46, 1);
    }
  });

  it("names both rates and says what each one is", () => {
    const f = decodeQuote(real({ deferredMonths: 2 }), config).findings.find(
      (x) => x.key === "deferral-explains-part-of-the-rate",
    )!;
    expect(f.detail).toMatch(/what the payment costs you/);
    expect(f.detail).toMatch(/what the financier is charging/);
    expect(f.question).toMatch(/end on its original date/);
  });

  // Not because anyone lied — because it changes what the rate above it means,
  // and a reader who skims past it draws the wrong conclusion from the page.
  it("is flagged red rather than filed as fine", () => {
    const f = decodeQuote(real({ deferredMonths: 2 }), config).findings.find(
      (x) => x.key === "deferral-explains-part-of-the-rate",
    )!;
    expect(f.severity).toBe("critical");
  });

  it("sits directly under the rate finding, never above it", () => {
    // Both structures, and a cheap rate as well as a dear one: the deferral
    // finding is red and the rate finding may be "ok", so anything sorting on
    // severity alone puts them the wrong way round.
    for (const over of [
      { deferredMonths: 2 },
      { deferredMonths: 2, deferralExtendsTerm: true },
      // A keen rate, so the rate finding itself is only "ok". This is the case
      // that breaks a plain severity sort: the red follower would jump the
      // green finding it is a sentence about.
      { deferredMonths: 2, lines: { finance: annuityPayment(54_000.36, 16_709.33 / 1.1, 5, 60) } },
    ]) {
      const keys = decodeQuote(real(over), config).findings.map((f) => f.key);
      const rate = keys.indexOf("implied-rate");
      const deferral = keys.indexOf("deferral-explains-part-of-the-rate");
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(deferral).toBe(rate + 1);
    }
  });

  it("says in the copy what the gap costs", () => {
    // The red treatment is only earned if the reader is told a number, and this
    // is the case that matters: no stated rate anywhere on the document.
    const d = decodeQuote(real({ deferredMonths: 2 }), config);
    expect(d.reconciliation).toBeNull();
    expect(d.deferralInterestAccrued!).toBeGreaterThan(0);
    const money = d.deferralInterestAccrued!.toLocaleString("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    });
    const f = d.findings.find((x) => x.key === "deferral-explains-part-of-the-rate")!;
    expect(f.detail).toContain(money);
  });

  it("prices the gap as interest on the money, not as a bigger payment", () => {
    // Two months of interest on the balance at the money rate. A payment
    // difference would be the wrong measure — deferring and repaying at one
    // rate is neutral by construction, so it would price a real cost at zero.
    const d = decodeQuote(real({ deferredMonths: 2 }), config);
    const expected =
      d.amountFinanced! * (Math.pow(1 + d.rateAfterDeferralPct! / 100 / 12, 2) - 1);
    expect(d.deferralInterestAccrued!).toBeCloseTo(expected, 6);
    // Sane magnitude: two months at a single-digit rate on $54k.
    expect(d.deferralInterestAccrued!).toBeGreaterThan(500);
    expect(d.deferralInterestAccrued!).toBeLessThan(1_200);
  });

  it("is quiet about the accrual when no deferral is disclosed", () => {
    expect(decodeQuote(real(), config).deferralInterestAccrued).toBeNull();
  });

  /*
   * The decoder totals costOverTerm and calls it avoidable cost. The rate
   * finding is priced on the all-in rate, which this accrual is what inflates —
   * so pricing it here would count the same money twice, and call a disclosed
   * feature avoidable while doing it.
   */
  it("is not added to the avoidable-cost total", () => {
    const f = decodeQuote(real({ deferredMonths: 2 }), config).findings.find(
      (x) => x.key === "deferral-explains-part-of-the-rate",
    )!;
    expect(f.costOverTerm).toBeUndefined();
  });

  // The pair rises together: attaching the red follower must not drag the rate
  // finding down the page.
  it("does not let the anchor sink below the findings it outranks", () => {
    const keys = decodeQuote(real({ deferredMonths: 2 }), config).findings.map((f) => f.key);
    expect(keys.indexOf("implied-rate")).toBe(0);
  });

  it("lifts a merely-ok rate finding to the top when its follower is red", () => {
    // The pair sorts on the stronger of the two, so the deferral cannot end up
    // stranded below findings it outranks just because its anchor is fine.
    const d = decodeQuote(
      real({ deferredMonths: 2, lines: { finance: annuityPayment(54_000.36, 16_709.33 / 1.1, 5, 60) } }),
      config,
    );
    expect(d.findings[0].key).toBe("implied-rate");
    expect(d.findings[0].severity).toBe("ok");
    expect(d.findings[1].key).toBe("deferral-explains-part-of-the-rate");
    expect(d.findings[1].severity).toBe("critical");
  });

  // `follows` marks an explanation, not a fault. A red follower alone must not
  // make the page announce avoidable cost on an otherwise clean quote.
  it("keeps the follower out of the count of independent problems", () => {
    const d = decodeQuote(real({ deferredMonths: 2 }), config);
    const deferral = d.findings.find((f) => f.key === "deferral-explains-part-of-the-rate")!;
    expect(deferral.follows).toBe("implied-rate");
    expect(d.findings.filter((f) => f.severity === "critical" && !f.follows)).not.toContain(
      deferral,
    );
  });

  // A deferral that explains nothing is not worth a finding.
  it("stays quiet where it makes no difference", () => {
    const d = decodeQuote(real({ deferredMonths: 0 }), config);
    expect(d.findings.some((f) => f.key === "deferral-explains-part-of-the-rate")).toBe(false);
  });
});
