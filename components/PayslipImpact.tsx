"use client";

import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import {
  PAY_CYCLES_PER_YEAR,
  PAY_CYCLE_NOUN,
  effectivePayCycle,
  type LeaseResult,
} from "@/lib/au/novated";

/**
 * What the payslip actually looks like, line by line, once the lease starts.
 *
 * This is the last unknown. Everything else on the page answers "is this a
 * good deal"; the question left is "what lands in my account on payday, and
 * what will my employer's payroll show" — and a novated lease changes a
 * payslip in three places at once, which is why people are surprised by it:
 * the pre-tax deduction reduces the pay that gets taxed, the tax falls as a
 * consequence, and a separate post-tax contribution comes out after.
 *
 * So it is laid out as a payslip runs, top to bottom, twice: what they get
 * now and what they will get. Nothing is recomputed here — the two tax
 * positions come from the engine, which measured them against each other.
 */

function Row({
  label,
  before,
  after,
  hint,
  negative,
  strong,
}: {
  label: string;
  before?: number;
  after?: number;
  hint?: string;
  negative?: boolean;
  strong?: boolean;
}) {
  const cell = (v: number | undefined) =>
    v == null ? (
      <span className="text-muted">—</span>
    ) : (
      <>
        {negative && v > 0 ? "− " : ""}
        {fmtCurrency(v)}
      </>
    );
  return (
    <tr className={strong ? "font-semibold text-ink" : undefined}>
      <td className={`py-2 ${strong ? "" : "text-subtle"}`}>
        {label}
        {hint && <span className="block text-[11px] font-normal text-muted">{hint}</span>}
      </td>
      <td className="py-2 text-right tabular-nums">{cell(before)}</td>
      <td className={`py-2 text-right tabular-nums ${strong ? "text-accent" : ""}`}>
        {cell(after)}
      </td>
    </tr>
  );
}

export default function PayslipImpact({
  result,
  config,
  quoteLabel,
}: {
  result: LeaseResult;
  config: EngineConfig;
  quoteLabel: string;
}) {
  const { inputs, package: pkg, fbt, payslip } = result;
  const cycle = effectivePayCycle(inputs.payCycle, config);
  const n = PAY_CYCLES_PER_YEAR[cycle];
  const noun = PAY_CYCLE_NOUN[cycle];
  const per = (annual: number) => annual / n;
  // Every figure on screen is shown to the nearest dollar, so the summary
  // lines are derived from the ROUNDED rows rather than from the exact
  // annuals. Otherwise $3,242 − $2,619 reads as $623 while the callout below
  // says $622, and a page arguing that it shows its working cannot afford to
  // be a dollar out against itself.
  const shown = (annual: number) => Math.round(per(annual));
  const netDrop = shown(pkg.takeHomeBefore) - shown(pkg.takeHomeAfter);
  const taxDrop =
    shown(payslip.before.incomeTax) +
    shown(payslip.before.medicare) +
    shown(payslip.before.help) -
    (shown(payslip.after.incomeTax) +
      shown(payslip.after.medicare) +
      shown(payslip.after.help));

  const hasHelp = payslip.before.help > 0 || payslip.after.help > 0;
  const helpRose = payslip.after.help > payslip.before.help + 0.5;

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-base font-semibold text-ink">Your payslip, every {noun}</h3>
      <p className="mt-1 text-sm text-muted">
        Based on {quoteLabel}. This is what your employer&apos;s payroll will show once the lease
        starts — a novated lease changes a payslip in three places, not one.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-medium">Per {noun}</th>
              <th className="pb-2 text-right font-medium">Now</th>
              <th className="pb-2 text-right font-medium">With the lease</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <Row label="Gross pay" before={per(inputs.salary)} after={per(inputs.salary)} />
            <Row
              label="Lease deduction, before tax"
              hint="Shown as salary sacrifice"
              after={per(pkg.preTaxAnnual)}
              negative
            />
            <Row
              label="Taxable pay"
              before={per(payslip.before.gross)}
              after={per(payslip.after.gross)}
              strong
            />
            <Row
              label="PAYG tax"
              before={per(payslip.before.incomeTax)}
              after={per(payslip.after.incomeTax)}
              negative
            />
            <Row
              label="Medicare levy"
              before={per(payslip.before.medicare)}
              after={per(payslip.after.medicare)}
              negative
            />
            {hasHelp && (
              <Row
                label="Study loan repayment"
                hint={
                  helpRose
                    ? "Rises: the reportable fringe benefit counts towards repayment income"
                    : undefined
                }
                before={per(payslip.before.help)}
                after={per(payslip.after.help)}
                negative
              />
            )}
            {pkg.postTaxAnnual > 0 && (
              <Row
                label="Lease contribution, after tax"
                hint="The employee contribution that cancels the FBT"
                after={per(pkg.postTaxAnnual)}
                negative
              />
            )}
            <Row
              label="Lands in your account"
              before={per(pkg.takeHomeBefore)}
              after={per(pkg.takeHomeAfter)}
              strong
            />
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-accent-border bg-accent-subtle px-3.5 py-2.5">
          <p className="text-sm text-ink">
            <strong>{fmtCurrency(netDrop)} less a {noun}</strong> in the bank —
            and the car, its running costs and the fees are all paid for out of that.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-panel-2 px-3.5 py-2.5">
          <p className="text-sm text-subtle">
            You&apos;d otherwise be paying those from what&apos;s left, with GST on top and out of
            already-taxed pay.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-xs leading-relaxed text-muted">
        <li>
          <strong className="text-subtle">
            Your tax falls by {fmtCurrency(taxDrop)} a {noun}
          </strong>{" "}
          because the pre-tax deduction comes off before tax is worked out. That is
          the saving — it is not a discount on the car.
        </li>
        {fbt.reportableFringeBenefit > 0 && (
          <li>
            <strong className="text-subtle">
              A {fmtCurrency(fbt.reportableFringeBenefit)} reportable fringe benefit
            </strong>{" "}
            will appear on your annual payment summary. It is not taxable income and does not
            change the figures above, but it counts towards income tests — the Medicare levy
            surcharge, child support, and family assistance.
          </li>
        )}
        <li>
          <strong className="text-subtle">The first pay or two may differ.</strong> Deductions
          usually start once the car is delivered, and providers commonly true up the budgets
          after the first few months.
        </li>
        <li>
          Your employer has to agree to the arrangement, and payroll needs to set it up. Take
          these figures to them — they are the ones who will run it.
        </li>
      </ul>
    </section>
  );
}
