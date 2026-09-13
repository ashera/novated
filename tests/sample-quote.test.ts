import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/au/config";
import { CYCLES_PER_YEAR, decodeQuote } from "@/lib/au/quote";
import { annuityPayment } from "@/lib/au/novated";
import {
  SAMPLE_GAP,
  SAMPLE_ITEM_TOTAL,
  SAMPLE_MARKERS,
  SAMPLE_QUOTE,
  SAMPLE_SECTIONS,
} from "@/lib/au/sampleQuote";

const config = DEFAULT_CONFIG;

/**
 * The sample quote is a teaching document, and it only teaches if it is true.
 *
 * Everything it points at has to be something the decoder actually finds in
 * it — otherwise the page that shows a marked-up quote and the page that
 * analyses one are describing different documents, and the first is just a
 * drawing.
 */
describe("The sample quote", () => {
  const decoded = decodeQuote(SAMPLE_QUOTE, config);

  it("decodes, so the example the decoder opens on actually works", () => {
    expect(decoded.impliedRatePct).not.toBeNull();
    expect(decoded.impliedRatePct!).toBeGreaterThan(0);
  });

  // Marker 8 says the total does not add up. If somebody tidied the figures
  // the marker would be pointing at nothing.
  it("really doesn't add up, which is the whole point of marker 8", () => {
    expect(SAMPLE_GAP).toBeGreaterThan(0);
    expect(SAMPLE_ITEM_TOTAL).toBeLessThan(SAMPLE_QUOTE.statedPreTax!);
    expect(decoded.findings.some((f) => f.key === "reconciliation")).toBe(true);
  });

  it("names the gap in marker 8 with the figures the document prints", () => {
    const eight = SAMPLE_MARKERS.find((m) => m.marker === 8)!;
    const money = (n: number) =>
      n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(eight.body).toContain(money(SAMPLE_ITEM_TOTAL));
    expect(eight.body).toContain(money(SAMPLE_QUOTE.statedPreTax!));
    expect(eight.body).toContain(money(SAMPLE_GAP));
  });

  // The document's own lines are built from the quote object, so a figure can
  // never be edited in one place and left stale in the other.
  it("prints the same figures the decoder is given", () => {
    const printed = SAMPLE_SECTIONS.flatMap((s) => s.lines).map((l) => l.value);
    for (const n of [
      SAMPLE_QUOTE.vehiclePrice!,
      SAMPLE_QUOTE.amountFinanced!,
      SAMPLE_QUOTE.residualIncGst!,
      SAMPLE_QUOTE.lines.finance!,
      SAMPLE_QUOTE.statedPreTax!,
    ]) {
      const want = `$${n.toLocaleString("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      expect(printed, `${want} is not on the document`).toContain(want);
    }
  });

  it("gives every marker on the document a note, and every note a marker", () => {
    const onPage = SAMPLE_SECTIONS.flatMap((s) => [
      ...(s.markerOnHeading != null ? [s.markerOnHeading] : []),
      ...s.lines.flatMap((l) => (l.marker != null ? [l.marker] : [])),
    ]).sort((a, b) => a - b);
    const explained = SAMPLE_MARKERS.map((m) => m.marker).sort((a, b) => a - b);
    expect(onPage).toEqual(explained);
    expect(new Set(onPage).size).toBe(onPage.length);
  });

  // Half the value of the document is that a provider's words are not ours.
  it("labels lines the way a provider would, not the way our form does", () => {
    const mapped = SAMPLE_SECTIONS.flatMap((s) => s.lines).filter((l) => l.field);
    expect(mapped.length).toBeGreaterThan(6);
    // Not all of them: a provider prints "Tyres" and so do we, and pretending
    // otherwise would make the document less realistic, not more.
    const renamed = mapped.filter((l) => l.label !== l.field);
    expect(renamed.length).toBeGreaterThan(mapped.length * 0.7);
    // The two that matter most, because they are the ones people cannot find.
    const byField = (f: string) => mapped.find((l) => l.field === f)!;
    expect(byField("Amount financed").label).toBe("Vehicle Amount Financed");
    expect(byField("Finance payment").label).toBe("Lease Rental");
  });

  it("shows the findings worth showing — a rate, padding and the gap", () => {
    const keys = decoded.findings.map((f) => f.key);
    expect(keys).toContain("reconciliation");
    expect(keys.some((k) => k.includes("rate") || k === "interest")).toBe(true);
  });
});

/**
 * The working shown beside the rate has to be the sum that produced it.
 *
 * It exists to be read out to a provider, so "your calculator is wrong" has
 * to be answerable with arithmetic the provider can check on their own
 * figures. A breakdown that merely agreed with the headline most of the time
 * would be worse than none: it would be wrong in the one conversation it was
 * built for.
 */
describe("The working behind the rate", () => {
  const decoded = decodeQuote(SAMPLE_QUOTE, config);

  it("reconciles: repaid, plus the residual, less the amount borrowed", () => {
    const perYear = CYCLES_PER_YEAR[SAMPLE_QUOTE.frequency];
    const payments = Math.round((perYear * SAMPLE_QUOTE.termMonths) / 12);
    const repaid = SAMPLE_QUOTE.lines.finance! * payments;
    const shown = repaid + decoded.residualExGst! - decoded.amountFinanced!;
    // The same quantity the engine reports, arrived at the way the card
    // explains it rather than the way the engine happens to compute it.
    expect(shown).toBeCloseTo(decoded.totalInterest!, 0);
  });

  it("strips the GST off the residual, because the finance is written without it", () => {
    expect(decoded.residualExGst!).toBeCloseTo(SAMPLE_QUOTE.residualIncGst! / 1.1, 6);
    expect(decoded.residualExGst!).toBeLessThan(SAMPLE_QUOTE.residualIncGst!);
  });

  // The claim the card makes in bold: only one rate fits. If a rate a point
  // either side produced the same payment the sentence would be a lie.
  it("is the only rate that produces this payment", () => {
    const monthly = decoded.monthlyFinancePayment!;
    const at = (r: number) =>
      annuityPayment(decoded.amountFinanced!, decoded.residualExGst!, r, SAMPLE_QUOTE.termMonths);
    expect(at(decoded.impliedRatePct!)).toBeCloseTo(monthly, 2);
    expect(at(decoded.impliedRatePct! + 1)).toBeGreaterThan(monthly + 10);
    expect(at(decoded.impliedRatePct! - 1)).toBeLessThan(monthly - 10);
  });
});
