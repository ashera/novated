import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { decodeQuote, type Quote } from "@/lib/au/quote";
import { quoteFieldChecks } from "@/lib/au/quoteChecks";
import { allTerms } from "@/lib/au/glossary";
import { annuityPayment } from "@/lib/au/novated";

const config = DEFAULT_CONFIG;

/**
 * "Rental" is the industry's word, not ours.
 *
 * A novated lease payment genuinely is a rental in the contract, and every
 * provider prints it that way — so the glossary defines it and the sentence
 * the decoder writes for you to send a provider uses it, because that is the
 * word on their paperwork.
 *
 * In our own voice it is a payment. The field is labelled "Finance payment"
 * with "Lease Rental" listed beside it as one of the other names, so prose
 * calling it "the rental" contradicts the form it sits next to — and to a
 * reader who has not met the term, "rental" means hiring a car for a week,
 * which is the one thing a novated lease is not.
 */

const financed = 50_000;
const months = 60;
const residualExGst = financed * (config.lease.residualMinPct["5"] / 100);
const at = (rate: number) => annuityPayment(financed, residualExGst, rate, months);

const quote = (over: Partial<Quote> = {}): Quote => ({
  frequency: "monthly",
  fuelType: "electric",
  termMonths: months,
  vehiclePrice: 55_000,
  amountFinanced: financed,
  residualIncGst: residualExGst * 1.1,
  lines: { finance: at(7.5), managementFee: 35 },
  salary: 110_000,
  ...over,
});

/** Everything the engine writes for a reader, across a spread of quotes. */
function generatedCopy(): string[] {
  const variants: Partial<Quote>[] = [
    {},
    { statedRatePct: 7.5 },
    { statedRatePct: 6, lines: { finance: at(9.5) } },
    { statedRatePct: 11, lines: { finance: at(7.5) } },
    { lines: { finance: 200 } },
    { lines: { finance: at(30) } },
    { residualIncGst: 2_000 },
    { amountFinanced: 90_000 },
    { lines: { managementFee: 750 } },
    { vehiclePrice: 120_000 },
  ];

  const out: string[] = [];
  for (const v of variants) {
    const q = quote(v);
    for (const f of decodeQuote(q, config).findings) {
      out.push(f.title, f.detail, f.question ?? "");
    }
    for (const c of Object.values(quoteFieldChecks(q, config))) out.push(c.message);
  }
  return out.filter(Boolean);
}

describe("The word we use for what leaves your pay", () => {
  it("writes enough copy for this to mean something", () => {
    // A guard that silently checks nothing passes forever.
    expect(generatedCopy().length).toBeGreaterThan(20);
  });

  it("says payment, not rental, in everything the engine writes", () => {
    const offenders = generatedCopy().filter((s) => /\brentals?\b/i.test(s));
    expect(
      offenders,
      `The field is labelled "Finance payment" — copy that calls it a rental contradicts it: ${offenders.join(" | ")}`,
    ).toEqual([]);
  });

  /**
   * The other half of the rule, and the reason this is not a ban.
   *
   * Somebody arrives holding a quote with "Lease Rental" printed on it. If the
   * glossary stopped defining the word, they would have nowhere to look it up
   * — which is the failure the glossary exists to prevent.
   */
  it("still defines the word a provider will print", () => {
    const terms = allTerms(config);
    const entry = terms.find((t) => t.term === "Finance rental");
    expect(entry, "the glossary must still define the word providers use").toBeTruthy();
    expect(entry!.alsoCalled).toContain("Lease rental");
    // And it points at our word, so the two are connected.
    expect(entry!.alsoCalled).toContain("Lease payment");
  });
});
