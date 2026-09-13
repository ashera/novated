"use client";

import { fmtCurrency } from "@/lib/au/format";
import type { LeaseResult } from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";

/**
 * The cost that never appears on a payslip.
 *
 * A car salary sacrifice reduces the ordinary earnings the super guarantee is
 * calculated on, so the employer's contribution falls. That is lawful — the
 * 2020 change that stopped salary sacrifice eroding super covers amounts
 * sacrificed INTO super, and the Payday Super rules of July 2026 kept car
 * sacrifice outside it — and it is completely invisible. It is not on the
 * payslip, not in the quote, and not in any provider's calculator.
 *
 * Presented on its own and never folded into a cash figure. Forgone super is
 * not the same as forgone pay: it would have been taxed at 15% going in,
 * locked up until preservation age, and then compounded for however long that
 * is. Adding it to "net cost" would be exactly the conflation this site
 * exists to argue against — so the card states it, sizes it, and leaves the
 * reader to weigh it.
 *
 * The toggle matters more than it looks. Plenty of employment agreements
 * promise super on pre-packaging salary, and for those people this whole card
 * is zero. Assuming either way would be wrong for half the audience.
 */
export default function SuperImpact({
  result,
  config,
  onEmployerPays,
}: {
  result: LeaseResult;
  config: EngineConfig;
  /** Omit to render without the control — the printed report has no toggles. */
  onEmployerPays?: (v: boolean) => void;
}) {
  const s = result.superannuation;
  const years = result.inputs.termYears;
  const rate = config.super.guaranteeRatePct;

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-base font-semibold text-ink">What it does to your super</h3>

      {s.protectedByAgreement ? (
        <p className="mt-1 max-w-3xl text-sm text-subtle">
          <strong className="text-success-text">Nothing</strong>, on this setting. Your employer
          works out the {rate}% guarantee on your salary before packaging, so the sacrifice
          doesn&apos;t reduce it. That is worth{" "}
          <strong className="text-ink">{fmtCurrency(s.before - (s.after - s.forgone))}</strong> a
          year against the default — worth confirming it is actually in your agreement.
        </p>
      ) : s.forgone === 0 ? (
        <p className="mt-1 max-w-3xl text-sm text-subtle">
          <strong className="text-success-text">Nothing here.</strong> Your salary is above the{" "}
          {fmtCurrency(config.super.maxContributionBase)} maximum contribution base even after
          packaging, so the guarantee is capped either way and reducing your earnings changes
          nothing.
        </p>
      ) : (
        <>
          <p className="mt-1 max-w-3xl text-sm text-subtle">
            A car sacrifice lawfully reduces the earnings your employer works the {rate}%
            guarantee out on. It is not on your payslip and not on any quote.
          </p>

          <dl className="mt-4 max-w-md space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-subtle">Super without the lease</dt>
              <dd className="tabular-nums text-ink">{fmtCurrency(s.before)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-subtle">Super with it</dt>
              <dd className="tabular-nums text-ink">{fmtCurrency(s.after)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5 font-semibold text-ink">
              <dt>Contributions never made</dt>
              <dd className="tabular-nums text-danger-text">{fmtCurrency(s.forgone)} a year</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
              <dt>Over {years} years</dt>
              <dd className="tabular-nums">{fmtCurrency(s.forgone * years)}</dd>
            </div>
          </dl>

          {s.cappedOut && (
            <p className="mt-3 max-w-3xl text-xs text-muted">
              Part of your salary is above the{" "}
              {fmtCurrency(config.super.maxContributionBase)} maximum contribution base, where no
              guarantee is owed at all — so only the part of the sacrifice that drops you below
              it costs anything.
            </p>
          )}

          <p className="mt-3 max-w-3xl rounded-lg border border-line bg-panel-2 px-3.5 py-3 text-sm text-subtle">
            <strong className="text-ink">This is not the same as losing the cash.</strong> Those
            contributions would have gone in taxed at 15% rather than your marginal rate, and been
            locked away until preservation age — so they are worth less than{" "}
            {fmtCurrency(s.forgone)} in your hand today, and a good deal more than that by the
            time you could spend it. It is deliberately kept out of every cost figure on this
            page rather than blended into one.
          </p>
        </>
      )}

      {onEmployerPays && (
        <label className="mt-4 flex max-w-3xl items-start gap-2.5">
          <input
            type="checkbox"
            checked={result.inputs.employerPaysSuperOnPreSacrifice === true}
            onChange={(e) => onEmployerPays(e.target.checked)}
            className="mt-0.5 accent-[var(--color-accent)]"
          />
          <span className="text-sm text-ink">
            My employer pays super on my salary before packaging
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
              They don&apos;t have to, and most don&apos;t — but plenty of agreements say they
              will. It is in your employment contract or your packaging policy, and on these
              figures it is worth {fmtCurrency(Math.max(s.forgone, 0) * years)} over the term.
            </span>
          </span>
        </label>
      )}
    </section>
  );
}
