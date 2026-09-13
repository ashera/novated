"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopBar, { type TopBarUser } from "./TopBar";
import Disclosures from "./Disclosures";
import { fmtCurrency } from "@/lib/au/format";
import { compareQuotes } from "@/lib/au/quote";
import type { EngineConfig } from "@/lib/au/config";
import { useLease } from "./useLease";
import { leaseToQuote, newQuoteSpec, quoteLabel } from "@/lib/au/lease";
import { track } from "@/lib/analytics";

/** A row of the comparison table. `best` marks the winning column, where one
 *  can honestly be named. */
interface Row {
  label: string;
  hint?: string;
  values: (string | null)[];
  best: number | null;
  emphasis?: boolean;
}

export default function QuoteComparison({
  user,
  country,
  config,
  reviewDue = 0,
}: {
  user: TopBarUser | null;
  country?: string | null;
  config: EngineConfig;
  reviewDue?: number;
}) {
  const store = useLease(Boolean(user));
  const { lease } = store;
  // Every quote on this lease is an offer on the SAME car, which is exactly
  // what makes them comparable — the vehicle comes from the shared parent.
  const comparison = useMemo(
    () => compareQuotes(lease.quotes.map((q) => leaseToQuote(lease, q)), config),
    [lease, config],
  );

  const router = useRouter();

  /** Same as the quotes card: a new quote, then straight to typing it in.
   *  Linking to a bare /decode opened the FIRST existing quote instead. */
  const addQuote = () => {
    track("Add a quote", { from: "comparison", existing: lease.quotes.length });
    // Deliberately unnamed: a pre-filled "Quote 3" looks like an answer,
    // so it got left alone and every quote in the list was called Quote N.
    const spec = newQuoteSpec("", lease.scenario.termYears * 12);
    store.update((l) => ({ ...l, quotes: [...l.quotes, spec] }));
    router.push(`/decode?quote=${encodeURIComponent(spec.id)}`);
  };

  const cols = comparison.quotes;
  const money = (n: number | null | undefined) => (n == null ? null : fmtCurrency(n));

  const rows: Row[] = cols.length
    ? [
        {
          label: "Interest rate",
          hint: "Solved from the finance payment. No quote states it.",
          values: cols.map((c) =>
            c.decode.impliedRatePct == null ? null : `${c.decode.impliedRatePct.toFixed(2)}%`,
          ),
          best: comparison.bestRate,
          emphasis: true,
        },
        {
          label: "Interest over the term",
          hint: "The rate and the interest can disagree — a smaller loan at a worse rate still pays less.",
          values: cols.map((c) => money(c.decode.totalInterest)),
          best: comparison.bestInterest,
        },
        {
          label: "Vehicle price",
          values: cols.map((c) => money(c.quote.vehiclePrice)),
          best: null,
        },
        {
          label: "Amount financed",
          values: cols.map((c) => money(c.decode.amountFinanced)),
          best: null,
        },
        {
          label: "Residual",
          hint: "Owed at the end, whatever else happens.",
          values: cols.map((c) => money(c.quote.residualIncGst)),
          best: null,
        },
        {
          label: "Term",
          values: cols.map((c) => `${c.quote.termMonths / 12} years`),
          best: null,
        },
        {
          label: "Insurance a year",
          values: cols.map((c) => money(c.decode.annualLines.insurance)),
          best: null,
        },
        {
          label: "Management fee a year",
          values: cols.map((c) => money(c.decode.annualLines.managementFee)),
          best: null,
        },
        {
          label: "Running costs a year",
          hint: "Fuel, servicing, tyres, registration and insurance.",
          values: cols.map((c) => money(c.annualRunningBudget || null)),
          best: comparison.bestRunningBudget,
        },
        {
          label: "Everything, over the term",
          hint: comparison.vehiclesComparable
            ? undefined
            : "Not comparable here — see the note above.",
          values: cols.map((c) => money(c.totalPackageOverTerm)),
          best: comparison.bestTotalCost,
          emphasis: comparison.vehiclesComparable,
        },
      ]
    : [];

  return (
    <>
      <TopBar user={user} country={country} reviewDue={reviewDue} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {lease.name}: quotes side by side
            </h1>
            <p className="mt-1.5 text-sm text-subtle">
              Every offer on the same car, on the same footing — including the one number none of
              them prints.
            </p>
          </div>
          <button
            type="button"
            onClick={addQuote}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
          >
            Add another quote
          </button>
        </div>

        {store.adopted > 0 && (
          <p className="mb-5 rounded-lg border border-success/40 bg-success-subtle px-4 py-2.5 text-sm text-success-text">
            Moved {store.adopted} lease{store.adopted === 1 ? "" : "s"} from this browser onto your
            account. They&apos;ll follow you to any device now.
          </p>
        )}

        {store.loading ? (
          <p className="text-sm text-muted">Loading your quotes…</p>
        ) : cols.length === 0 ? (
          <section className="rounded-xl border border-line bg-panel p-8 text-center shadow-[var(--shadow-card)]">
            <h2 className="text-base font-semibold text-ink">No quotes kept yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-subtle">
              Decode a quote and hit <strong>Keep this quote</strong>. Once you have two, this page
              puts them next to each other — which is where the differences usually show up.
            </p>
            <button
              type="button"
              onClick={addQuote}
              className="mt-5 inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              Decode a quote
            </button>
          </section>
        ) : (
          <div className="space-y-5">
            {/* The headline: what the spread is worth */}
            {comparison.rateSpreadPp != null && comparison.rateSpreadPp >= 0.1 && (
              <section className="rounded-xl border border-line border-t-4 border-t-accent bg-panel p-5 shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                  <span className="text-4xl font-bold tabular-nums leading-none text-accent">
                    {comparison.rateSpreadPp.toFixed(2)}
                    <span className="ml-1 text-lg">pp</span>
                  </span>
                  <div className="min-w-[16rem] flex-1">
                    <h2 className="text-lg font-semibold text-ink">
                      Between the best and worst rate you were quoted
                    </h2>
                    {comparison.rateSpreadValue != null && (
                      <p className="mt-1 text-sm text-subtle">
                        Worth about{" "}
                        <strong>{fmtCurrency(comparison.rateSpreadValue)}</strong> over the term —
                        and not one of these quotes tells you its rate.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Anything that would make a naive comparison wrong */}
            {comparison.notes.length > 0 && (
              <ul className="space-y-2">
                {comparison.notes.map((n) => (
                  <li
                    key={n}
                    className="rounded-lg border border-warning/40 bg-warning-subtle px-4 py-2.5 text-sm text-warning-text"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            )}

            {/* The table */}
            <section className="overflow-x-auto rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      &nbsp;
                    </th>
                    {cols.map((c, i) => (
                      <th key={i} className="px-4 py-3 text-right">
                        <span className="block text-sm font-semibold text-ink">
                          {quoteLabel(c.quote, `Quote ${i + 1}`)}
                        </span>
                        {comparison.bestRate === i && (
                          <span className="mt-1 inline-block rounded bg-success-subtle px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-success-text">
                            Best rate
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.label} className={r.emphasis ? "bg-panel-2" : undefined}>
                      <td className="px-4 py-3">
                        <span
                          className={`block ${r.emphasis ? "font-semibold text-ink" : "text-subtle"}`}
                        >
                          {r.label}
                        </span>
                        {r.hint && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                            {r.hint}
                          </span>
                        )}
                      </td>
                      {r.values.map((v, i) => (
                        <td
                          key={i}
                          className={`px-4 py-3 text-right tabular-nums ${
                            r.best === i
                              ? "font-semibold text-success-text"
                              : r.emphasis
                                ? "font-semibold text-ink"
                                : "text-ink"
                          }`}
                        >
                          {v ?? <span className="text-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Per-quote findings, so the table has somewhere to send you */}
            <section className="grid gap-4 md:grid-cols-2">
              {cols.map((c, i) => {
                const worst = c.decode.findings.filter((f) => f.severity !== "ok").slice(0, 3);
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
                  >
                    <h3 className="text-base font-semibold text-ink">
                      {quoteLabel(c.quote, `Quote ${i + 1}`)}
                    </h3>
                    {worst.length === 0 ? (
                      <p className="mt-2 text-sm text-success-text">
                        Nothing flagged on this one.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {worst.map((f) => (
                          <li key={f.key} className="text-sm">
                            <span className="font-medium text-ink">{f.title}</span>
                            {f.costOverTerm != null && f.costOverTerm > 0 && (
                              <span className="ml-2 tabular-nums text-danger-text">
                                {fmtCurrency(f.costOverTerm)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* This column's quote, not the lease's first — the
                        columns are in lease.quotes order. A bare /decode
                        opened whichever quote came first, from every card. */}
                    <Link
                      href={`/decode?quote=${encodeURIComponent(lease.quotes[i]?.id ?? "")}`}
                      className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
                    >
                      Open in the decoder →
                    </Link>
                  </div>
                );
              })}
            </section>

            <Disclosures config={config} />
          </div>
        )}
      </main>
    </>
  );
}
