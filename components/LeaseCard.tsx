"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { newQuoteSpec, quoteStatus, type QuoteStatus } from "@/lib/au/lease";
import type { EngineConfig } from "@/lib/au/config";
import { fmtDate } from "@/lib/au/format";
import type { UseLease } from "./useLease";

/**
 * The lease itself: what it's called, which one you're on, and every quote
 * gathered against it.
 *
 * Shown on both tools, because the lease is what they share. The quote list
 * lives here rather than only on the decoder so that someone modelling a lease
 * can see what they've collected without leaving the page — and can tell at a
 * glance which quotes still need finishing.
 */

const STATUS_STYLE: Record<QuoteStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-panel-3 text-muted" },
  "in-progress": { label: "In progress", className: "bg-warning-subtle text-warning-text" },
  complete: { label: "Complete", className: "bg-success-subtle text-success-text" },
};

export default function LeaseCard({
  store,
  signedIn,
  config,
}: {
  store: UseLease;
  signedIn: boolean;
  config: EngineConfig;
}) {
  const { all, leaseId, lease, saving } = store;
  const router = useRouter();

  const addQuote = () => {
    const spec = newQuoteSpec(`Quote ${lease.quotes.length + 1}`);
    store.update((l) => ({ ...l, quotes: [...l.quotes, spec] }));
    // Adding a quote means going and typing it in, so take them there.
    router.push(`/decode?quote=${encodeURIComponent(spec.id)}`);
  };

  return (
    <section className="mb-5 rounded-xl border border-line bg-panel shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Lease</span>

        <input
          value={lease.name}
          onChange={(e) => store.update((l) => ({ ...l, name: e.target.value }))}
          aria-label="Lease name"
          className="min-w-[10rem] max-w-xs flex-1 rounded-md border border-line bg-panel-2 px-2 py-1 text-sm font-medium text-ink outline-none focus:border-accent"
        />

        {all.length > 1 && (
          <select
            value={leaseId ?? ""}
            onChange={(e) => store.switchTo(e.target.value)}
            aria-label="Switch lease"
            className="rounded-md border border-line bg-panel-2 px-2 py-1 text-sm text-ink outline-none focus:border-accent"
          >
            {all.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={store.create}
          className="rounded-md border border-dashed border-line-bold px-2.5 py-1 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
        >
          + New lease
        </button>

        {leaseId && all.length > 1 && (
          <button
            type="button"
            onClick={() => store.remove(leaseId)}
            className="rounded px-2 py-1 text-sm text-muted transition hover:bg-danger-subtle hover:text-danger-text"
          >
            Delete
          </button>
        )}

        <span className="ml-auto text-xs text-muted">
          {saving ? "Saving…" : signedIn ? "Saved to your account" : "Saved in this browser"}
        </span>
      </div>

      {/* ── Quotes gathered against this lease ──────────────────────────── */}
      <div className="border-t border-line px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Quotes{lease.quotes.length > 0 && ` (${lease.quotes.length})`}
          </h3>
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
              return (
                <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link
                    href={`/decode?quote=${encodeURIComponent(q.id)}`}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {q.label}
                  </Link>
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
      </div>
    </section>
  );
}
