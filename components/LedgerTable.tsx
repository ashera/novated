"use client";

import { useState } from "react";

import { fmtCurrencyCents } from "@/lib/au/format";
import type { RowKind, StatementRow } from "@/lib/au/statement";
import { rowKey, type LoggedRow } from "@/lib/au/statementLog";

/**
 * The ledger, as we read it.
 *
 * Shared, because both places that build a ledger need to show it and the
 * interesting column is the one that is ours rather than the provider's: "read
 * as", which says how each line was classified. Everything above it — the
 * totals, the charts, the findings — follows from that classification, so a
 * line filed under the wrong heading is the one explanation for a figure that
 * looks wrong, and it has to be visible.
 *
 * Cents everywhere, unlike the summaries above it. These are the figures as
 * the statement printed them, and the whole use of the table is checking a row
 * against the document — $1,602 against a statement that says $1,602.81 is the
 * one thing that makes a reader doubt the rest of the page. The same reason
 * the rate working and the lock confirmation keep theirs.
 *
 * The labels live here too. They were declared separately in two components
 * and had already drifted — "GST credit" against "GST credits", "Servicing"
 * against "Maintenance" — which is a small thing that makes two views of one
 * ledger look like two different ledgers.
 */

export const KIND_LABEL: Record<RowKind, string> = {
  payroll: "From your pay",
  finance: "Finance",
  "gst-credit": "GST credit",
  fuel: "Fuel or charging",
  insurance: "Insurance",
  registration: "Registration",
  maintenance: "Servicing",
  tyres: "Tyres",
  roadside: "Roadside",
  fee: "Fee",
  fbt: "FBT / post-tax",
  refund: "Refund",
  unknown: "Not categorised",
};

const PER_PAGE = 10;

export default function LedgerTable({
  rows,
  onForget,
}: {
  rows: LoggedRow[];
  /** Omitted where rows are not the caller's to remove. */
  onForget?: (key: string) => void;
}) {
  const [page, setPage] = useState(0);
  if (rows.length === 0) return null;

  /*
   * Newest first, which is the opposite of how they are stored.
   *
   * The log is kept oldest-first because a running balance can only be read in
   * that direction — each row's balance is the one above it plus its own
   * amount, and reversing the store would break the reconciliation and the gap
   * check. Reading is the other way round: the transaction somebody wants is
   * the one that just appeared, and a five-year ledger would bury it under
   * three hundred rows. So the order is flipped for display only.
   */
  const newestFirst = [...rows].reverse();
  const pages = Math.max(1, Math.ceil(newestFirst.length / PER_PAGE));
  // Clamped rather than stored, because removing rows can shrink the ledger
  // under the page being looked at — and an out-of-range page renders empty
  // with no hint that anything is still there.
  const current = Math.min(page, pages - 1);
  const start = current * PER_PAGE;
  const shown = newestFirst.slice(start, start + PER_PAGE);

  return (
    <div>
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 font-semibold">Read as</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
            <th className="px-3 py-2 text-right font-semibold">Balance</th>
            {onForget && <th className="px-2 py-2" />}
          </tr>
        </thead>
        <tbody>
          {shown.map((r: StatementRow, i) => (
            <tr key={`${r.date}-${i}`} className="border-b border-line-soft last:border-0">
              <td className="whitespace-nowrap px-3 py-1.5 text-muted">{r.date}</td>
              <td className="px-3 py-1.5 text-ink">{r.description}</td>
              <td className="px-3 py-1.5 text-muted">{KIND_LABEL[r.kind]}</td>
              <td
                className={`px-3 py-1.5 text-right tabular-nums ${r.amount < 0 ? "text-subtle" : "text-success-text"}`}
              >
                {fmtCurrencyCents(r.amount)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                {r.balance != null ? fmtCurrencyCents(r.balance) : "—"}
              </td>
              {/* The ledger is the user's. Something pasted by mistake has to be
                  removable, or the only remedy is clearing the lot. */}
              {onForget && (
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => onForget(rowKey(r))}
                    className="text-[11px] font-medium text-muted hover:text-danger-text"
                    aria-label={`Remove ${r.description} on ${r.date}`}
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {pages > 1 && (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          {start + 1}–{Math.min(start + PER_PAGE, newestFirst.length)} of {newestFirst.length},
          newest first
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
            className="rounded border border-line px-2 py-1 font-medium text-subtle transition hover:text-ink disabled:opacity-40 disabled:hover:text-subtle"
          >
            Newer
          </button>
          <span className="tabular-nums text-muted">
            {current + 1} / {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage(current + 1)}
            disabled={current >= pages - 1}
            className="rounded border border-line px-2 py-1 font-medium text-subtle transition hover:text-ink disabled:opacity-40 disabled:hover:text-subtle"
          >
            Older
          </button>
        </span>
      </div>
    )}
    </div>
  );
}
