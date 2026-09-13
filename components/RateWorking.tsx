"use client";

import { useState } from "react";
import { fmtCurrency, fmtCurrencyCents } from "@/lib/au/format";
import { CYCLES_PER_YEAR, type Quote, type QuoteDecode } from "@/lib/au/quote";
import { track } from "@/lib/analytics";

/**
 * Why we say that is the rate.
 *
 * The rate is the one figure a provider never prints, and the one number on
 * this page a user is most likely to be told they have got wrong. "Your
 * calculator says 10.5%" invites "your calculator is wrong"; the four figures
 * off their own quote, and the arithmetic between them, does not.
 *
 * So this is written to be READ OUT. Not a formula and not a derivation — four
 * facts the provider themselves supplied, then the observation that only one
 * rate fits them. Every figure comes from `decode`, which is what the solver
 * actually used, so the working cannot describe a different sum from the one
 * that produced the headline.
 *
 * The rental keeps its cents wherever it appears. It is the one figure here
 * copied straight off their document and read straight back to them, and
 * "$650" against a quote that says $650.19 is all the opening a provider needs
 * to argue about the wrong thing.
 *
 * The honest caveat is at the bottom and is the thing most likely to come back
 * in a reply: the implied rate covers everything baked into the rental, so if
 * brokerage is hidden in there the "rate" is higher than the financier's. That
 * is not an error in the arithmetic — it is the arithmetic telling you
 * something, and the question is phrased to draw it out.
 */
export default function RateWorking({
  quote,
  decode,
  noun,
}: {
  quote: Quote;
  decode: QuoteDecode;
  /** "week", "fortnight" or "month" — the quote's own period. */
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const rate = decode.impliedRatePct;
  const financed = decode.amountFinanced;
  const residualEx = decode.residualExGst;
  const payment = quote.lines.finance;
  if (rate == null || financed == null || residualEx == null || payment == null) return null;

  const perYear = CYCLES_PER_YEAR[quote.frequency];
  const years = quote.termMonths / 12;
  const payments = Math.round(perYear * years);
  const repaid = payment * payments;
  // The same sum the engine did, in the same order, so the total below always
  // matches the headline rather than agreeing with it by luck.
  const interest = repaid + residualEx - financed;

  const sentence =
    `Your quote finances ${fmtCurrency(financed)} over ${quote.termMonths} months, ` +
    `with a finance rental of ${fmtCurrencyCents(payment)} per ${noun} and a residual of ` +
    `${fmtCurrency(quote.residualIncGst ?? 0)} including GST. Those four figures imply an ` +
    `interest rate of about ${rate.toFixed(2)}% a year. Could you confirm the rate on the ` +
    `finance, and tell me whether anything other than interest is included in the rental?`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sentence);
      setCopied(true);
      track("Rate working copied", { rate: rate.toFixed(2) });
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      /* clipboard blocked — the sentence is on screen to copy by hand */
    }
  };

  const steps: { label: string; value: string; body: string }[] = [
    {
      label: "They lend you",
      value: fmtCurrency(financed),
      body: decode.financedWasDerived
        ? "The quote doesn't state the amount financed, so this is the price less the GST the financier claims back."
        : "The amount financed, straight off the quote.",
    },
    {
      label: `You pay back`,
      value: `${fmtCurrencyCents(payment)} a ${noun}`,
      body: `The finance line only — not the running costs or the fees. Over ${quote.termMonths} months that is ${payments} payments, ${fmtCurrency(repaid)} in total.`,
    },
    {
      label: "And still owe",
      value: fmtCurrency(residualEx),
      body: `The residual at the end. Quoted as ${fmtCurrency(quote.residualIncGst ?? 0)} with GST in it; the finance is written over the amount without.`,
    },
    {
      label: "So the finance costs",
      value: fmtCurrency(interest),
      body: `${fmtCurrency(repaid)} repaid, plus ${fmtCurrency(residualEx)} still owing, less the ${fmtCurrency(financed)} borrowed.`,
    },
  ];

  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) track("Rate working opened");
        }}
        aria-expanded={open}
        className="text-xs font-semibold text-accent hover:underline"
      >
        {open ? "Hide the working" : "Why we say it's this rate"}
      </button>

      {open && (
        <div className="mt-3">
          <p className="max-w-2xl text-sm leading-relaxed text-subtle">
            The rate isn&apos;t printed anywhere on the quote, but it isn&apos;t a guess either —
            it is fixed by four figures that <em>are</em> on it.
          </p>

          <ol className="mt-3 max-w-2xl space-y-2.5">
            {steps.map((s, i) => (
              <li key={s.label} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold tabular-nums text-accent">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed text-subtle">
                  <strong className="font-semibold text-ink">
                    {s.label} {s.value}.
                  </strong>{" "}
                  {s.body}
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-3 max-w-2xl rounded-lg border border-accent-border bg-accent-subtle px-3.5 py-2.5 text-sm leading-relaxed text-ink">
            <strong className="font-semibold">Only one rate fits those numbers.</strong> Lend{" "}
            {fmtCurrency(financed)}, take {fmtCurrencyCents(payment)} a {noun} for {years}{" "}
            {years === 1 ? "year" : "years"}, and leave {fmtCurrency(residualEx)} owing at the end,
            and the interest rate is {rate.toFixed(2)}% a year. A higher rate would need a bigger
            payment; a lower one, a smaller payment. There is nothing to disagree about — it is the
            same arithmetic a loan calculator does, run backwards.
          </p>

          <div className="mt-3 max-w-2xl rounded-lg border border-line bg-panel-2 px-3.5 py-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Put it back to them in one sentence
            </h4>
            <p className="mt-1.5 text-sm leading-relaxed text-subtle">{sentence}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copy}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-soft"
              >
                {copied ? "Copied" : "Copy this"}
              </button>
              <span className="text-[11px] leading-snug text-muted">
                The second half matters: the implied rate covers everything built into the rental,
                so if brokerage is sitting in there the financier&apos;s own rate will be lower
                than this — and that difference is worth knowing about.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
