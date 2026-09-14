import type { ReactNode } from "react";

/**
 * A card heading with a small marker above the name of the thing.
 *
 * The page already ran car, then you, then the lease, then the answer — the
 * order was there, it just wasn't said. Somebody arriving on a long calculator
 * cannot tell whether to work down it or pick the part that looks relevant,
 * and the cost of guessing wrong is a confident figure built on a car nobody
 * chose. Numbering is the cheapest way to say "there are three of these and
 * you are on the first".
 *
 * The marker is an eyebrow rather than part of the sentence. "Step 2" and
 * "You and your employer" answer different questions — where am I, and what is
 * this — and setting them apart lets the eye take the first without reading
 * the second. Both stay inside one heading element, so a screen reader
 * announces them together and the document outline does not gain a run of
 * headings that only say "Step".
 *
 * The result card takes a word rather than a number. It is not a fourth thing
 * to fill in — it is what the first three produce — and numbering it would
 * invite people to go looking for the input that isn't there.
 *
 * Absent once a quote is locked in, and in the decoder. At that point the page
 * is a record rather than a form, and steps you cannot take are noise.
 */
export default function CardHeading({
  step,
  eyebrow,
  children,
}: {
  children: ReactNode;
} & (
  | { step: number; eyebrow?: never }
  | { eyebrow: string; step?: never }
)) {
  return (
    // Inline rather than flex, and the space between the two parts is a real
    // space. A flex gap is drawn, not written: they ran together as
    // "Step 1The vehicle" for anything reading the text rather than looking at
    // it — a screen reader, a copied selection, a search engine.
    <h2 className="text-base font-semibold text-ink">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-accent">
        {eyebrow ?? `Step ${step}`}
      </span>{" "}
      {children}
    </h2>
  );
}
