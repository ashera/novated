import { fmtCurrency, fmtCurrencyCents } from "@/lib/au/format";
import {
  PAY_CYCLES_PER_YEAR,
  PAY_CYCLE_NOUN,
  effectivePayCycle,
  type FbtOutcome,
  type LeaseFinance,
  type LeaseInputs,
  type PackageBreakdown,
  type RunningCostBreakdown,
} from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";

/**
 * What the employer takes out of the pay, itemised.
 *
 * Lifted out of the calculator because a second reader turned up for it: the
 * owner, who wants to know what the figure is made of, and their accountant,
 * who is reconciling it against a payslip. Two surfaces rendering the same
 * table from two copies of the markup is how they start disagreeing, and a
 * breakdown that disagrees with the page it was shared from is worse than no
 * breakdown at all.
 *
 * The only difference between the two readings is the per-cycle column. The
 * owner is deciding and thinks in years; the accountant is reconciling and
 * needs the number that actually appears on the payslip, to the cent — see
 * the note on `showCycle`.
 */

function Row({
  label,
  value,
  side,
  indent = false,
  cycles,
}: {
  label: string;
  value: number;
  side: "Pre-tax" | "Post-tax" | null;
  indent?: boolean;
  cycles: number | null;
}) {
  return (
    <tr>
      <td className={`py-2 text-subtle ${indent ? "pl-4" : ""}`}>{label}</td>
      <td className="py-2 text-right tabular-nums text-ink">{fmtCurrency(value)}</td>
      {cycles != null && (
        <td className="py-2 text-right tabular-nums text-subtle">
          {fmtCurrencyCents(value / cycles)}
        </td>
      )}
      <td className="py-2 text-right">
        {side && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
              side === "Pre-tax"
                ? "bg-accent-subtle text-accent"
                : "bg-discovery-subtle text-discovery-text"
            }`}
          >
            {side}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function DeductionTable({
  inputs,
  config,
  finance,
  running,
  fbt,
  pkg,
  adminFee,
  showCycle = false,
}: {
  inputs: LeaseInputs;
  config: EngineConfig;
  finance: LeaseFinance;
  running: RunningCostBreakdown;
  fbt: FbtOutcome;
  pkg: PackageBreakdown;
  adminFee: number;
  /**
   * Add a per-pay-cycle column, in cents.
   *
   * Off in the calculator, where the argument is annual and a third column of
   * figures would crowd it. On for somebody checking a payslip, where the
   * annual figure is the one that cannot be checked — and in cents, because
   * rounding six lines to the dollar and summing them will not reproduce the
   * deduction a payroll system actually withheld.
   */
  showCycle?: boolean;
}) {
  const cycle = effectivePayCycle(inputs.payCycle, config);
  const cycles = showCycle ? PAY_CYCLES_PER_YEAR[cycle] : null;
  const total = pkg.preTaxAnnual + pkg.postTaxAnnual;
  /* Each cost row is the gross cost of that item. Which side of tax it is
     taken from is a property of the package as a whole under the contribution
     method, not of any one line, so the chips come off and the split below
     carries it instead. */
  const split = pkg.postTaxAnnual > 0;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th className="pb-2 font-medium">Item</th>
          <th className="pb-2 text-right font-medium">Per year</th>
          {cycles != null && (
            <th className="pb-2 text-right font-medium">Per {PAY_CYCLE_NOUN[cycle]}</th>
          )}
          <th className="pb-2 text-right font-medium">Deducted</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        <Row label="Lease payments" value={finance.annualPayment} side={split ? null : "Pre-tax"} cycles={cycles} />
        {inputs.includeRunningCosts && (
          <>
            <Row label="Fuel or charging" value={running.fuel} side={split ? null : "Pre-tax"} indent cycles={cycles} />
            <Row label="Servicing" value={running.servicing} side={split ? null : "Pre-tax"} indent cycles={cycles} />
            <Row label="Tyres" value={running.tyres} side={split ? null : "Pre-tax"} indent cycles={cycles} />
            <Row
              label="Registration and CTP"
              value={running.registration}
              side={split ? null : "Pre-tax"}
              indent
              cycles={cycles}
            />
            <Row label="Insurance" value={running.insurance} side={split ? null : "Pre-tax"} indent cycles={cycles} />
            <Row
              label="Roadside assistance"
              value={running.roadside}
              side={split ? null : "Pre-tax"}
              indent
              cycles={cycles}
            />
          </>
        )}
        <Row label="Lease management fee" value={adminFee} side={split ? null : "Pre-tax"} cycles={cycles} />
        {fbt.fbtPayable > 0 && (
          <Row
            label="Fringe benefits tax (grossed up)"
            value={fbt.fbtPayable}
            side={split ? null : "Pre-tax"}
            cycles={cycles}
          />
        )}
        <tr className="font-semibold text-ink">
          <td className="py-2.5">Total deducted</td>
          <td className="py-2.5 text-right tabular-nums">{fmtCurrency(total)}</td>
          {cycles != null && (
            <td className="py-2.5 text-right tabular-nums">{fmtCurrencyCents(total / cycles)}</td>
          )}
          <td className="py-2.5" />
        </tr>
        {/*
          * How the total divides, rather than two more things being taken.
          *
          * The employee contribution used to sit above as its own row with a
          * "Post-tax" chip, which made the column stop adding up: under the
          * contribution method it is a slice OF the package — the same money,
          * taken from the other side of tax — not a further deduction on top
          * of it. On a non-exempt car the visible rows came to $25,912 against
          * a stated total of $15,112, and the reader most likely to notice is
          * the one this table is now shared with.
          *
          * So the split is shown as a split: indented, under the total, and
          * only where there is anything to split.
          */}
        {pkg.postTaxAnnual > 0 && (
          <>
            <tr className="text-subtle">
              <td className="py-2 pl-4 text-xs">of which, taken before tax</td>
              <td className="py-2 text-right text-xs tabular-nums">
                {fmtCurrency(pkg.preTaxAnnual)}
              </td>
              {cycles != null && (
                <td className="py-2 text-right text-xs tabular-nums">
                  {fmtCurrencyCents(pkg.preTaxAnnual / cycles)}
                </td>
              )}
              <td className="py-2 text-right">
                <span className="rounded bg-accent-subtle px-1.5 py-0.5 text-[11px] font-medium text-accent">
                  Pre-tax
                </span>
              </td>
            </tr>
            <tr className="text-subtle">
              <td className="py-2 pl-4 text-xs">
                of which, taken after tax (employee contribution, cancels the FBT)
              </td>
              <td className="py-2 text-right text-xs tabular-nums">
                {fmtCurrency(pkg.postTaxAnnual)}
              </td>
              {cycles != null && (
                <td className="py-2 text-right text-xs tabular-nums">
                  {fmtCurrencyCents(pkg.postTaxAnnual / cycles)}
                </td>
              )}
              <td className="py-2 text-right">
                <span className="rounded bg-discovery-subtle px-1.5 py-0.5 text-[11px] font-medium text-discovery-text">
                  Post-tax
                </span>
              </td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  );
}
