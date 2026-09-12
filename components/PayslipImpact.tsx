"use client";

import Explainer from "./Explainer";
import InlineExplainer from "./InlineExplainer";
import { fmtCurrency, fmtCurrencyCents } from "@/lib/au/format";
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
  explainer,
}: {
  label: string;
  before?: number;
  after?: number;
  hint?: string;
  negative?: boolean;
  strong?: boolean;
  explainer?: React.ReactNode;
}) {
  const cell = (v: number | undefined) =>
    v == null ? (
      <span className="text-muted">—</span>
    ) : (
      <>
        {negative && v > 0 ? "− " : ""}
        {fmtCurrencyCents(v)}
      </>
    );
  return (
    <tr className={strong ? "font-semibold text-ink" : undefined}>
      <td className={`py-2 ${strong ? "" : "text-subtle"}`}>
        <span className="flex items-center gap-2">
          {label}
          {explainer}
        </span>
        {hint && <span className="block text-[11px] font-normal text-muted">{hint}</span>}
      </td>
      <td className="py-2 text-right tabular-nums">{cell(before)}</td>
      <td className={`py-2 text-right tabular-nums ${strong ? "text-accent" : ""}`}>
        {cell(after)}
      </td>
    </tr>
  );
}

function Line({
  label,
  value,
  strong,
  rule,
}: {
  label: string;
  value: number;
  strong?: boolean;
  rule?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${
        rule ? "border-t border-line pt-1" : ""
      } ${strong ? "font-semibold text-ink" : "text-subtle"}`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">
        {value < 0 ? `− ${fmtCurrencyCents(Math.abs(value))}` : fmtCurrencyCents(value)}
      </dd>
    </div>
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
  const { inputs, finance, running, package: pkg, fbt, payslip, comparison } = result;
  const adminFee = inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;

  const cycle = effectivePayCycle(inputs.payCycle, config);
  const n = PAY_CYCLES_PER_YEAR[cycle];
  const noun = PAY_CYCLE_NOUN[cycle];
  /**
   * An annual figure as this pay cycle's, rounded to the cent ONCE.
   *
   * Everything downstream is arithmetic on these values, so what is displayed
   * and what is added up are the same numbers. Rounding at display time
   * instead let each column round at a different point, and the same quantity
   * appeared twice on screen with different values.
   */
  const per = (annual: number) => Math.round((annual / n) * 100) / 100;
  // Derived from the two figures the table prints, not from the annual
  // reduction, so the headline is exactly what a reader gets by subtracting
  // the bottom row.
  const netDrop = per(pkg.takeHomeBefore) - per(pkg.takeHomeAfter);

  // ── The two cards under the table ──────────────────────────────────────
  //
  // One shows what the deduction buys, the other what the same things cost if
  // you funded them yourself. Both are per pay cycle so they sit beside the
  // table, and both add up to the figure printed under them.
  const cyc = {
    finance: per(finance.annualPayment),
    running: inputs.includeRunningCosts ? per(running.total) : 0,
    fee: per(adminFee),
    lcc: per(finance.luxuryCarAdjustment),
    fbt: per(fbt.fbtPayable),
  };
  const packagedCycle = cyc.finance + cyc.running + cyc.fee + cyc.lcc + cyc.fbt;
  // The tax the lease saves, as the difference between what is packaged and
  // what actually leaves your pay. The card and the note below it are the
  // same quantity, so they are the same number by construction rather than by
  // two calculations that agree if you are lucky.
  const taxDrop = packagedCycle - netDrop;

  // The alternative: buy the same car with a car loan and pay the same bills
  // out of take-home, where the GST is yours to wear. Running costs only
  // appear when the lease is packaging them — otherwise they are paid the
  // same way on both sides and would cancel out.
  const alt = {
    loan: per(comparison.loan.annualRepayment),
    running: inputs.includeRunningCosts ? per(running.total * (1 + config.gst.rate)) : 0,
  };
  const altTotal = alt.loan + alt.running;

  // The row this modal explains is a PER-CYCLE figure, so the whole chain is
  // too — a modal opened from "− $293 a fortnight" that answers in $18,200 a
  // year is explaining a different number than the one clicked on.
  const preTaxRow = per(pkg.preTaxAnnual);
  const postTaxCycle = per(pkg.postTaxAnnual);
  const loanRate = inputs.comparisonLoanRatePct ?? inputs.interestRatePct + 1.5;

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
              explainer={
                <Explainer title="How the pre-tax deduction is worked out">
                  <p>
                    Your employer pays the whole lease — the car, everything packaged with it
                    and the fees — and deducts it from each pay. This is that {noun}&apos;s
                    figures, and the part of them taken <em>before</em> tax.
                  </p>
                  <div>
                    <InlineExplainer
                      label="Lease payments"
                      value={fmtCurrencyCents(cyc.finance)}
                    >
                      The car itself, at {inputs.interestRatePct.toFixed(2)}% over{" "}
                      {inputs.termYears} years — {fmtCurrency(finance.annualPayment)} a year,
                      spread across {n} pays.
                    </InlineExplainer>

                    {inputs.includeRunningCosts && (
                      <InlineExplainer
                        label="Running costs"
                        value={fmtCurrencyCents(cyc.running)}
                      >
                        Fuel or charging, servicing, tyres, registration, insurance and roadside
                        — {fmtCurrency(running.total)} budgeted for the year, without GST,
                        because your employer claims that back.
                      </InlineExplainer>
                    )}

                    <InlineExplainer label="Management fee" value={fmtCurrencyCents(cyc.fee)}>
                      What the provider charges to run the package —{" "}
                      {fmtCurrency(adminFee)} a year.
                    </InlineExplainer>

                    {finance.luxuryCarAdjustment > 0 && (
                      <InlineExplainer
                        label="Luxury car charge"
                        value={fmtCurrencyCents(cyc.lcc)}
                      >
                        The car is financed above the {fmtCurrency(config.gst.carLimit)} car
                        limit, so the financier loses deductions on the excess and passes the
                        cost on.
                      </InlineExplainer>
                    )}

                    {fbt.fbtPayable > 0 && (
                      <InlineExplainer
                        label="Fringe benefits tax"
                        value={fmtCurrencyCents(cyc.fbt)}
                      >
                        Your employer owes it and passes it on. Paying the employee
                        contribution instead would cancel it.
                      </InlineExplainer>
                    )}

                    <InlineExplainer
                      label={`Everything packaged, each ${noun}`}
                      value={fmtCurrencyCents(packagedCycle)}
                    >
                      The whole cost of running this lease, before it is split across the two
                      sides of tax.
                    </InlineExplainer>

                    {pkg.postTaxAnnual > 0 && (
                      <InlineExplainer
                        label="Less the post-tax part"
                        value={`− ${fmtCurrencyCents(postTaxCycle)}`}
                      >
                        The employee contribution comes out <em>after</em> tax instead — that is
                        what cancels the FBT — so it is not part of the pre-tax figure. It is
                        its own line further down this payslip.
                      </InlineExplainer>
                    )}

                    <InlineExplainer
                      label={`Deducted before tax, each ${noun}`}
                      value={fmtCurrencyCents(preTaxRow)}
                    >
                      {fmtCurrencyCents(packagedCycle)}
                      {postTaxCycle > 0 ? ` − ${fmtCurrencyCents(postTaxCycle)}` : ""} — the figure on
                      this row. Over a year that is {fmtCurrency(pkg.preTaxAnnual)}.
                    </InlineExplainer>
                  </div>
                  <p className="text-xs text-muted">
                    This is the line that does the work: it comes off before tax is calculated,
                    so over the year you are taxed on{" "}
                    {fmtCurrency(inputs.salary - pkg.preTaxAnnual)} instead of{" "}
                    {fmtCurrency(inputs.salary)}.
                  </p>
                </Explainer>
              }
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

      {/* items-stretch is the grid default, so both cards take the height of
          the taller — and mt-auto pins each footnote to the bottom, which is
          what actually makes them look the same height rather than merely be
          it. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-accent-border bg-accent-subtle px-3.5 py-3">
          <p className="text-sm text-ink">
            <strong>{fmtCurrencyCents(netDrop)} less a {noun}</strong> in the bank — and this is
            what it covers.
          </p>
          <dl className="mt-2.5 space-y-1 text-sm">
            <Line label="Finance payment" value={cyc.finance} />
            {cyc.running > 0 && <Line label="Running costs" value={cyc.running} />}
            <Line label="Management fee" value={cyc.fee} />
            {cyc.lcc > 0 && <Line label="Luxury car charge" value={cyc.lcc} />}
            {cyc.fbt > 0 && <Line label="Fringe benefits tax" value={cyc.fbt} />}
            <Line label={`Packaged each ${noun}`} value={packagedCycle} rule />
            <Line label="Tax you don't pay on it" value={-taxDrop} />
            <Line label="Out of your pocket" value={netDrop} strong />
          </dl>
          <p className="mt-auto pt-2.5 text-[11px] leading-snug text-muted">
            {cyc.running > 0
              ? "Fuel, servicing, tyres, rego and insurance are inside that — it replaces those bills rather than sitting on top of them."
              : "Running costs aren't packaged here, so they're still yours to pay separately."}
          </p>
        </div>

        <div className="flex flex-col rounded-lg border border-line bg-panel-2 px-3.5 py-3">
          <p className="text-sm text-subtle">
            <strong className="text-ink">{fmtCurrencyCents(altTotal)} a {noun}</strong> to fund the
            same car yourself, out of what&apos;s left after tax.
          </p>
          <dl className="mt-2.5 space-y-1 text-sm">
            <Line label={`Car loan at ${loanRate.toFixed(2)}%`} value={alt.loan} />
            {alt.running > 0 && <Line label="Running costs, with GST" value={alt.running} />}
            <Line label={`From your take-home pay`} value={altTotal} strong rule />
          </dl>
          <p className="mt-auto pt-2.5 text-[11px] leading-snug text-muted">
            No GST credit, because you&apos;re the buyer, and no relief — every dollar comes out
            of pay you&apos;ve already been taxed on. Both ways leave the{" "}
            {fmtCurrency(finance.residual)} residual still owing.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-xs leading-relaxed text-muted">
        <li>
          <strong className="text-subtle">
            Your tax falls by {fmtCurrencyCents(taxDrop)} a {noun}
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
