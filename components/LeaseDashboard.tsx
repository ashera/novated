"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import type { Lease } from "@/lib/au/lease";
import { leaseProgress } from "@/lib/au/leaseProgress";
import { byMonth, removeRows, type LoggedRow } from "@/lib/au/statementLog";
import type { RowKind } from "@/lib/au/statement";
import type { Finding, FindingSeverity } from "@/lib/au/quote";
import StatementPaste, { ClearLedger } from "./StatementPaste";
import LedgerTable, { KIND_LABEL } from "./LedgerTable";

/**
 * One tracker, not three cards.
 *
 * The dashboard began as three sections — payments, paydown, reserve — which
 * read as three unrelated summaries of the same lease with a lot of white
 * space between them, and put the thing that makes any of it work (pasting the
 * statement) behind a link to another page.
 *
 * It is one financial tracker now, in the order somebody actually asks: what
 * is this costing me, how much of it have I paid off, and what is in the
 * account they hold. The ledger is built here rather than elsewhere, because
 * the figures are worthless without it and a page that needs an ingredient
 * should be where you add the ingredient.
 *
 * Three charts, each earning its place by showing something a number cannot.
 * The paydown is a curve that lands on the residual rather than on zero. The
 * reserve is a line whose SLOPE is the finding — level is fine, falling means
 * a deduction rise is coming. The categories are a bar chart because the
 * question is which one is biggest, and that is what bars answer.
 */

const TONE: Record<FindingSeverity, { wrap: string; chip: string }> = {
  critical: { wrap: "border-danger/40 bg-danger-subtle", chip: "bg-danger-subtle text-danger-text" },
  warn: { wrap: "border-warning bg-warning-subtle", chip: "bg-warning-subtle text-warning-text" },
  ok: { wrap: "border-line bg-panel", chip: "bg-accent-subtle text-accent" },
};

/** The running costs, which are the half a driver has some say over. */
const RUNNING: RowKind[] = ["fuel", "insurance", "registration", "maintenance", "tyres", "roadside", "fee"];

const SAMPLE = `11 September 2026\tFunds from Payroll\t$1,698.98\t$2,665.26
7 September 2026\tInsurance - Reimbursement\t-$218.25\t$966.28
4 September 2026\tGST Credits\t$218.25\t$1,184.53
2 September 2026\tInsurance - Reimbursement\t-$643.15\t$966.28
31 August 2026\tMaintenance - Reimbursement\t-$797.90\t$1,609.43
14 August 2026\tLease - Asset Finance Pty Ltd\t-$1,602.81\t$2,407.33
10 August 2026\tGST Credits\t$145.71\t$4,010.14
10 August 2026\tGST Credits\t$145.71\t$3,864.43
10 August 2026\tGST Credits\t$179.62\t$3,281.59
3 August 2026\tFunds from Payroll\t$1,698.98\t$3,101.97
16 July 2026\tRegistration - Reimbursement\t-$634.00\t$1,402.99
15 July 2026\tLease - Asset Finance Pty Ltd\t-$1,602.81\t$2,606.99
2 July 2026\tFunds from Payroll\t$1,698.98\t$4,209.80`;

function Figure({
  label,
  value,
  note,
  strong = false,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-0.5 tabular-nums text-ink ${strong ? "text-2xl font-semibold" : "text-lg font-semibold"}`}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}

const axis = { stroke: "var(--color-muted)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--color-panel)",
  border: "1px solid var(--color-line)",
  borderRadius: 8,
  fontSize: 12,
};

export default function LeaseDashboard({
  lease,
  config,
  quoteLabel,
  onUnlock,
  onAddRows,
}: {
  lease: Lease;
  config: EngineConfig;
  quoteLabel: string;
  onUnlock: () => void;
  onAddRows: (rows: LoggedRow[]) => void;
}) {
  const [undoing, setUndoing] = useState(false);
  /* One panel at a time under the ledger heading: add rows, or look at the
     ones already there. They answer different questions and both are wanted
     often enough that neither should be a page away — and showing both at once
     puts a forty-row table between somebody and the box they came to paste
     into.
  
     Opens on the rows. A ledger somebody has built is a thing to read, and
     hiding it behind a toggle asked them to click to see what they already
     knew was there. Adding is the occasional act; looking is the frequent one.
     Either toggle still collapses to nothing when the charts are what is
     wanted. */
  const [panel, setPanel] = useState<"none" | "add" | "rows">("rows");
  const progress = useMemo(() => leaseProgress(lease, config), [lease, config]);
  const log = useMemo(() => lease.statement ?? [], [lease.statement]);
  const months = useMemo(() => byMonth(log), [log]);

  if (!progress.active) return null;
  const { payments, paydown, reserve, findings } = progress;

  /* The paydown, thinned for drawing. Sixty points is more than a chart this
     size can resolve and more than anyone reads — quarterly keeps the shape,
     which is the only thing it is there for. */
  const paydownData =
    paydown?.schedule
      .filter((pt, i) => i % 3 === 0 || i === paydown.schedule.length - 1)
      .map((pt) => ({ month: pt.month, owing: Math.round(pt.balance) })) ?? [];

  const balanceData = months
    .filter((m) => m.balance != null)
    .map((m) => ({ month: m.month, balance: Math.round(m.balance!) }));

  const categoryData = RUNNING.map((k) => ({
    kind: k,
    label: KIND_LABEL[k],
    spent: Math.round(Math.abs(reserve?.totals[k] ?? 0)),
  }))
    .filter((d) => d.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  return (
    <div className="space-y-6">
      {/* ── The tracker ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Your lease with {quoteLabel}</h2>
          <span className="text-xs text-muted">
            {progress.commencementDate
              ? `Started ${progress.commencementDate}`
              : "Start date not set"}
          </span>
        </div>

        {/* The way out of the mode, on the mode. A mode you cannot see how to
            leave is a trap, however easy the leaving turns out to be. */}
        {undoing ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-subtle">
            <span>
              Go back to comparing quotes? Nothing is deleted — {quoteLabel}, your figures and your
              ledger all stay.
            </span>
            <button type="button" onClick={onUnlock} className="font-semibold text-accent hover:underline">
              Yes, unlock it
            </button>
            <span aria-hidden>·</span>
            <button type="button" onClick={() => setUndoing(false)} className="hover:text-ink">
              Cancel
            </button>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setUndoing(true)}
            className="mt-1 text-xs font-medium text-accent hover:underline"
          >
            Not signed with them? Unlock and keep comparing
          </button>
        )}

        {payments && (
          <>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                label="Paid so far"
                value={fmtCurrency(payments.paidToDate)}
                note={`${payments.made} of ${payments.termMonths} payments`}
                strong
              />
              {/* The figure the ledger actually shows, where those differ.
                  A card reading $1,457 beside a ledger reading $1,602.81 is
                  two numbers for one rental with nothing saying so — and the
                  GST comes back as its own line further down the same ledger. */}
              <Figure
                label="Each month"
                value={
                  payments.basis === "inc-gst" && payments.expectedIncGst != null
                    ? fmtCurrency(payments.expectedIncGst)
                    : payments.expected != null
                      ? fmtCurrency(payments.expected)
                      : "—"
                }
                note={
                  payments.basis === "inc-gst" && payments.expected != null
                    ? `${fmtCurrency(payments.expected)} once the GST comes back`
                    : "fixed for the term"
                }
              />
              <Figure
                label="Still owing"
                value={paydown?.now ? fmtCurrency(paydown.now.balance) : "—"}
                note={
                  paydown?.residualPayable != null
                    ? `lands on ${fmtCurrency(paydown.residualPayable)}`
                    : undefined
                }
              />
              <Figure
                label="In their account"
                value={reserve?.balance != null ? fmtCurrency(reserve.balance) : "—"}
                note={reserve ? "your money, unspent" : "paste your statement below"}
              />
            </div>

            <div className="mt-4">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-panel-2"
                role="progressbar"
                aria-valuenow={payments.made}
                aria-valuemin={0}
                aria-valuemax={payments.termMonths}
                aria-label={`${payments.made} of ${payments.termMonths} payments made`}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${payments.termMonths > 0 ? Math.min(100, (payments.made / payments.termMonths) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {Math.round(
                  payments.termMonths > 0 ? (payments.made / payments.termMonths) * 100 : 0,
                )}
                % of the term · {payments.termMonths - payments.made} payments to go
              </p>
            </div>
          </>
        )}
      </section>

      {/* ── Building the ledger ───────────────────────────────────────────
          Promoted from a link to another page. Everything above and below is
          computed from these rows, so the place to add them is here — and
          until there are any, this is the most useful thing on the page. */}
      <section
        className={`rounded-xl border p-5 shadow-[var(--shadow-card)] ${
          log.length === 0 ? "border-accent-border bg-accent-subtle" : "border-line bg-panel"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">
            {log.length === 0 ? "Start your ledger" : "Your ledger"}
          </h2>
          {log.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="inline-flex overflow-hidden rounded-md border border-line">
                {(
                  [
                    ["add", "Add transactions"],
                    ["rows", `View all ${log.length}`],
                  ] as const
                ).map(([key, text]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={panel === key}
                    onClick={() => setPanel((p) => (p === key ? "none" : key))}
                    className={`px-2.5 py-1 text-xs font-semibold transition ${
                      panel === key
                        ? "bg-accent-subtle text-accent"
                        : "bg-panel text-subtle hover:text-ink"
                    }`}
                  >
                    {text}
                  </button>
                ))}
              </span>
              <ClearLedger count={log.length} onClear={() => onAddRows([])} />
            </span>
          )}
        </div>

        {log.length === 0 ? (
          <StatementPaste
            log={log}
            onMerge={(rows) => {
              onAddRows(rows);
              setPanel("rows");
            }}
            sample={SAMPLE}
          >
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-subtle">
              Your provider holds an account with your money in it and pays the car&apos;s bills
              out of it. Open their portal, select the transactions and paste them here — any
              provider, any order, and pasting the same page twice is fine. Everything on this
              dashboard is worked out from them, and nothing is uploaded. The example below is
              somebody else&apos;s ledger, for seeing what this does — it can be cleared again in
              one click.
            </p>
          </StatementPaste>
        ) : (
          <>
            <p className="mt-1 text-sm text-subtle">
              {log.length} transactions from {log[0].date} to {log.at(-1)!.date}
              {reserve && ` · ${fmtCurrency(reserve.contributed)} out of your pay so far`}
            </p>
            {panel === "add" && (
              <StatementPaste
                log={log}
                onMerge={(rows) => {
                  onAddRows(rows);
                  // Straight to the rows, so the answer to "did that work?" is
                  // the ledger itself rather than a sentence about it.
                  setPanel("rows");
                }}
              >
                <p className="mt-3 text-xs text-muted">
                  Paste the next window from the portal. Anything already here is recognised and
                  left alone, so overlapping pages are fine.
                </p>
              </StatementPaste>
            )}
            {panel === "rows" && (
              <div className="mt-3">
                <LedgerTable
                  rows={log}
                  onForget={(key) => onAddRows(removeRows(log, [key]))}
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* ── What it looks like over time ─────────────────────────────── */}
      {(paydownData.length > 1 || balanceData.length > 1) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {paydownData.length > 1 && (
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">Paying it down</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                The curve lands on the residual, not on zero — and it falls slowly at first,
                because the early payments are mostly interest.
              </p>
              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={paydownData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={axis}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(m: number) => `${m}m`}
                    />
                    <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={48} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [fmtCurrency(v), "Still owing"]}
                      labelFormatter={(m: number) => `Month ${m}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="owing"
                      stroke="var(--color-accent)"
                      fill="var(--color-accent)"
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                    {paydown?.residualPayable != null && paydown.schedule.at(-1) && (
                      <ReferenceLine
                        y={Math.round(paydown.schedule.at(-1)!.balance)}
                        stroke="var(--color-warning)"
                        strokeDasharray="4 4"
                        label={{ value: "Residual", position: "insideBottomRight", fontSize: 10, fill: "var(--color-muted)" }}
                      />
                    )}
                    {/* Where they actually are, which is the point of drawing
                        it on a running lease rather than a prospective one. */}
                    {paydown?.now && (
                      <ReferenceDot
                        x={paydown.now.month}
                        y={Math.round(paydown.now.balance)}
                        r={5}
                        fill="var(--color-accent)"
                        stroke="var(--color-panel)"
                        strokeWidth={2}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {balanceData.length > 1 && (
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">The reserve they hold</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                The slope is the finding. Level is working as intended; falling means a deduction
                rise is coming; climbing means you are pre-paying more than the car needs.
              </p>
              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={balanceData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={48} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [fmtCurrency(v), "Balance"]}
                    />
                    <ReferenceLine y={0} stroke="var(--color-danger)" strokeDasharray="4 4" />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="var(--color-success)"
                      fill="var(--color-success)"
                      fillOpacity={0.12}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Where the running costs go ────────────────────────────────── */}
      {categoryData.length > 0 && reserve && (
        <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold text-ink">Where your running costs went</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
            The finance is fixed for the term. This is the other half — the part a budget can be
            wrong about in either direction, and the part worth arguing over.
          </p>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" horizontal={false} />
                <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={fmtCompact} />
                <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={96} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--color-panel-2)" }}
                  formatter={(v: number) => [fmtCurrency(v), "Spent"]}
                />
                <Bar dataKey="spent" radius={[0, 4, 4, 0]}>
                  {categoryData.map((d) => (
                    <Cell key={d.kind} fill="var(--color-accent)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {fmtCurrency(categoryData.reduce((t, d) => t + d.spent, 0) / reserve.span)} a month
            across {reserve.span} month{reserve.span === 1 ? "" : "s"} of ledger.
          </p>
        </section>
      )}

      {findings.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink">What to look at</h2>
          <ul className="mt-3 space-y-3">
            {findings.map((f: Finding) => (
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
        </section>
      )}
    </div>
  );
}
