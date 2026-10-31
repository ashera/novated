"use client";

import DeductionTable from "./DeductionTable";
import DeductionExplainer from "./DeductionExplainer";
import { modelledDeduction, quotedDeduction } from "@/lib/au/deduction";
import type { QuoteDecode } from "@/lib/au/quote";
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
  quote,
}: {
  result: LeaseResult;
  config: EngineConfig;
  carName: string;
  leaseName: string;
  /**
   * The quote the lease is modelled on, decoded, where there is one.
   *
   * When present it — not the engine — is the deduction. The provider's lines
   * are what the employer actually withholds; the model is a second opinion
   * about what the lease ought to cost, and on a page whose job is to explain
   * a payslip the second opinion is the wrong answer. This page showed $1,945
   * a month to somebody whose payslip says $1,780 before it took the quote.
   */
  quote?: { decode: QuoteDecode; provider: string } | null;
}) {
  const { inputs, finance, running, fbt, package: pkg } = result;
  const cycle = effectivePayCycle(inputs.payCycle, config);
  const cycles = PAY_CYCLES_PER_YEAR[cycle];
  const noun = PAY_CYCLE_NOUN[cycle];
  const adminFee = inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;

  const n = (v: number | null) => (v == null ? "—" : fmtCurrency(v));

  const breakdown = quote
    ? quotedDeduction(quote.decode)
    : modelledDeduction(inputs, config, finance, running, fbt, pkg.preTaxAnnual, pkg.postTaxAnnual);

  /* The quote's own finance facts where there is one — the amount financed it
     was actually written over, not the amount our model would have financed.
     On the lease that surfaced this those differed by $6,334, because the car
     is recorded as a private purchase and the provider claimed a GST credit. */
  const fin = quote
    ? {
        amountFinanced: quote.decode.amountFinanced,
        ratePct: quote.decode.impliedRatePct,
        residual: quote.decode.residualExGst,
        monthly: quote.decode.monthlyFinancePayment,
        totalInterest: quote.decode.totalInterest,
      }
    : {
        amountFinanced: finance.amountFinanced,
        ratePct: inputs.interestRatePct,
        residual: finance.residual,
        monthly: finance.monthlyPayment,
        totalInterest: finance.totalInterest,
      };

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
          {quote
            ? ` Taken from ${quote.provider}’s quote — the provider’s own figures, not an estimate.`
            : " Modelled from the car and the lease terms; no provider quote is attached, so the running costs are benchmarks rather than quoted amounts."}{" "}
          No salary or tax position is included.
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
              {fmtCurrencyCents(breakdown.preTaxAnnual / cycles)}
            </p>
            <p className="text-xs text-subtle">before tax, each {noun}</p>
          </div>
          {breakdown.postTaxAnnual > 0 && (
            <div>
              <p className="text-2xl font-semibold tabular-nums text-ink">
                {fmtCurrencyCents(breakdown.postTaxAnnual / cycles)}
              </p>
              <p className="text-xs text-subtle">after tax, each {noun}</p>
            </div>
          )}
          <div>
            <p className="text-lg font-semibold tabular-nums text-ink">
              {fmtCurrency(breakdown.preTaxAnnual)}
            </p>
            <p className="text-xs text-subtle">before tax, a year</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-subtle">
          Paid {cycles} times a year. The annual figures below divide by {cycles} to reach
          the per-{noun} column, which is why that column carries cents — summing
          dollar-rounded lines will not reproduce what payroll withheld.
        </p>
        {/*
          * Where the quote states a deduction and its own lines do not come to
          * it, that difference is a finding rather than a rounding error — most
          * often an employer keeping a share of the tax saving. Said here, not
          * averaged away, because this is the page somebody checks a payslip on.
          */}
        {breakdown.statedDeduction != null &&
          Math.abs(breakdown.statedDeduction - breakdown.total) > 1 && (
            <p className="mt-2 rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-xs leading-relaxed text-warning-text">
              The quote states {fmtCurrencyCents(breakdown.statedDeduction / cycles)} a {noun}{" "}
              coming out of pay, but the lines it itemises come to{" "}
              {fmtCurrencyCents(breakdown.total / cycles)} — a difference of{" "}
              {fmtCurrencyCents(Math.abs(breakdown.statedDeduction - breakdown.total) / cycles)}.
              Worth asking the provider what the remainder is; a common answer is that the
              employer keeps a share of the tax saving.
            </p>
          )}
      </section>

      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">What the deduction is made of</h2>
        <p className="mt-1 text-sm text-muted">
          {quote
            ? `Each line as ${quote.provider} itemised it on the quote.`
            : "Each line is either calculated from the lease’s own terms or benchmarked from published data. None of it is typed in."}
        </p>
        <div className="mt-4 overflow-x-auto">
          <DeductionTable
            breakdown={breakdown}
            cyclesPerYear={cycles}
            cycleNoun={noun}
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
            ["Amount financed", n(fin.amountFinanced)],
            ["Interest rate", fin.ratePct == null ? "—" : `${fin.ratePct.toFixed(2)}%`],
            ["Term", `${inputs.termYears} year${inputs.termYears === 1 ? "" : "s"}`],
            [
              "Residual",
              fin.residual == null || fin.amountFinanced == null
                ? "—"
                : `${fmtCurrency(fin.residual)} (${((fin.residual / fin.amountFinanced) * 100).toFixed(2)}% of the amount financed)`,
            ],
            ["Payment", fin.monthly == null ? "—" : `${fmtCurrency(fin.monthly)} a month`],
            ["Total interest over the term", n(fin.totalInterest)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
              <dt className="text-sm text-subtle">{k}</dt>
              <dd className="text-sm font-medium tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {quote
            ? "These are the quote’s own figures. The rate is solved from its payment, amount financed and residual rather than taken on trust."
            : `The lease is written over ${fmtCurrency(finance.amountFinanced)} rather than the ${fmtCurrency(finance.priceInclGst)} purchase price, because the financier buys the car and claims the GST back — ${fmtCurrency(finance.gstCredit)} here.`}{" "}
          The residual falls due at the end of the term and is not part of any deduction
          above.
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
