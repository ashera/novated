"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  activateQuote,
  newQuoteSpec,
  quoteLabel,
  quoteStatus,
  type QuoteStatus,
} from "@/lib/au/lease";
import type { EngineConfig } from "@/lib/au/config";
import { fmtDate } from "@/lib/au/format";
import type { UseLease } from "./useLease";

/**
 * Every quote gathered against this lease.
 *
 * Its own card, below the car. The quotes are what accumulate as the journey
 * goes on — one from each provider — so they need room to grow and a heading
 * of their own, which they never had squeezed under the lease name.
 *
 * Shown on both tools, because a lease has the same quotes wherever you are
 * looking at it: someone modelling in the calculator can see what they have
 * collected without leaving the page, and tell at a glance which are still
 * half-typed.
 *
 * One of them may be ACTIVE — the one whose rate, budgets and fees the figures
 * below are modelled on. A lease has a single scenario, so handing a second
 * quote to the calculator replaces the first, and without saying which is in
 * force the numbers look like something the user chose rather than something a
 * provider quoted.
 */

const STATUS_STYLE: Record<QuoteStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-panel-3 text-muted" },
  "in-progress": { label: "In progress", className: "bg-warning-subtle text-warning-text" },
  complete: { label: "Complete", className: "bg-success-subtle text-success-text" },
};

export default function QuotesCard({
  store,
  config,
}: {
  store: UseLease;
  config: EngineConfig;
}) {
  const { lease } = store;
  const router = useRouter();
  const activeId = lease.scenario.fromQuoteId;

  /** Model this quote in the figures below, without a trip to the decoder.
   *  Only offered where the quote solves — see activateQuote. */
  const activate = (id: string) => store.update((l) => activateQuote(l, id, config));

  const addQuote = () => {
    const spec = newQuoteSpec(`Quote ${lease.quotes.length + 1}`);
    store.update((l) => ({ ...l, quotes: [...l.quotes, spec] }));
    // Adding a quote means going and typing it in, so take them there.
    router.push(`/decode?quote=${encodeURIComponent(spec.id)}`);
  };

  return (
    <section className="mb-6 rounded-xl border border-line bg-panel px-4 py-3.5 shadow-[var(--shadow-card)] sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">
          Quotes{lease.quotes.length > 0 && ` (${lease.quotes.length})`}
        </h2>
        <div className="flex items-center gap-3">
          {lease.quotes.length > 1 && (
            <Link href="/compare" className="text-xs font-medium text-accent hover:underline">
              Compare all
            </Link>
          )}
          <button
            type="button"
            onClick={addQuote}
            className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-soft"
          >
            + Add a quote
          </button>
        </div>
      </div>

      {activeId && lease.quotes.some((q) => q.id === activeId) && (
        <p className="mt-1 text-xs text-muted">
          The figures below are modelled on the quote marked active. Open another and choose
          &ldquo;See what this lease saves you&rdquo; to switch.
        </p>
      )}

      {lease.quotes.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          None yet. When a provider sends you one, add it here and we&apos;ll work out the
          interest rate it doesn&apos;t print.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {lease.quotes.map((q) => {
            const status = quoteStatus(lease, q, config);
            const style = STATUS_STYLE[status];
            const active = q.id === activeId;
            return (
              <li
                key={q.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${
                  active ? "-mx-2 rounded-md bg-accent-subtle px-2" : ""
                }`}
              >
                <Link
                  href={`/decode?quote=${encodeURIComponent(q.id)}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  {quoteLabel(q)}
                </Link>
                {active && (
                  <span
                    title="The figures below are modelled on this quote"
                    className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  >
                    Active
                  </span>
                )}
                {!active && status === "complete" && (
                  <button
                    type="button"
                    onClick={() => activate(q.id)}
                    title="Model the figures below on this quote"
                    className="rounded border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-ink transition hover:border-accent hover:text-accent"
                  >
                    Use this one
                  </button>
                )}
                <span className="text-xs text-muted">
                  {q.createdAt ? `Processed ${fmtDate(q.createdAt)}` : "Not yet processed"}
                </span>
                <span
                  className={`ml-auto rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.className}`}
                >
                  {style.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
