import { fmtCurrency, fmtCurrencyCents } from "@/lib/au/format";
import type { DeductionBreakdown } from "@/lib/au/deduction";

/**
 * What the employer takes out of the pay, itemised.
 *
 * Renders a {@link DeductionBreakdown} and knows nothing about where it came
 * from — modelled from the car and the rate, or read off a provider's quote.
 * That split lives in lib/au/deduction.ts, where it can be tested without a
 * browser, and it matters: the two can differ by hundreds a month, and this
 * table used to be wired to the modelled one whatever the lease was built on.
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
  cycles,
}: {
  label: string;
  value: number;
  side: "Pre-tax" | "Post-tax" | null;
  cycles: number | null;
}) {
  return (
    <tr>
      {/* Flush, not indented. Every item here is a component of the total at
          the foot; indenting some of them read as "these belong to the line
          above", which is the one thing the table must not say. */}
      <td className="py-2 text-subtle">{label}</td>
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
  breakdown,
  cyclesPerYear,
  cycleNoun,
  showCycle = false,
}: {
  breakdown: DeductionBreakdown;
  cyclesPerYear: number;
  cycleNoun: string;
  /**
   * Add a per-pay-cycle column, in cents.
   *
   * Off in the calculator, where the argument is annual and a third column of
   * figures would crowd it. On for somebody checking a payslip, where the
   * annual figure is the one that cannot be checked — and in cents, because
   * rounding each line to the dollar and summing them will not reproduce the
   * deduction a payroll system actually withheld.
   */
  showCycle?: boolean;
}) {
  const cycles = showCycle ? cyclesPerYear : null;
  const { rows, total, preTaxAnnual, postTaxAnnual } = breakdown;
  /* Which side of tax a line falls on is a property of the package as a whole
     under the contribution method, not of any one item, so where there is a
     split the per-row chips come off and the split below carries it. */
  const split = postTaxAnnual > 0;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th className="pb-2 font-medium">Item</th>
          <th className="pb-2 text-right font-medium">Per year</th>
          {cycles != null && <th className="pb-2 text-right font-medium">Per {cycleNoun}</th>}
          <th className="pb-2 text-right font-medium">Deducted</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <Row
            key={r.key}
            label={r.label}
            value={r.annual}
            side={split ? null : "Pre-tax"}
            cycles={cycles}
          />
        ))}
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
          * taken from the other side of tax — not a further deduction on top.
          */}
        {split && (
          <>
            <tr className="text-subtle">
              <td className="py-2 pl-4 text-xs">of which, taken before tax</td>
              <td className="py-2 text-right text-xs tabular-nums">{fmtCurrency(preTaxAnnual)}</td>
              {cycles != null && (
                <td className="py-2 text-right text-xs tabular-nums">
                  {fmtCurrencyCents(preTaxAnnual / cycles)}
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
              <td className="py-2 text-right text-xs tabular-nums">{fmtCurrency(postTaxAnnual)}</td>
              {cycles != null && (
                <td className="py-2 text-right text-xs tabular-nums">
                  {fmtCurrencyCents(postTaxAnnual / cycles)}
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
