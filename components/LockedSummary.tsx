"use client";

import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import {
  PAY_CYCLE_LABEL,
  effectivePayCycle,
  type LeaseInputs,
  type LeaseResult,
} from "@/lib/au/novated";

/**
 * The settled terms, once a quote is locked in.
 *
 * Replaces the two input cards rather than disabling them. A column of greyed
 * sliders is an invitation to fight the page; these are facts now — taken from
 * the quote the user chose — so they read as a record of the arrangement, the
 * way the rest of the page below it does.
 *
 * Everything here still comes from the lease, so unlocking puts the controls
 * back exactly as they were.
 */

function Item({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
      {note && <p className="text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}

export default function LockedSummary({
  inputs,
  result,
  config,
  quoteLabel,
  onUnlock,
}: {
  inputs: LeaseInputs;
  result: LeaseResult;
  config: EngineConfig;
  quoteLabel: string;
  onUnlock: () => void;
}) {
  const cycle = effectivePayCycle(inputs.payCycle, config);
  const { finance, running } = result;

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">The arrangement</h3>
        <button
          type="button"
          onClick={onUnlock}
          className="text-xs font-medium text-accent hover:underline"
        >
          Unlock to change
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Settled from {quoteLabel}. Unlock to go back to trying different numbers.
      </p>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <Item
          label="Gross salary"
          value={fmtCurrency(inputs.salary)}
          note="Before tax, excluding super"
        />
        <Item label="You're paid" value={PAY_CYCLE_LABEL[cycle]} />
        <Item
          label="Term"
          value={`${inputs.termYears} year${inputs.termYears === 1 ? "" : "s"}`}
        />

        {/* The two figures that decide what the repayments are: what is
            borrowed, and what it costs to borrow it. The rate is the one no
            provider prints, so it is the whole reason the decoder exists —
            it belongs on the summary of what was agreed. */}
        <Item
          label="Amount financed"
          value={fmtCurrency(finance.amountFinanced)}
          note={
            finance.onRoadCosts > 0
              ? `${fmtCurrency(finance.driveAwayTotal)} drive-away, less the ${fmtCurrency(finance.gstCredit)} GST credit`
              : `${fmtCurrency(finance.priceInclGst)} less the ${fmtCurrency(finance.gstCredit)} GST credit`
          }
        />
        <Item
          label="Interest rate"
          value={`${inputs.interestRatePct.toFixed(2)}%`}
          note={`What you're paying — solved from ${quoteLabel}`}
        />
        <Item
          label="Residual"
          value={fmtCurrency(finance.residual)}
          note={`${finance.residualPct.toFixed(2)}% of the amount financed`}
        />
        {/* The amount either way. Unpackaged running costs do not go away —
            they move to your take-home pay, with GST on top — so showing the
            figure only when it is inside the lease would flatter it. */}
        <Item
          label="Running costs"
          value={`${fmtCurrency(running.total)} a year`}
          note={
            inputs.includeRunningCosts
              ? "Packaged — fuel, servicing, tyres, rego and insurance"
              : `Not packaged — about ${fmtCurrency(running.total * (1 + config.gst.rate))} with GST, from your take-home pay`
          }
        />

        <Item
          label="FBT"
          value={
            result.fbt.exempt
              ? "Exempt"
              : inputs.fbtMethod === "ecm"
                ? "Employee contribution"
                : "Employer pays"
          }
          note={
            result.fbt.exempt
              ? "Eligible electric vehicle"
              : inputs.fbtMethod === "ecm"
                ? "Paid from post-tax salary, so FBT is nil"
                : "Added to your deduction"
          }
        />
        <Item
          label="Study loan"
          value={inputs.hasHelpDebt ? "Yes" : "No"}
          note={inputs.hasHelpDebt ? "Counted in the repayment figures" : undefined}
        />
        <Item
          label="Management fee"
          value={`${fmtCurrency(inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual)} a year`}
          note={inputs.adminFeeAnnual != null ? `From ${quoteLabel}` : "Our benchmark"}
        />
      </dl>
    </section>
  );
}
