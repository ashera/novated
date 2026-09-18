"use client";

import { useMemo, useState } from "react";
import { parseStatement, readStatement, type RowKind, type StatementRow } from "@/lib/au/statement";
import type { EngineConfig } from "@/lib/au/config";
import type { Finding, FindingSeverity } from "@/lib/au/quote";
import { fmtCurrency } from "@/lib/au/format";
import { track } from "@/lib/analytics";

/**
 * Paste the ledger, read the account.
 *
 * A paste box rather than a form, because a statement is forty rows and
 * nobody is typing forty rows. It is also the one input that works across
 * providers without knowing any of their templates: whatever the portal
 * renders, selecting it and copying gives text with a date, a description and
 * some money on each row, and that is all the parser needs.
 *
 * Nothing is uploaded. The parsing and the arithmetic happen in this
 * component, in the browser, which is worth saying on the page — people are
 * reasonably wary of pasting a financial document into a website, and the
 * honest answer is that it never leaves the machine.
 */

const TONE: Record<FindingSeverity, { wrap: string; chip: string }> = {
  critical: { wrap: "border-danger/40 bg-danger-subtle", chip: "bg-danger-subtle text-danger-text" },
  warn: { wrap: "border-warning bg-warning-subtle", chip: "bg-warning-subtle text-warning-text" },
  ok: { wrap: "border-line bg-panel", chip: "bg-accent-subtle text-accent" },
};

const KIND_LABEL: Record<RowKind, string> = {
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

export default function StatementReader({ config }: { config: EngineConfig }) {
  const [text, setText] = useState("");

  const parsed = useMemo(() => parseStatement(text), [text]);
  const read = useMemo(
    () => (parsed.rows.length > 0 ? readStatement(parsed.rows, config) : null),
    [parsed.rows, config],
  );

  const load = () => {
    setText(SAMPLE);
    track("Statement sample loaded");
  };

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
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => parsed.rows.length > 0 && track("Statement pasted", { rows: String(parsed.rows.length) })}
          rows={8}
          spellCheck={false}
          placeholder={"11 September 2026\tFunds from Payroll\t$1,698.98\t$2,665.26\n…"}
          className="mt-3 w-full rounded-lg border border-line bg-panel-2 p-3 font-mono text-xs leading-relaxed text-ink outline-none focus:border-accent"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {text ? (
            <button type="button" onClick={() => setText("")} className="font-semibold text-accent hover:underline">
              Clear
            </button>
          ) : (
            <button type="button" onClick={load} className="font-semibold text-accent hover:underline">
              Try it with an example statement
            </button>
          )}
          {parsed.rows.length > 0 && (
            <span className="text-muted">
              {parsed.rows.length} rows read
              {parsed.skipped.length > 0 && `, ${parsed.skipped.length} lines ignored`}
            </span>
          )}
        </div>
      </div>

      {read && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Balance"
              value={read.closingBalance != null ? fmtCurrency(read.closingBalance) : "—"}
              note={read.to ? `as at ${read.to}` : undefined}
            />
            <Stat
              label="Going in"
              value={`${fmtCurrency(read.inPerMonth)}/mo`}
              note="pay and GST credits"
            />
            <Stat
              label="Coming out"
              value={`${fmtCurrency(read.outPerMonth)}/mo`}
              note="finance, running costs, fees"
            />
            <Stat
              label={read.driftPerMonth >= 0 ? "Building up" : "Running down"}
              value={`${read.driftPerMonth >= 0 ? "+" : "−"}${fmtCurrency(Math.abs(read.driftPerMonth))}/mo`}
              note={`over ${read.months < 1.5 ? "under a month" : `${Math.round(read.months)} months`}`}
            />
          </div>

          <h2 className="mt-8 text-base font-semibold text-ink">What the statement says</h2>
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
                        {fmtCurrency(total / read.months)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-accent hover:underline">
              Show every row as we read it ({read.rows.length})
            </summary>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-panel">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Description</th>
                    <th className="px-3 py-2 font-semibold">Read as</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="px-3 py-2 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {read.rows.map((r: StatementRow, i) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {parsed.skipped.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Ignored {parsed.skipped.length} line{parsed.skipped.length === 1 ? "" : "s"} with no
              date or no amount — headers, page counters and the like. If one of them was a
              transaction, the totals above are short by it.
            </p>
          )}
        </>
      )}
    </div>
  );
}
