"use client";

import Explainer from "./Explainer";
import InlineExplainer from "./InlineExplainer";
import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import { PAY_CYCLES_PER_YEAR, effectivePayCycle, type LeaseResult } from "@/lib/au/novated";

/**
 * Where each headline figure comes from.
 *
 * These are the numbers someone repeats to their partner, so they are the
 * ones most worth being able to check. Each explainer walks the same path the
 * engine took, with the figures actually used — the two take-home numbers
 * either side of the deduction, the two tax bills we differenced, the loan we
 * compared against — rather than restating the label in longer words.
 *
 * The rule this follows: show the working, then the answer. If a figure can't
 * be reconstructed from what the modal says, the modal isn't finished.
 */

export type StatKind = "cost" | "taxSaved" | "vsLoan" | "residual" | "interest" | "gst";

const TITLE: Record<StatKind, string> = {
  cost: "What it really costs you",
  taxSaved: "Where the tax saving comes from",
  vsLoan: "How we compare it with a car loan",
  residual: "The residual",
  interest: "The interest",
  gst: "The GST you avoid",
};

/**
 * The explanation itself, without the modal around it.
 *
 * Split out so an article can render exactly the same prose against a worked
 * example. The alternative was to paste the text into a page, which would have
 * left two copies of every explanation to keep in step — the mistake this
 * codebase has corrected three times in a week. There is one copy, and the
 * modal and the article are two places it is shown.
 */
export function StatExplainerBody({
  kind,
  result,
  config,
}: {
  kind: StatKind;
  result: LeaseResult;
  config: EngineConfig;
}) {
  const { inputs, finance, running, fbt, package: pkg, comparison, term } = result;
  const cycle = effectivePayCycle(inputs.payCycle, config);
  const cycles = PAY_CYCLES_PER_YEAR[cycle];
  const noun = cycle === "weekly" ? "week" : cycle === "monthly" ? "month" : "fortnight";
  const gstPct = (config.gst.rate * 100).toFixed(0);
  const years = term.years;

  return (
    <>
      {kind === "cost" && (
        <>
          <p>
            Not what the lease costs — what <em>you</em> feel. It is the difference between
            two take-home figures, so the tax relief is already inside it.
          </p>
          <div>
            <InlineExplainer label="Take-home now" value={fmtCurrency(pkg.takeHomeBefore)}>
              Your pay after tax on {fmtCurrency(inputs.salary)}, with no lease.
            </InlineExplainer>
            <InlineExplainer label="Take-home with the lease" value={fmtCurrency(pkg.takeHomeAfter)}>
              Tax is worked out on {fmtCurrency(inputs.salary - pkg.preTaxAnnual)} instead —
              your salary less the {fmtCurrency(pkg.preTaxAnnual)} pre-tax deduction — and then
              the {fmtCurrency(pkg.postTaxAnnual)} post-tax contribution comes out of what is
              left.
              {pkg.postTaxAnnual === 0 && " There is no post-tax contribution on this car."}
            </InlineExplainer>
            <InlineExplainer
              label="Difference, a year"
              value={fmtCurrency(pkg.takeHomeReduction)}
              valueClassName="text-ink"
            >
              {fmtCurrency(pkg.takeHomeBefore)} − {fmtCurrency(pkg.takeHomeAfter)}. Divided by
              the {cycles} pays in a year, that is{" "}
              {fmtCurrency(result.perPayCycle.takeHomeReduction)} a {noun}.
            </InlineExplainer>
          </div>
          <p className="text-xs text-muted">
            The car, its running costs and the fees are all inside that figure — it is not a
            payment on top of your normal motoring bills, it replaces them.
          </p>
        </>
      )}

      {kind === "taxSaved" && (
        <>
          <p>
            Measured, not assumed. We work out your whole tax position twice and take the
            difference — which is the only way bracket crossings, the low income tax offset,
            the Medicare levy shade-in and compulsory HELP repayments land where they
            actually fall.
          </p>
          <div>
            <InlineExplainer label="Taxed on, without the lease" value={fmtCurrency(inputs.salary)}>
              Your gross salary, before tax and not counting employer super — super is paid on
              top and is not part of what you are taxed on here.
            </InlineExplainer>
            <InlineExplainer
              label="Taxed on, with it"
              value={fmtCurrency(inputs.salary - pkg.preTaxAnnual)}
            >
              Your salary less the {fmtCurrency(pkg.preTaxAnnual)} that comes out before tax.
            </InlineExplainer>
            <InlineExplainer label="Tax you don't pay" value={fmtCurrency(pkg.taxSaved)}>
              The difference between the two tax bills — {fmtCurrency(pkg.taxSaved)} a year,
              which works out at {(pkg.effectiveReliefRate * 100).toFixed(1)}% of the pre-tax
              deduction. That is your effective rate of relief, not a headline marginal rate.
            </InlineExplainer>
          </div>
          {fbt.reportableFringeBenefit > 0 && (
            <p className="rounded-lg border border-line bg-panel-2 p-3 text-xs leading-relaxed">
              This lease also puts a {fmtCurrency(fbt.reportableFringeBenefit)} reportable
              fringe benefit on your payment summary. It is not taxable income, but it counts
              towards income tests — so it is applied to the packaged side only when we measure
              the relief. Counting it on both sides would invent a saving nobody receives.
            </p>
          )}
        </>
      )}

      {kind === "vsLoan" && (
        <>
          <p>
            The same car, over the same {years} years, with the same balloon left owing at the
            end — so only the way it is funded differs.
          </p>
          <div>
            <InlineExplainer
              label={`Car loan at ${comparison.loan.ratePct.toFixed(2)}%`}
              value={fmtCurrency(comparison.loan.totalCost)}
            >
              {fmtCurrency(comparison.loan.totalRepaid)} of repayments on the full{" "}
              {fmtCurrency(finance.priceInclGst)} price — no GST credit, because you are buying
              it, not a financier — plus {fmtCurrency(running.total * (1 + config.gst.rate))} a
              year of running costs with GST on them, paid from take-home pay.
              <br />
              <br />
              The rate defaults to {config.benchmarks.loanRatePct.toFixed(2)}% — a comparable
              secured car loan, the same benchmark a quote&apos;s finance rate is judged against.
              It deliberately doesn&apos;t track the lease rate: if it did, a poor lease rate
              would drag the loan up with it and this comparison could never tell you a bank beat
              your quote. Put your own loan quote in below and it uses that instead.
            </InlineExplainer>
            <InlineExplainer label="This lease" value={fmtCurrency(comparison.lease.totalCost)}>
              What the lease costs after the tax relief is counted, over {years} years.
              {!inputs.includeRunningCosts &&
                " Running costs aren't packaged here, so they're added back on this side too — otherwise the comparison would be flattering."}
            </InlineExplainer>
            <InlineExplainer
              label={comparison.savingVsLoan >= 0 ? "Lease is ahead by" : "Loan is ahead by"}
              value={fmtCurrency(Math.abs(comparison.savingVsLoan))}
            >
              {fmtCurrency(comparison.loan.totalCost)} −{" "}
              {fmtCurrency(comparison.lease.totalCost)}.
              <br />
              <br />
              Both leave you owing the {fmtCurrency(finance.residual)} balloon, so neither side
              is quietly further ahead on the car itself — though the lease pays{" "}
              {fmtCurrency(comparison.residualGstOnBuyout)} of GST to take it, which the loan
              buyer paid in the purchase price.
            </InlineExplainer>
          </div>
          <p className="text-xs text-muted">
            Buying outright for cash comes to {fmtCurrency(comparison.cash.totalCost)} over the
            same period — cheaper in total on most cars, because you are not paying anyone
            interest, but it needs {fmtCurrency(comparison.cash.upfront)} up front.
          </p>
        </>
      )}

      {kind === "residual" && (
        <>
          <p>
            A lump still owing when the term ends. It is not a fee and not optional — it is the
            part of the car the lease deliberately does not pay off.
          </p>
          <div>
            <InlineExplainer label="Financed" value={fmtCurrency(finance.amountFinanced)}>
              The {fmtCurrency(finance.priceInclGst)} price less the{" "}
              {fmtCurrency(finance.gstCredit)} GST the financier claims back.
            </InlineExplainer>
            <InlineExplainer
              label={`Residual at ${finance.residualPct.toFixed(2)}%`}
              value={fmtCurrency(finance.residual)}
            >
              {finance.residualPct.toFixed(2)}% of {fmtCurrency(finance.amountFinanced)}. That
              percentage is the ATO&apos;s minimum for a {years}-year lease — lower would mean
              more of the car paid off from pre-tax income than the rules allow, so almost every
              quote uses exactly this figure.
            </InlineExplainer>
            {/* The figure to plan around is the one with GST on it. A quote
                states the residual inclusive for exactly this reason, and a
                private sale brings in no GST to pay it with. */}
            <InlineExplainer
              label="GST on the buyout"
              value={fmtCurrency(comparison.residualGstOnBuyout)}
            >
              The financier owns the car until this is paid, so taking it is a purchase and
              carries GST. Most quotes state the residual with it already included —{" "}
              {fmtCurrency(term.residualPayable)} here.
            </InlineExplainer>
          </div>
          <p className="rounded-lg border border-line bg-panel-2 p-3 text-xs leading-relaxed">
            At the end you pay it to keep the car, refinance it, or sell and settle up. If the
            car is worth less than {fmtCurrency(term.residualPayable)} by then, the shortfall is
            yours — not the financier&apos;s.
          </p>
        </>
      )}

      {kind === "interest" && (
        <>
          <p>
            What the finance costs on top of the car, over the whole term.
          </p>
          <div>
            <InlineExplainer label="All the payments" value={fmtCurrency(finance.totalPayments)}>
              {fmtCurrency(finance.monthlyPayment)} a month × {years * 12} months.
            </InlineExplainer>
            <InlineExplainer label="Plus the residual" value={fmtCurrency(finance.residual)}>
              Counted here because you pay it too. Leaving it out would understate the interest
              by pretending the balloon settles itself.
            </InlineExplainer>
            <InlineExplainer label="Less the amount financed" value={`− ${fmtCurrency(finance.amountFinanced)}`}>
              What the lease was written over in the first place.
            </InlineExplainer>
            <InlineExplainer label="Interest" value={fmtCurrency(finance.totalInterest)}>
              {fmtCurrency(finance.totalPayments)} + {fmtCurrency(finance.residual)} −{" "}
              {fmtCurrency(finance.amountFinanced)}, at {inputs.interestRatePct.toFixed(2)}% over{" "}
              {years} years.
            </InlineExplainer>
          </div>
          <p className="text-xs text-muted">
            Providers rarely print this rate. If you are working from a real quote, our decoder
            recovers it from the figures they do print.
          </p>
        </>
      )}

      {kind === "gst" && (
        <>
          <p>
            GST you never pay, because the financier and your employer buy these things rather
            than you.
          </p>
          <div>
            <InlineExplainer label="On the car" value={fmtCurrency(finance.gstCredit)}>
              The financier buys it and claims the {gstPct}% credit, so the lease is written
              over {fmtCurrency(finance.amountFinanced)} rather than the{" "}
              {fmtCurrency(finance.priceInclGst)} you see advertised.
              {finance.priceInclGst > config.gst.carLimit && (
                <>
                  {" "}
                  Capped at the {fmtCurrency(config.gst.carLimit)} car limit — GST on value
                  above that is not recoverable and stays in the amount financed.
                </>
              )}
            </InlineExplainer>
            {inputs.includeRunningCosts ? (
              <InlineExplainer
                label="On running costs"
                value={fmtCurrency(running.total * config.gst.rate * years)}
              >
                Fuel, servicing, tyres and insurance are billed to your employer, who claims the
                GST back — about {fmtCurrency(running.total * config.gst.rate)} a year × {years}{" "}
                years. It is why the budgets in the deduction look lower than what you pay at
                the pump today.
              </InlineExplainer>
            ) : (
              <InlineExplainer label="On running costs" value="Nothing">
                Running costs aren&apos;t packaged in this scenario, so you pay them from
                take-home pay with GST on top. Packaging them would save about{" "}
                {fmtCurrency(running.total * config.gst.rate)} a year.
              </InlineExplainer>
            )}
            <InlineExplainer
              label="Less GST on the buyout"
              value={`−${fmtCurrency(comparison.residualGstOnBuyout)}`}
            >
              The financier owns the car until the residual is paid, so taking it at the end is a
              purchase and carries GST. It is the credit above, handed back on the part of the car
              you buy rather than lease. A cash or loan buyer paid this in the purchase price on
              day one.
            </InlineExplainer>
            <InlineExplainer label="Over the term" value={fmtCurrency(term.gstSaved)}>
              What is left once the buyout is paid for.
            </InlineExplainer>
          </div>
        </>
      )}
    </>
  );
}

/** The same explanation behind the help icon it has always sat behind. */
export default function StatExplainer(props: {
  kind: StatKind;
  result: LeaseResult;
  config: EngineConfig;
}) {
  return (
    <Explainer title={TITLE[props.kind]}>
      <StatExplainerBody {...props} />
    </Explainer>
  );
}

/** The heading each explanation carries, so an article can title itself the
 *  same way the modal does rather than inventing a second name for it. */
export { TITLE as STAT_EXPLAINER_TITLE };
