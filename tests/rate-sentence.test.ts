import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote, type Quote } from "@/lib/au/quote";
import { rateSentence } from "@/lib/au/rateSentence";
import { annuityPayment } from "@/lib/au/novated";

const config = DEFAULT_CONFIG;

const financed = 50_000;
const months = 60;
const residualExGst = financed * (config.lease.residualMinPct["5"] / 100);
const residualIncGst = residualExGst * 1.1;
const at = (rate: number, principal = financed) =>
  annuityPayment(principal, residualExGst, rate, months);

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

const say = (q: Quote) => rateSentence(q, decodeQuote(q, config), "month")!;

/**
 * The sentence the user reads back to their provider.
 *
 * It ends in a question, and the page now has somewhere to record the answer.
 * A question that survives its own answer is the same failure as the finding
 * that kept saying "the quote doesn't state a rate" over the top of a rate
 * somebody had just typed — it reads as not having listened, which is exactly
 * what loses the argument this sentence exists to win.
 */
describe("Putting the rate back to the provider", () => {
  it("asks what is in the rental while nobody has said", () => {
    const s = say(quote({ statedRatePct: 6, lines: { finance: at(9.5) } }));
    expect(s).toMatch(/anything other than interest is included/i);
    // The four figures are still the point of it.
    expect(s).toMatch(/finances \$50,000 over 60 months/);
    expect(s).toMatch(/residual of/);
  });

  it("stops asking once they have told you", () => {
    const s = say(
      quote({
        statedRatePct: 6,
        lines: { finance: at(9.5) },
        explainedFeesFinanced: 1_200,
      }),
    );
    expect(s).not.toMatch(/anything other than interest is included/i);
    expect(s).not.toMatch(/Could you confirm the rate on the finance/i);
    // It names back what they said, so they can see it was heard.
    expect(s).toMatch(/\$1,200 added to what I borrow/);
  });

  it("moves on to whether the fees come down when they account for the gap", () => {
    // A fee that exactly explains the payment: the rate is 6%, plus $1,200 borrowed.
    const feeFinanced = 1_200;
    const q = quote({
      statedRatePct: 6,
      lines: { finance: at(6, financed + feeFinanced) },
      explainedFeesFinanced: feeFinanced,
    });
    const d = decodeQuote(q, config);
    expect(d.reconciliation?.reconciles).toBe(true);
    const s = rateSentence(q, d, "month")!;
    expect(s).toMatch(/accounts for the difference/);
    expect(s).toMatch(/negotiable/);
    // And says what the money itself costs, which is the stated rate.
    expect(s).toMatch(/puts the finance itself at 6\.0\d%/);
  });

  it("asks what makes up the rest when the explanation falls short", () => {
    const q = quote({
      statedRatePct: 6,
      lines: { finance: at(9.5) },
      explainedFeesFinanced: 300,
    });
    const d = decodeQuote(q, config);
    expect(d.reconciliation!.unexplainedOverTerm).toBeGreaterThan(0);
    const s = rateSentence(q, d, "month")!;
    expect(s).toMatch(/still leaves about \$[\d,]+ over the term unaccounted for/);
  });

  it("puts it back to them when the explanation costs more than the quote charges", () => {
    const q = quote({
      statedRatePct: 6,
      lines: { finance: at(6) },
      explainedFeesFinanced: 4_000,
    });
    const d = decodeQuote(q, config);
    expect(d.reconciliation!.unexplainedOverTerm).toBeLessThan(0);
    expect(rateSentence(q, d, "month")!).toMatch(/would cost more than the quote actually charges/);
  });

  it("names a per-payment charge in the quote's own period", () => {
    const weekly = (at(9.5) * 12) / 52;
    const q = quote({
      frequency: "weekly",
      statedRatePct: 6,
      lines: { finance: weekly },
      explainedFeesPerPayment: 4.5,
    });
    expect(rateSentence(q, decodeQuote(q, config), "week")!).toMatch(/\$4\.50 a week inside the payment/);
  });

  it("says nothing without the figures a rate rests on", () => {
    const q = quote({ lines: {} });
    expect(rateSentence(q, decodeQuote(q, config), "month")).toBeNull();
  });

  // The sweep, matching the one on the findings: no question the page has an
  // answer to may still be asked.
  it("never asks a question that has already been answered", () => {
    for (const fees of [{ explainedFeesFinanced: 900 }, { explainedFeesPerPayment: 15 }]) {
      const s = say(quote({ statedRatePct: 6, lines: { finance: at(9.5) }, ...fees }));
      expect(s, JSON.stringify(fees)).not.toMatch(/whether anything other than interest/i);
    }
  });
});
