"use client";

import { fmtCurrency } from "@/lib/au/format";
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

export default function LedgerTable({
  rows,
  onForget,
}: {
  rows: LoggedRow[];
  /** Omitted where rows are not the caller's to remove. */
  onForget?: (key: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
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
          {rows.map((r: StatementRow, i) => (
            <tr key={`${r.date}-${i}`} className="border-b border-line-soft last:border-0">
              <td className="whitespace-nowrap px-3 py-1.5 text-muted">{r.date}</td>
              <td className="px-3 py-1.5 text-ink">{r.description}</td>
              <td className="px-3 py-1.5 text-muted">{KIND_LABEL[r.kind]}</td>
              <td
                className={`px-3 py-1.5 text-right tabular-nums ${r.amount < 0 ? "text-subtle" : "text-success-text"}`}
              >
                {fmtCurrency(r.amount)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                {r.balance != null ? fmtCurrency(r.balance) : "—"}
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
  );
}
