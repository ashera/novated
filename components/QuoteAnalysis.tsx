"use client";

import Link from "next/link";
import { fmtCurrency, fmtCurrencyCents } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import { CYCLES_PER_YEAR, decodeQuote, type Quote, type FindingSeverity } from "@/lib/au/quote";
import RateWorking from "./RateWorking";
import { useMemo } from "react";

/**
 * One quote's analysis, read-only, for somebody who was sent a link.
 *
 * Deliberately NOT the decoder with its inputs disabled. A reader who did not
 * type these figures does not want a form — they want the answer and the
 * arithmetic behind it, and a page of greyed-out boxes buries both. So this is
 * the findings, the rate, the working, and the figures the working rests on,
 * in that order.
 *
 * It is also the narrowest thing that can be shared. A lease carries a ledger,
 * a salary and a payslip; a quote carries a provider's own document and what
 * it implies. Sending one is telling somebody "look at this quote" — which is
 * what people do with a quote — and it does not hand over the rest.
 *
 * The recipient is usually not the person who asked for the quote: a partner,
 * a colleague who is shopping too, or the provider themselves. So it explains
 * what it is at the top rather than assuming context, and every figure is
 * traceable to the document rather than to a setting they cannot see.
 */

const SEVERITY: Record<FindingSeverity, { edge: string; chip: string }> = {
  critical: { edge: "border-l-danger", chip: "bg-danger-subtle text-danger-text" },
  warn: { edge: "border-l-warning", chip: "bg-warning-subtle text-warning-text" },
  ok: { edge: "border-l-success", chip: "bg-success-subtle text-success-text" },
};

const FREQ_NOUN: Record<Quote["frequency"], string> = {
  weekly: "week",
  fortnightly: "fortnight",
  monthly: "month",
};

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{value}</dd>
      {note && <p className="text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}

export default function QuoteAnalysis({
  quote,
  config,
  carName,
  providerLabel,
}: {
  quote: Quote;
  config: EngineConfig;
  carName: string;
  providerLabel: string;
}) {
  const decode = useMemo(() => decodeQuote(quote, config), [quote, config]);
  const noun = FREQ_NOUN[quote.frequency];
  const perYear = CYCLES_PER_YEAR[quote.frequency];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Novated lease quote, decoded
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {providerLabel} on a {carName}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-subtle">
          Somebody shared this analysis with you. Every figure below is worked out from the numbers
          on their quote — most of all the interest rate, which a novated lease quote almost never
          prints, and which is fixed by four figures that are on it.
        </p>
      </header>

      {/* The rate, which is the reason to share one of these at all. */}
      {decode.impliedRatePct != null ? (
        <section className="rounded-xl border border-accent-border bg-accent-subtle p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            The interest rate behind it
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-ink">
            {decode.impliedRatePct.toFixed(2)}%
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-subtle">
            Everything inside the finance payment, not only interest — solved from the payment, the
            amount financed
            {decode.financedWasDerived && " (worked out from the price)"}, the residual and the
            term. Over {quote.termMonths / 12} years it costs{" "}
            <strong className="text-ink">{fmtCurrency(decode.totalInterest ?? 0)}</strong> in
            interest
            {decode.financeMargin != null && decode.financeMargin > 0 && (
              <>
                {" "}
                — <strong className="text-ink">{fmtCurrency(decode.financeMargin)}</strong> more
                than the same lease would cost at {config.benchmarks.loanRatePct}%, what a
                comparable secured car loan charges
              </>
            )}
            .
          </p>
          <RateWorking quote={quote} decode={decode} noun={noun} />
        </section>
      ) : (
        <section className="rounded-xl border border-warning/40 bg-warning-subtle p-5">
          <h2 className="text-base font-semibold text-warning-text">
            The rate can&apos;t be worked out from this one
          </h2>
          <p className="mt-1.5 text-sm text-warning-text">
            {decode.rateBlockedBy ??
              "It needs the amount financed, the residual, the term and the finance payment."}
          </p>
        </section>
      )}

      {/* The four figures everything above rests on, so a reader can check
          them against the document rather than take them on trust. */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">What the quote says</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          {quote.lines.finance != null && (
            <Fact
              label="Finance payment"
              value={fmtCurrencyCents(quote.lines.finance)}
              note={`a ${noun}`}
            />
          )}
          {decode.amountFinanced != null && (
            <Fact
              label="Amount financed"
              value={fmtCurrency(decode.amountFinanced)}
              note={decode.financedWasDerived ? "worked out from the price" : undefined}
            />
          )}
          <Fact label="Term" value={`${quote.termMonths} months`} />
          {quote.residualIncGst != null && (
            <Fact
              label="Residual"
              value={fmtCurrency(quote.residualIncGst)}
              note="GST included — due at the end"
            />
          )}
          {quote.statedRatePct != null && (
            <Fact label="Rate they quoted" value={`${quote.statedRatePct}%`} />
          )}
          {quote.statedPreTax != null && (
            <Fact
              label="Out of your pay"
              value={fmtCurrencyCents(quote.statedPreTax)}
              note={`a ${noun}, before tax`}
            />
          )}
          {quote.vehiclePrice != null && (
            <Fact label="Price of the car" value={fmtCurrency(quote.vehiclePrice)} />
          )}
          {quote.annualKm != null && (
            <Fact label="Distance a year" value={`${quote.annualKm.toLocaleString("en-AU")} km`} />
          )}
        </dl>
      </section>

      {decode.findings.length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold text-ink">What we found</h2>
          <p className="mt-1 text-sm text-muted">Ordered by what each one costs over the term.</p>
          <ul className="mt-4 space-y-3">
            {decode.findings.map((f) => (
              <li
                key={f.key}
                className={`rounded-r-lg border border-l-4 border-line bg-panel-2 p-3.5 ${SEVERITY[f.severity].edge}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEVERITY[f.severity].chip}`}
                  >
                    {f.category}
                  </span>
                  <h3 className="flex-1 text-sm font-semibold text-ink">{f.title}</h3>
                  {f.costOverTerm != null && f.costOverTerm > 0 && (
                    <span className="text-sm font-semibold tabular-nums text-danger-text">
                      {fmtCurrency(f.costOverTerm)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-subtle">{f.detail}</p>
                {f.question && (
                  <p className="mt-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink">
                    <span className="font-semibold">Worth asking: </span>
                    {f.question}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Every line, annualised — the one table that lets a reader tie the
          fortnightly figures on the document to a yearly cost. */}
      {Object.keys(decode.annualLines).length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold text-ink">Every line, over a year</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-semibold">Line</th>
                  <th className="py-2 pr-3 text-right font-semibold">Per {noun}</th>
                  <th className="py-2 text-right font-semibold">A year</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(decode.annualLines).map(([key, annual]) => (
                  <tr key={key} className="border-b border-line-soft last:border-0">
                    <td className="py-2 pr-3 text-ink">{key}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-subtle">
                      {fmtCurrencyCents(annual / perYear)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">{fmtCurrency(annual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-line bg-panel-2 p-5 text-sm leading-relaxed text-subtle">
        <p>
          <strong className="text-ink">This is an analysis, not the quote itself.</strong> It was
          produced by <Link href="/" className="text-accent hover:underline">LeaseWiz</Link> from
          the figures somebody typed off a provider&apos;s document, and it is general information
          rather than financial or tax advice. Nothing here is sent to the provider, and the person
          who shared it can revoke this link at any time.
        </p>
        <p className="mt-3">
          Got a quote of your own?{" "}
          <Link href="/decode" className="font-semibold text-accent hover:underline">
            Decode it the same way
          </Link>{" "}
          — it is free, and we sell nothing.
        </p>
      </section>
    </div>
  );
}
