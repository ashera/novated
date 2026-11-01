"use client";

import { useMemo } from "react";
import { fmtCurrencyCents } from "@/lib/au/format";
import { reconcileGst, type RemittanceRow } from "@/lib/au/remittance";
import { financialYearOfIso, financialYearRange } from "@/lib/au/financialYear";
import { rowKey } from "@/lib/au/statementLog";
import type { StatementRow } from "@/lib/au/statement";

/**
 * The employer's GST against the provider's, side by side.
 *
 * A novated lease runs GST through three parties and the portal shows one of
 * them. The employer claims the credit on the rental and the fees and pays it
 * across; the provider credits it to the lease account; only that last step
 * appears on the statement. Two questions therefore cannot be answered from
 * the portal alone — has everything remitted actually arrived, and how long
 * did it take — and on the lease this was built against the answers were no
 * and five months.
 *
 * Read-only. Pairing is worked out rather than stored (except where somebody
 * has pinned one), so this renders the same answer wherever it is shown and
 * there is no second copy of the rule to drift.
 */

export default function GstReconciliation({
  ledger,
  remittances,
  onPin,
  financialYear,
}: {
  ledger: StatementRow[];
  remittances: RemittanceRow[];
  /**
   * Fix or clear a pairing. Omitted where the rows are not the reader's to
   * change — the accountant's copy shows the working, it does not edit it.
   */
  onPin?: (remittance: RemittanceRow, matchKey: string | null | undefined) => void;
  /**
   * Show only the payments made in this financial year. Null shows all of them.
   *
   * A filter on the VIEW, never on the reconciliation. The pairing runs across
   * everything either way, because the two sides routinely fall in different
   * years — a payment made in June 2026 was credited in August, which is the
   * next one — and reconciling only what is inside the window would report
   * that payment as never credited. It is the lag this page exists to show
   * that makes the distinction matter.
   */
  financialYear?: string | null;
}) {
  /* Across everything. See the note on `financialYear`. */
  const rec = useMemo(
    () => reconcileGst(ledger, remittances, rowKey),
    [ledger, remittances],
  );
  if (remittances.length === 0) return null;

  const fy = financialYear ?? null;
  const window = fy ? financialYearRange(fy) : null;
  const within = (iso: string) =>
    window == null || (iso >= window.from && iso <= window.to);

  /* Payments are the subject, so the year a pair belongs to is the year it was
     PAID in — not the year the credit landed, which may be a later one and is
     the thing being measured. */
  const pairs = rec.pairs.filter((p) => within(p.remittance.date));
  const unmatchedCredits = rec.unmatchedCredits.filter((c) => within(c.date));
  const shownRemitted = pairs.reduce((t, p) => t + p.remittance.amount, 0);
  const shownCredited =
    pairs.reduce((t, p) => t + (p.credit?.amount ?? 0), 0) +
    unmatchedCredits.reduce((t, c) => t + c.amount, 0);
  const crossesYear = pairs.some(
    (p) => p.credit != null && financialYearOfIso(p.credit.date) !== financialYearOfIso(p.remittance.date),
  );

  const credits = ledger.filter((r) => r.kind === "gst-credit" && r.amount > 0);
  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="space-y-4">
      {/* The two explanations worth leading with, where they apply. Both are
          one sentence because both are one fact repeated down the table, and
          repeating them on every row is how a reader stops reading them. */}
      {rec.commonDifference != null && Math.abs(rec.commonDifference) > 0.005 && (
        <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs leading-relaxed text-subtle">
          Every matched payment is{" "}
          <strong className="text-ink">
            {fmtCurrencyCents(Math.abs(rec.commonDifference))}
          </strong>{" "}
          {rec.commonDifference > 0 ? "more than" : "less than"} the credit that answers it —
          the same amount each time, so it is a component the employer remits and the
          provider credits separately rather than a discrepancy. On most leases it is the GST
          on the management fee.
        </p>
      )}

      {rec.worstLagDays != null && rec.worstLagDays > 45 && (
        <p className="rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-xs leading-relaxed text-warning-text">
          The longest a payment waited to reach the lease account was{" "}
          <strong>{rec.worstLagDays} days</strong>. Until a credit lands, the account is short
          by that much and the employee&apos;s own contributions are covering it — worth asking
          the provider when credits are passed through.
        </p>
      )}

      {pairs.length === 0 && (
        <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs leading-relaxed text-subtle">
          No employer GST payments were made in {fy}. Choose another year, or &ldquo;All
          years&rdquo;, to see the ones on record.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-medium">Employer paid</th>
              <th className="pb-2 pr-6 text-right font-medium">Amount</th>
              <th className="pb-2 font-medium">Credited to the lease</th>
              <th className="pb-2 text-right font-medium">Amount</th>
              <th className="pb-2 text-right font-medium">Difference</th>
              <th className="pb-2 text-right font-medium">Lag</th>
              {onPin && <th className="pb-2 text-right font-medium">Pairing</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pairs.map((p, i) => (
              <tr key={`${p.remittance.date}-${p.remittance.amount}-${i}`}>
                <td className="py-2 text-subtle">{fmtDate(p.remittance.date)}</td>
                <td className="py-2 pr-6 text-right tabular-nums text-ink">
                  {fmtCurrencyCents(p.remittance.amount)}
                </td>
                <td className="py-2 text-subtle">
                  {p.credit ? (
                    fmtDate(p.credit.date)
                  ) : (
                    <span className="text-warning-text">not yet credited</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {p.credit ? fmtCurrencyCents(p.credit.amount) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-subtle">
                  {p.credit ? fmtCurrencyCents(p.difference) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-subtle">
                  {p.lagDays == null ? "—" : `${p.lagDays}d`}
                </td>
                {onPin && (
                  <td className="py-2 text-right">
                    {/* The override. A worked-out pairing is a guess with a
                        rule behind it, and the person holding both documents
                        can see when it is wrong — so they can move it, and
                        what they choose outranks the rule from then on. */}
                    <select
                      aria-label={`Pairing for the payment on ${p.remittance.date}`}
                      className="max-w-[12rem] rounded border border-line bg-panel px-1.5 py-1 text-xs text-ink"
                      value={
                        p.remittance.matchKey === null
                          ? "none"
                          : p.remittance.matchKey ?? "auto"
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        onPin(p.remittance, v === "auto" ? undefined : v === "none" ? null : v);
                      }}
                    >
                      <option value="auto">Worked out{p.pinned ? "" : " ✓"}</option>
                      <option value="none">Pairs with nothing</option>
                      {credits.map((c) => (
                        <option key={rowKey(c)} value={rowKey(c)}>
                          {fmtDate(c.date)} · {fmtCurrencyCents(c.amount)}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unmatchedCredits.length > 0 && (
        <div className="rounded-lg border border-line bg-panel-2 p-3">
          <p className="text-xs font-semibold text-ink">
            Credits with no payment to account for them
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Either the export does not cover the period they belong to, or they are credits for
            something other than the rental — GST on insurance or servicing comes back the same
            way.
          </p>
          <ul className="mt-2 space-y-1">
            {unmatchedCredits.map((c, i) => (
              <li
                key={`${c.date}-${c.amount}-${i}`}
                className="flex justify-between gap-4 text-xs tabular-nums text-subtle"
              >
                <span>{fmtDate(c.date)}</span>
                <span className="font-medium text-ink">{fmtCurrencyCents(c.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
        {(
          [
            [
              fy ? `Employer remitted in ${fy}` : "Employer remitted",
              fmtCurrencyCents(fy ? shownRemitted : rec.totalRemitted),
            ],
            [
              fy ? `Credited against those payments` : "Credited to the lease",
              fmtCurrencyCents(fy ? shownCredited : rec.totalCredited),
            ],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between gap-4 border-b border-line py-2"
          >
            <dt className="text-sm text-subtle">{k}</dt>
            <dd className="text-sm font-medium tabular-nums text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {/*
        * The totals are only comparable when both sides cover the same
        * period. An export ending in June against a ledger running to October
        * shows a shortfall that is only the window, and a reader given a
        * single "outstanding" figure would draw exactly the wrong conclusion
        * from it — so where the windows differ, the figure is withheld and
        * the reason given instead.
        */}
      {fy ? (
        <p className="text-xs leading-relaxed text-muted">
          Showing the {pairs.length} payment{pairs.length === 1 ? "" : "s"} made in {fy}
          {crossesYear
            ? ", with the credit that answers each one — some of which landed in the following year, which is what the lag column is showing."
            : "."}{" "}
          Pairing is worked out across the whole record, so a credit is never reported missing
          merely because it fell outside the year.
        </p>
      ) : rec.windowsComparable ? (
        <p className="text-xs leading-relaxed text-muted">
          Across the same period, the employer remitted{" "}
          {fmtCurrencyCents(rec.totalRemitted)} and{" "}
          {fmtCurrencyCents(rec.totalCredited)} reached the lease account — a difference of{" "}
          <strong className="text-ink">{fmtCurrencyCents(Math.abs(rec.outstanding))}</strong>.
        </p>
      ) : (
        rec.remittanceWindow &&
        rec.creditWindow && (
          <p className="text-xs leading-relaxed text-muted">
            These totals are not a like-for-like comparison: the export covers{" "}
            {fmtDate(rec.remittanceWindow.from)} to {fmtDate(rec.remittanceWindow.to)}, while
            the statement runs {fmtDate(rec.creditWindow.from)} to{" "}
            {fmtDate(rec.creditWindow.to)}. Export the same period from both to compare the
            totals directly; the pairing above is unaffected.
          </p>
        )
      )}
    </div>
  );
}
