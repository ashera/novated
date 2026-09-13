import type { ReactNode } from "react";

/**
 * A numbered heading for the three cards you fill in, in order.
 *
 * The page already ran car, then terms, then lease — the order was there, it
 * just wasn't said. Somebody arriving on a long calculator cannot tell whether
 * they are meant to work down it or pick the bit that looks relevant, and the
 * cost of guessing wrong is a confident figure built on a car nobody chose.
 * Numbering is the cheapest way to say "there are three of these and you are
 * on the first".
 *
 * The number is an eyebrow rather than part of the sentence. "Step 2" and
 * "Your salary and lease term" answer different questions — where am I, and
 * what is this — and setting them apart lets the eye take the first without
 * reading the second. They stay inside one heading element so a screen reader
 * announces them together, and so the document outline does not gain three
 * headings that only say "Step".
 *
 * Deliberately absent once a quote is locked in. At that point the page is a
 * record rather than a form, and steps you cannot take are noise.
 */
export default function StepHeading({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) {
  return (
    // Inline rather than flex, and the space between them is a real space.
    // A flex gap is drawn, not written: the two parts ran together as
    // "Step 1The vehicle" for anything reading the text rather than looking
    // at it — a screen reader, a copied selection, a search engine.
    <h2 className="text-base font-semibold text-ink">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-accent">
        Step {step}
      </span>{" "}
      {children}
    </h2>
  );
}
