import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote, type Quote } from "@/lib/au/quote";
import { quoteFieldChecks } from "@/lib/au/quoteChecks";
import { annuityPayment } from "@/lib/au/novated";
import { applyQuoteEdit, leaseToQuote, newLease, newQuoteSpec, type Lease } from "@/lib/au/lease";

const config = DEFAULT_CONFIG;

const financed = 50_000;
const months = 60;
const residualExGst = financed * (config.lease.residualMinPct["5"] / 100);
const residualIncGst = residualExGst * 1.1;
const at = (rate: number) => annuityPayment(financed, residualExGst, rate, months);

const quote = (over: Partial<Quote> = {}): Quote => ({
  frequency: "monthly",
  fuelType: "electric",
  termMonths: months,
  vehiclePrice: 55_000,
  amountFinanced: financed,
  residualIncGst,
  lines: { finance: at(7.5) },
  salary: 110_000,
  ...over,
});

/**
 * The claim on the quote, against what its own payment does.
 *
 * Most quotes print no rate, which is why this site solves one. Where a quote
 * does state one it is the most checkable thing on the document — and the gap
 * is nearly always something real inside the rental rather than a lie, so the
 * finding has to price it and name the usual causes rather than accuse.
 */
describe("A rate the quote states", () => {
  it("says so plainly when the stated rate is the real one", () => {
    const d = decodeQuote(quote({ statedRatePct: 7.5 }), config);
    const f = d.findings.find((x) => x.key === "stated-rate-checks-out");
    expect(f?.severity).toBe("ok");
    expect(Math.abs(d.statedRateGap ?? 1e9)).toBeLessThan(months); // under $1 a month
  });

  it("prices the gap in money when the payment costs more than the stated rate", () => {
    // Quoted at 6%, charged at 9.5% — the shape of a fee inside the rental.
    const d = decodeQuote(quote({ statedRatePct: 6, lines: { finance: at(9.5) } }), config);
    const f = d.findings.find((x) => x.key === "stated-rate-understates");
    expect(f?.severity).toBe("warn");
    expect(d.statedRateGap!).toBeGreaterThan(0);
    expect(f?.costOverTerm).toBeCloseTo(d.statedRateGap!, 6);
    // Priced, not just described.
    expect(f?.detail).toMatch(/\$[\d,]+ more over the term/);
    expect(f?.question).toMatch(/isn't in the rate/);
  });

  // The gap is usually legitimate, so the wording must not call it dishonest.
  it("explains the gap rather than accusing anyone of it", () => {
    const d = decodeQuote(quote({ statedRatePct: 6, lines: { finance: at(9.5) } }), config);
    const f = d.findings.find((x) => x.key === "stated-rate-understates")!;
    expect(f.detail).toMatch(/establishment|broker|insurance/i);
    expect(`${f.title} ${f.detail}`).not.toMatch(/\blie|lying|dishonest|misleading\b/i);
  });

  it("treats a payment below the stated rate as worth checking, not celebrating", () => {
    const d = decodeQuote(quote({ statedRatePct: 11, lines: { finance: at(7.5) } }), config);
    const f = d.findings.find((x) => x.key === "stated-rate-overstates");
    expect(f?.severity).toBe("ok");
    expect(d.statedRateGap!).toBeLessThan(0);
    expect(f?.detail).toMatch(/confirming the residual and the term/);
  });

  it("stays silent when the quote states nothing", () => {
    const d = decodeQuote(quote(), config);
    expect(d.statedRatePct).toBeNull();
    expect(d.paymentAtStatedRate).toBeNull();
    expect(d.statedRateGap).toBeNull();
    expect(d.findings.some((f) => f.key.startsWith("stated-rate"))).toBe(false);
  });

  it("needs the figures the rate would apply to before it says anything", () => {
    const d = decodeQuote(
      { ...quote({ statedRatePct: 7.5 }), residualIncGst: undefined },
      config,
    );
    expect(d.statedRateGap).toBeNull();
    expect(d.findings.some((f) => f.key.startsWith("stated-rate"))).toBe(false);
  });
});

/**
 * The reason it is worth capturing at all.
 *
 * Without a stated rate, a payment that cannot be right leaves four
 * candidates and the decoder can only say so. With one, three knowns pin the
 * fourth, and the disagreement can be pointed at.
 */
describe("Using the stated rate to find the wrong figure", () => {
  it("names the payment the stated rate produces, and the one entered", () => {
    const c = quoteFieldChecks(quote({ statedRatePct: 6, lines: { finance: at(14) } }), config)
      .finance;
    expect(c).toBeTruthy();
    expect(c!.message).toMatch(/At the 6% this quote states/);
    expect(c!.message).toMatch(/you have entered/);
  });

  it("escalates a wild disagreement and merely questions a small one", () => {
    const wild = quoteFieldChecks(quote({ statedRatePct: 6, lines: { finance: at(30) } }), config);
    expect(wild.finance?.level).toBe("error");
    const mild = quoteFieldChecks(quote({ statedRatePct: 6, lines: { finance: at(8) } }), config);
    expect(mild.finance?.level).toBe("warn");
  });

  it("says nothing when the payment is the one that rate produces", () => {
    for (const rate of [4, 7.5, 12]) {
      const c = quoteFieldChecks(quote({ statedRatePct: rate, lines: { finance: at(rate) } }), config);
      expect(c.finance, `${rate}%`).toBeUndefined();
    }
  });

  it("compares at the frequency the quote was entered in", () => {
    const weekly = (at(7.5) * 12) / 52;
    const c = quoteFieldChecks(
      quote({ frequency: "weekly", statedRatePct: 7.5, lines: { finance: weekly } }),
      config,
    );
    expect(c.finance).toBeUndefined();
  });
});

/**
 * A field that does not survive being saved is worse than no field: it types
 * correctly, computes correctly, and is gone when the quote is reopened.
 * QuoteSpec maps its fields one by one, so this has to be asserted.
 */
describe("It survives being stored", () => {
  it("round-trips through the lease", () => {
    const spec = newQuoteSpec("Provider A", months);
    let lease: Lease = { ...newLease(), quotes: [spec] };
    lease = applyQuoteEdit(lease, spec.id, { ...quote({ statedRatePct: 6.95 }) });

    expect(lease.quotes[0].statedRatePct).toBe(6.95);
    expect(leaseToQuote(lease, lease.quotes[0]).statedRatePct).toBe(6.95);
  });

  it("counts a quote with only a rate typed as started", () => {
    const spec = newQuoteSpec("Provider A", months);
    let lease: Lease = { ...newLease(), quotes: [spec] };
    lease = applyQuoteEdit(lease, spec.id, { ...quote({ statedRatePct: 6.95 }), lines: {} });
    expect(lease.quotes[0].statedRatePct).toBe(6.95);
  });
});
