"use client";

import { useMemo, useState } from "react";
import { type RowKind, type StatementRow } from "@/lib/au/statement";
import { analyseLog, byMonth, removeRows, type MergeResult } from "@/lib/au/statementLog";
import StatementPaste, { ClearLedger } from "./StatementPaste";
import LedgerTable, { KIND_LABEL } from "./LedgerTable";
import type { EngineConfig } from "@/lib/au/config";
import type { Finding, FindingSeverity } from "@/lib/au/quote";
import { fmtCurrency } from "@/lib/au/format";
import { useLease } from "./useLease";
import { track } from "@/lib/analytics";

/**
 * Paste the ledger, keep the ledger.
 *
 * A paste box rather than a form, because a statement is forty rows and
 * nobody is typing forty rows. It is also the one input that works across
 * providers without knowing any of their templates: whatever the portal
 * renders, selecting it and copying gives text with a date, a description and
 * some money on each row, and that is all the parser needs.
 *
 * What is pasted is KEPT, on the lease, and the next paste is merged into it.
 * A portal shows twenty-five rows at a time, so a single window can only ever
 * answer "what happened lately" — and the questions that matter over five
 * years need a year of history: is the deduction covering the car, which
 * budget is drifting, and is anything missing. The merge has to be idempotent,
 * because people will paste overlapping windows without thinking about it, and
 * that is the hard part rather than an afterthought: the rows are not
 * distinct, and only the running balance tells six identical GST credits on
 * one day apart from each other.
 *
 * Nothing is uploaded. The parsing and the arithmetic happen in this
 * component, in the browser; the rows are stored the same way the rest of the
 * lease is, which for a guest means this machine and nowhere else.
 */

const TONE: Record<FindingSeverity, { wrap: string; chip: string }> = {
  critical: { wrap: "border-danger/40 bg-danger-subtle", chip: "bg-danger-subtle text-danger-text" },
  warn: { wrap: "border-warning bg-warning-subtle", chip: "bg-warning-subtle text-warning-text" },
  ok: { wrap: "border-line bg-panel", chip: "bg-accent-subtle text-accent" },
};

const SAMPLE = `11 September 2026\tFunds from Payroll\t$1,698.98\t$2,665.26
7 September 2026\tInsurance - Reimbursement\t-$218.25\t$966.28
4 September 2026\tGST Credits\t$218.25\t$1,184.53
2 September 2026\tInsurance - Reimbursement\t-$643.15\t$966.28
31 August 2026\tMaintenance - Reimbursement\t-$797.90\t$1,609.43
14 August 2026\tLease - Asset Finance Pty Ltd\t-$1,602.81\t$2,407.33
10 August 2026\tGST Credits\t$145.71\t$4,010.14
10 August 2026\tGST Credits\t$145.71\t$3,864.43
10 August 2026\tGST Credits\t$145.71\t$3,718.72
10 August 2026\tGST Credits\t$145.71\t$3,573.01
10 August 2026\tGST Credits\t$145.71\t$3,427.30
10 August 2026\tGST Credits\t$179.62\t$3,281.59
3 August 2026\tFunds from Payroll\t$1,698.98\t$3,101.97
16 July 2026\tRegistration - Reimbursement\t-$634.00\t$1,402.99
16 July 2026\tRegistration - Reimbursement\t-$570.00\t$2,036.99
15 July 2026\tLease - Asset Finance Pty Ltd\t-$1,602.81\t$2,606.99
2 July 2026\tFunds from Payroll\t$1,698.98\t$4,209.80`;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}

export default function StatementReader({
  config,
  signedIn,
}: {
  config: EngineConfig;
  signedIn: boolean;
}) {
  const store = useLease(signedIn);
  const log = useMemo(() => store.lease.statement ?? [], [store.lease.statement]);

  const [lastMerge, setLastMerge] = useState<MergeResult | null>(null);

  const read = useMemo(
    () => (log.length > 0 ? analyseLog(log, config) : null),
    [log, config],
  );
  const months = useMemo(() => (read ? byMonth(read.rows) : []), [read]);

  return (
    <div className="mt-8">
      <div className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">Paste the transaction list</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-subtle">
          Open your provider&apos;s portal, select the transactions and copy them — dates,
          descriptions and amounts. Paste the lot in here. It doesn&apos;t matter which provider,
          what order the rows are in, or whether you get every column.{" "}
          <strong className="font-semibold text-ink">
            Nothing is uploaded: the reading happens in your browser.
          </strong>
        </p>
        <StatementPaste
          log={log}
          sample={SAMPLE}
          onMerge={(rows, result) => {
            setLastMerge(result);
            store.update((l) => ({ ...l, statement: rows }));
          }}
        />
      </div>

      {read && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Balance"
              value={read.balance != null ? fmtCurrency(read.balance) : "—"}
              note={read.rows.at(-1) ? `as at ${read.rows.at(-1)!.date}` : undefined}
            />
            <Stat
              label="Transactions logged"
              value={String(read.rows.length)}
              note={
                read.rows.length > 0
                  ? `${read.rows[0].date} to ${read.rows.at(-1)!.date}`
                  : undefined
              }
            />
            <Stat
              label="Finance so far"
              value={fmtCurrency(Math.abs(read.totals.finance ?? 0))}
              note="paid to the financier"
            />
            <Stat
              label="Out of your pay"
              value={fmtCurrency(read.contributed)}
              note={`across ${read.span} month${read.span === 1 ? "" : "s"} logged`}
            />
          </div>

          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">What the statement says</h2>
            <ClearLedger
              count={log.length}
              onClear={() => store.update((l) => ({ ...l, statement: [] }))}
            />
          </div>
          <ul className="mt-3 space-y-3">
            {read.findings.map((f: Finding) => (
              <li key={f.key} className={`rounded-xl border p-4 ${TONE[f.severity].wrap}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE[f.severity].chip}`}
                  >
                    {f.category}
                  </span>
                  <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-subtle">{f.detail}</p>
                {f.question && (
                  <p className="mt-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink">
                    <span className="font-semibold">Ask them: </span>
                    {f.question}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <h2 className="mt-8 text-base font-semibold text-ink">Where the money went</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-semibold">What for</th>
                  <th className="px-3 py-2 text-right font-semibold">Over the period</th>
                  <th className="px-3 py-2 text-right font-semibold">A month</th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(read.totals) as [RowKind, number][])
                  .filter(([, v]) => Math.abs(v) > 0.005)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .map(([kind, total]) => (
                    <tr key={kind} className="border-b border-line-soft last:border-0">
                      <td className="px-3 py-2 text-ink">{KIND_LABEL[kind]}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${total < 0 ? "text-subtle" : "text-success-text"}`}
                      >
                        {fmtCurrency(total)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {fmtCurrency(total / read.span)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {months.length > 1 && (
            <>
              <h2 className="mt-8 text-base font-semibold text-ink">Month by month</h2>
              <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-panel">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="px-3 py-2 font-semibold">Month</th>
                      <th className="px-3 py-2 text-right font-semibold">In</th>
                      <th className="px-3 py-2 text-right font-semibold">Out</th>
                      <th className="px-3 py-2 text-right font-semibold">Balance at month end</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m.month} className="border-b border-line-soft last:border-0">
                        <td className="px-3 py-2 tabular-nums text-ink">{m.month}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-success-text">
                          {fmtCurrency(m.in)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-subtle">
                          {fmtCurrency(m.out)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink">
                          {m.balance != null ? fmtCurrency(m.balance) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted">
                A month that looks light is usually a month not yet pasted in rather than a month
                nothing happened in — the gap check above says which.
              </p>
            </>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-accent hover:underline">
              Show every row as we read it ({read.rows.length})
            </summary>
            <div className="mt-3">
              <LedgerTable
                rows={read.rows}
                onForget={(key) =>
                  store.update((l) => ({ ...l, statement: removeRows(l.statement ?? [], [key]) }))
                }
              />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
