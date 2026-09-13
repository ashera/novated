"use client";

import { fmtCurrency } from "@/lib/au/format";
import { exitSchedule, worstExit } from "@/lib/au/exit";
import type { LeaseResult } from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";

/**
 * What it costs to stop.
 *
 * Every other card here describes a lease where nothing goes wrong: the job
 * lasts, the car is kept, the residual is paid on the day it falls due. This
 * is the one that describes the other outcome, and it is the one that decides
 * whether a lease is a good idea for a particular person rather than in the
 * abstract. Redundancy, a move, unpaid leave and a write-off are not exotic —
 * over five years they are ordinary.
 *
 * Two things make it worth a card rather than a warning.
 *
 * The first is that the pre-tax benefit stops instantly and the obligation
 * does not. Everything above this on the page is denominated in pre-tax
 * dollars, where a dollar of cost is sixty-eight cents of pay. A termination
 * shortfall is not: it comes out of money already taxed, so the figures in
 * this table are worth roughly half as much again as the ones above them.
 *
 * The second is the payout convention, which has no single answer. Some
 * financiers rebate the interest you have not yet been charged; others want
 * every remaining rental plus the residual. On a five-year lease ended in year
 * two those are very different numbers, and which one applies is in a contract
 * nobody reads until they need to. Both are shown, neither is presented as the
 * answer, and the question to ask is stated outright.
 */
export default function EarlyExit({
  result,
  config,
}: {
  result: LeaseResult;
  config: EngineConfig;
}) {
  const points = exitSchedule(result, config);
  if (points.length === 0) return null;
  const worst = worstExit(points)!;
  const anyShort = points.some((p) => p.short);

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-base font-semibold text-ink">If it ends early</h3>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        The novation is the part your employer is in, and it ends when the job does. The lease
        doesn&apos;t — it reverts to you in full, and from that point it comes out of pay that
        has already been taxed.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-medium">If you stopped after</th>
              <th className="pb-2 text-right font-medium">Still owed</th>
              <th className="pb-2 text-right font-medium">Car likely worth</th>
              <th className="pb-2 text-right font-medium">Out of your pocket</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {points.map((p) => (
              <tr key={p.month} className={p.month === worst.month ? "bg-danger-subtle/40" : ""}>
                <td className="py-2 text-subtle">
                  {p.year} year{p.year === 1 ? "" : "s"}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {fmtCurrency(p.payoutBest)}
                  <span className="block text-[11px] font-normal text-muted">
                    up to {fmtCurrency(p.payoutWorst)}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {fmtCurrency(p.resale.value)}
                  <span className="block text-[11px] font-normal text-muted">
                    {fmtCurrency(p.resale.low)}–{fmtCurrency(p.resale.high)}
                  </span>
                </td>
                <td
                  className={`py-2 text-right font-semibold tabular-nums ${
                    p.short ? "text-danger-text" : "text-success-text"
                  }`}
                >
                  {p.short ? fmtCurrency(p.shortfallBest) : "nothing"}
                  {p.short && (
                    <span className="block text-[11px] font-normal text-muted">
                      up to {fmtCurrency(p.shortfallWorst)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel-2 px-3.5 py-3">
          <p className="text-sm text-subtle">
            {anyShort ? (
              <>
                <strong className="text-ink">
                  The worst point is {worst.year} year{worst.year === 1 ? "" : "s"} in, at about{" "}
                  {fmtCurrency(worst.shortfallBest)}.
                </strong>{" "}
                {/* Where the peak falls depends on the car and the residual,
                    so the explanation has to follow the data rather than
                    assert a shape it may not have. */}
                {worst.month === points[0].month
                  ? "The car takes its biggest hit the moment it is driven away, and the balance has barely moved — so the exposure is at its worst almost immediately and improves from there."
                  : "The car takes its biggest hit immediately while the balance has barely moved, so the gap is widest in the middle rather than at either end."}
              </>
            ) : (
              <>
                <strong className="text-ink">
                  On these figures the car covers the payout at every point.
                </strong>{" "}
                That is unusual and worth not relying on — it turns on a resale estimate, and the
                model you buy matters more than the average.
              </>
            )}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-panel-2 px-3.5 py-3">
          <p className="text-sm text-subtle">
            <strong className="text-ink">It is post-tax money.</strong> Every other figure on this
            page is a pre-tax dollar, worth about {(100 - result.package.effectiveReliefRate * 100).toFixed(0)}
            c of your pay. A shortfall here is worth a full dollar, so it hurts roughly half as
            much again as the same number above.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-xs leading-relaxed text-muted">
        <li>
          <strong className="text-subtle">Two payout conventions, and yours is in the contract.</strong>{" "}
          The first figure assumes the financier rebates interest you haven&apos;t been charged
          yet. The second assumes you pay every remaining rental plus the residual. Ask which one
          applies before you sign, not after — it is the difference between{" "}
          {fmtCurrency(worst.payoutBest)} and {fmtCurrency(worst.payoutWorst)} at the worst point.
        </li>
        <li>
          <strong className="text-subtle">A termination fee is not in these numbers.</strong> Most
          providers charge one. It is small next to the figures above, but it is real.
        </li>
        <li>
          <strong className="text-subtle">You may not have to stop.</strong> A new employer can
          take over the novation, and some providers let you keep paying directly in between. Both
          beat selling into a shortfall — but re-signing anything starts a new arrangement under
          whatever the tax rules are on that day.
        </li>
        <li>
          <strong className="text-subtle">A write-off works the same way.</strong> Insurance pays
          what the car is worth, not what is owed on it, and the difference is yours. That gap is
          what gap insurance covers, and this table is how you decide whether it is worth buying.
        </li>
      </ul>
    </section>
  );
}
