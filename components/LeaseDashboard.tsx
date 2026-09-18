"use client";

import Link from "next/link";
import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import type { Lease } from "@/lib/au/lease";
import { leaseProgress } from "@/lib/au/leaseProgress";
import type { Finding, FindingSeverity } from "@/lib/au/quote";
import { useMemo, useState } from "react";

/**
 * A lease that is running, not one being chosen.
 *
 * The page's whole reason for existing changes at the signature. Before it,
 * everything is a comparison: three columns, a crossover rate, what a
 * different car would do. After it there is one lease, the terms are settled,
 * and the questions are about whether it is being administered properly —
 * which is a different job and, on the evidence of every provider portal, one
 * nobody is doing.
 *
 * So the comparison does not get smaller, it gets put away. It is still there
 * and still correct, one click down, because a signed lease is not a reason to
 * lose the reasoning behind it — people go back to it when the first statement
 * arrives and does not look like the quote.
 *
 * Three cards, in the order the money moves: what has been paid, what is still
 * owed, and what is sitting in the reserve.
 */

const TONE: Record<FindingSeverity, { wrap: string; chip: string }> = {
  critical: { wrap: "border-danger/40 bg-danger-subtle", chip: "bg-danger-subtle text-danger-text" },
  warn: { wrap: "border-warning bg-warning-subtle", chip: "bg-warning-subtle text-warning-text" },
  ok: { wrap: "border-line bg-panel", chip: "bg-accent-subtle text-accent" },
};

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

/** How far through the term, drawn from payments rather than from the calendar
 *  — the debt only moves when money does. */
function Progress({ made, of }: { made: number; of: number }) {
  const pct = of > 0 ? Math.min(100, (made / of) * 100) : 0;
  return (
    <div className="mt-3">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-panel-2"
        role="progressbar"
        aria-valuenow={made}
        aria-valuemin={0}
        aria-valuemax={of}
        aria-label={`${made} of ${of} payments made`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        {made} of {of} payments · {Math.round(pct)}% of the term
      </p>
    </div>
  );
}

export default function LeaseDashboard({
  lease,
  config,
  quoteLabel,
  onUnlock,
}: {
  lease: Lease;
  config: EngineConfig;
  quoteLabel: string;
  onUnlock: () => void;
}) {
  const [undoing, setUndoing] = useState(false);
  const progress = useMemo(() => leaseProgress(lease, config), [lease, config]);
  if (!progress.active) return null;

  const { payments, paydown, reserve, findings } = progress;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Your lease with {quoteLabel}</h2>
          <span className="text-xs text-muted">
            {progress.commencementDate
              ? `Started ${progress.commencementDate}`
              : "Start date not set"}
          </span>
        </div>

        {/* The way out of the mode, on the mode.
        
            Unlocking was already possible and lived inside "The arrangement",
            which is now one click down in a disclosure — so the only way back
            from a lease locked by mistake was through the thing you would open
            only if you already knew it was there. A mode you cannot see how to
            leave is a trap, however easy the leaving turns out to be.
        
            Two steps, because it changes what the whole page is for, and worth
            saying plainly that it destroys nothing: the quote, the figures and
            the statement log all stay exactly where they are. */}
        {undoing ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-subtle">
            <span>
              Go back to comparing quotes? Nothing is deleted — {quoteLabel}, your figures and
              your statement log all stay.
            </span>
            <button
              type="button"
              onClick={onUnlock}
              className="font-semibold text-accent hover:underline"
            >
              Yes, unlock it
            </button>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={() => setUndoing(false)}
              className="hover:text-ink"
            >
              Cancel
            </button>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setUndoing(true)}
            className="mt-2 text-xs font-medium text-accent hover:underline"
          >
            Not signed with them? Unlock and keep comparing
          </button>
        )}

        {payments && (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Figure
                label="Paid to the financier"
                value={fmtCurrency(payments.paidToDate)}
                note={`${payments.made} payment${payments.made === 1 ? "" : "s"} logged`}
                strong
              />
              <Figure
                label="Each month"
                value={payments.expected != null ? fmtCurrency(payments.expected) : "—"}
                note="fixed for the term"
              />
              <Figure
                label="Still owing"
                value={paydown?.now ? fmtCurrency(paydown.now.balance) : "—"}
                note={
                  paydown?.residualPayable != null
                    ? `lands on ${fmtCurrency(paydown.residualPayable)}, not zero`
                    : undefined
                }
              />
            </div>
            <Progress made={payments.made} of={payments.termMonths} />
          </>
        )}
      </section>

      {paydown?.now && (
        <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold text-ink">What you have actually paid off</h2>
          <p className="mt-1 max-w-2xl text-sm text-subtle">
            Every payment splits between the debt and the interest, and early on it is mostly
            interest — which is why the balance moves so little at first.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Figure
              label="Debt retired"
              value={fmtCurrency(paydown.now.principalPaid)}
              note="off what you borrowed"
            />
            <Figure
              label="Interest paid"
              value={fmtCurrency(paydown.now.interestPaid)}
              note={paydown.ratePct != null ? `at ${paydown.ratePct.toFixed(2)}%` : undefined}
            />
            <Figure
              label="Residual due at the end"
              value={paydown.residualPayable != null ? fmtCurrency(paydown.residualPayable) : "—"}
              note="GST included — what has to be found on the day"
            />
          </div>
          {/* The split, drawn. Two numbers side by side do not carry how
              lopsided it is; a bar does. */}
          {paydown.now.principalPaid + paydown.now.interestPaid > 0 && (
            <div className="mt-4">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full bg-accent"
                  style={{
                    width: `${(paydown.now.principalPaid / (paydown.now.principalPaid + paydown.now.interestPaid)) * 100}%`,
                  }}
                />
                <div className="h-full flex-1 bg-warning" />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Of {fmtCurrency(paydown.now.principalPaid + paydown.now.interestPaid)} paid so far,
                the darker part came off the debt and the rest was interest.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">The reserve they hold</h2>
          <Link
            href="/understand-your-statement"
            className="text-xs font-semibold text-accent hover:underline"
          >
            {reserve ? "Add more transactions" : "Paste your statement"}
          </Link>
        </div>
        {reserve ? (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Figure
                label="Held for you"
                value={reserve.balance != null ? fmtCurrency(reserve.balance) : "—"}
                note="your pay, not yet spent on the car"
                strong
              />
              <Figure
                label="Out of your pay"
                value={fmtCurrency(reserve.contributed)}
                note={`over ${reserve.span} month${reserve.span === 1 ? "" : "s"} logged`}
              />
              <Figure
                label="Transactions"
                value={String(reserve.rows.length)}
                note={
                  reserve.rows.length > 0
                    ? `to ${reserve.rows.at(-1)!.date}`
                    : undefined
                }
              />
            </div>
          </>
        ) : (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-subtle">
            Your provider holds an account with your money in it and pays the car&apos;s bills out
            of it. Paste the transactions from their portal and this tracks the balance, checks
            every payment against the quote above, and says whether the reserve is building up or
            running down.
          </p>
        )}
      </section>

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
