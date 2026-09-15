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
