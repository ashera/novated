"use client";

import DeductionTable from "./DeductionTable";
import DeductionExplainer from "./DeductionExplainer";
import { fmtCurrency, fmtCurrencyCents } from "@/lib/au/format";
import {
  PAY_CYCLES_PER_YEAR,
  PAY_CYCLE_NOUN,
  effectivePayCycle,
  type LeaseResult,
} from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";

/**
 * The pre-tax deduction, unpacked for somebody who has to reconcile it.
 *
 * Built for an accountant holding a payslip and one question: what is this
 * salary-sacrifice line, and does it add up. Every other surface on this site
 * is addressed to the person deciding whether to lease; this one is addressed
 * to the person checking the arithmetic afterwards, and the difference changes
 * what belongs on it.
 *
 * What it shows: the figure on the payslip, what it is composed of, and where
 * each component comes from — the lease payment solved from its own inputs,
 * the running costs benchmarked and named as such, the fee, and the FBT
 * position. The reportable fringe benefit is here too, because that is the
 * number the accountant will need at tax time and it appears on no payslip.
 *
 * What it deliberately omits: the salary, and therefore the tax relief, the
 * take-home figures and the net cost of the car. A share link is a capability
 * — whoever holds it can read the page — and none of those are needed to
 * answer the question this page exists to answer. The deduction components are
 * salary-independent, so nothing here is approximated by leaving the salary
 * out; the figures are exactly those on the owner's own screen. There is a
 * test that holds that.
 *
 * The engine's warnings are omitted for the same reason, and it is the less
 * obvious half of the decision. Several of them — the super guarantee falling,
 * Division 293, a HELP repayment rising — only fire when there is a salary to
 * fire against. Rendering the list computed without one would not show a
 * shorter list; it would show a list whose silence on those points reads as
 * "they do not apply here". Better to leave the section out than to publish an
 * absence that means something it does not.
 */

export default function PayBreakdown({
  result,
  config,
  carName,
  leaseName,
}: {
  result: LeaseResult;
  config: EngineConfig;
  carName: string;
  leaseName: string;
}) {
  const { inputs, finance, running, fbt, package: pkg } = result;
  const adminFee = inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;
  const cycle = effectivePayCycle(inputs.payCycle, config);
  const cycles = PAY_CYCLES_PER_YEAR[cycle];
  const noun = PAY_CYCLE_NOUN[cycle];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Novated lease — pay deduction breakdown
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">
          {carName || leaseName || "A novated lease"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-subtle">
          What the employer deducts from each pay for this lease, and what each line is.
          Prepared from the lease holder&apos;s own figures. No salary or tax position is
          included.
        </p>
      </header>

      {/* The payslip figure first, because it is the one being reconciled and
          everything below exists to account for it. In cents: a payroll system
          withholds an exact amount and a figure rounded to the dollar cannot be
          matched against it. */}
      <section className="rounded-xl border border-accent-border bg-accent-subtle p-5">
        <p className="text-sm font-medium text-ink">The deduction on the payslip</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {fmtCurrencyCents(pkg.preTaxAnnual / cycles)}
            </p>
            <p className="text-xs text-subtle">before tax, each {noun}</p>
          </div>
          {pkg.postTaxAnnual > 0 && (
            <div>
              <p className="text-2xl font-semibold tabular-nums text-ink">
                {fmtCurrencyCents(pkg.postTaxAnnual / cycles)}
              </p>
              <p className="text-xs text-subtle">after tax, each {noun}</p>
            </div>
          )}
          <div>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {fmtCurrency(pkg.preTaxAnnual)}
            </p>
            <p className="text-xs text-subtle">before tax, a year</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-subtle">
          Paid {cycles} times a year. The annual figures below divide by {cycles} to reach
          the per-{noun} column, which is why that column carries cents — summing six
          dollar-rounded lines will not reproduce what payroll withheld.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">What the deduction is made of</h2>
        <p className="mt-1 text-sm text-muted">
          Each line is either calculated from the lease&apos;s own terms or benchmarked from
          published data. None of it is typed in.
        </p>
        <div className="mt-4 overflow-x-auto">
          <DeductionTable
            inputs={inputs}
            config={config}
            finance={finance}
            running={running}
            fbt={fbt}
            pkg={pkg}
            adminFee={adminFee}
            showCycle
          />
        </div>
      </section>

      {/* The terms the finance line is solved from. An accountant checking the
          lease payment needs the four inputs that determine it, and they are
          on the lease document rather than the payslip. */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">The finance behind the lease payment</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[
            ["Amount financed", fmtCurrency(finance.amountFinanced)],
            ["Interest rate", `${inputs.interestRatePct.toFixed(2)}%`],
            ["Term", `${inputs.termYears} year${inputs.termYears === 1 ? "" : "s"}`],
            [
              "Residual",
              `${fmtCurrency(finance.residual)} (${finance.residualPct.toFixed(2)}% of the amount financed)`,
            ],
            ["Payment", `${fmtCurrency(finance.monthlyPayment)} a month`],
            ["Total interest over the term", fmtCurrency(finance.totalInterest)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
              <dt className="text-sm text-subtle">{k}</dt>
              <dd className="text-sm font-medium tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          The lease is written over {fmtCurrency(finance.amountFinanced)} rather than the{" "}
          {fmtCurrency(finance.priceInclGst)} purchase price, because the financier buys the
          car and claims the GST back — {fmtCurrency(finance.gstCredit)} here. The residual
          falls due at the end of the term and is not part of any deduction above.
        </p>
      </section>

      {/* FBT, and the reportable amount. The second is the reason an accountant
          opens this page in a year when nothing about the lease has changed. */}
      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">Fringe benefits tax</h2>
        {fbt.exempt ? (
          <p className="mt-2 text-sm leading-relaxed text-subtle">
            <strong className="text-ink">Exempt.</strong> {fbt.exemptReason} No FBT is payable
            and there is no employee contribution, which is why every line above is pre-tax.
          </p>
        ) : fbt.employeeContribution > 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-subtle">
            <strong className="text-ink">Settled by employee contribution.</strong> The taxable
            value of {fmtCurrency(fbt.taxableValue)} is paid from post-tax pay, which reduces
            the FBT to nil. That is the post-tax line in the table above.
          </p>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-subtle">
            <strong className="text-ink">Paid by the employer.</strong> The grossed-up bill of{" "}
            {fmtCurrency(fbt.fbtPayable)} is recovered through the pre-tax deduction.
          </p>
        )}
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[
            ["Base value", fmtCurrency(fbt.baseValue)],
            ["Taxable value", fmtCurrency(fbt.taxableValue)],
            ["FBT payable", fmtCurrency(fbt.fbtPayable)],
            ["Reportable fringe benefit", fmtCurrency(fbt.reportableFringeBenefit)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
              <dt className="text-sm text-subtle">{k}</dt>
              <dd className="text-sm font-medium tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {fbt.reportableFringeBenefit > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The reportable amount is the grossed-up taxable value and appears on the payment
            summary. It is not assessable income, but it counts towards income tests —
            the Medicare levy surcharge, Division 293, child support and family assistance.
            An exempt car still produces one.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">Where each figure comes from</h2>
        <p className="mt-1 text-sm text-muted">
          The arithmetic behind every line, with the numbers actually used.
        </p>
        <div className="mt-4">
          <DeductionExplainer
            inputs={inputs}
            config={config}
            finance={finance}
            running={running}
            fbt={fbt}
            adminFee={adminFee}
            inline
            audience="adviser"
          />
        </div>
      </section>
    </div>
  );
}
