"use client";

import Link from "next/link";
import Explainer from "./Explainer";
import InlineExplainer from "./InlineExplainer";
import { fmtCurrency } from "@/lib/au/format";
import type { EngineConfig } from "@/lib/au/config";
import type {
  FbtOutcome,
  LeaseFinance,
  LeaseInputs,
  RunningCostBreakdown,
} from "@/lib/au/novated";

/**
 * Where every line in "What's in the deduction" comes from.
 *
 * The table mixes two kinds of number and nothing on the page said so, which
 * is what made it read as opaque:
 *
 *   - CALCULATED — the lease payment and the FBT follow from figures already
 *     on screen. Change the rate and they move. There is no estimate in them.
 *   - BENCHMARKED — the running costs are modelled from published survey data
 *     against your kilometres and your car. They are the honest starting
 *     point for a car nobody has quoted yet, and they will not match a real
 *     quote to the dollar.
 *
 * So every row shows its own arithmetic with the numbers actually used, not a
 * general description of the method. Someone checking whether we are being
 * straight with them can follow it on a calculator, which is the only version
 * of "explained" worth anything on a page whose argument is that it isn't
 * selling a lease.
 *
 * Editing stays on the decoder. A figure typed here would be a guess dressed
 * as a fact; one typed there came off a provider's document.
 */

const n0 = (v: number) => Math.round(v).toLocaleString("en-AU");
const n1 = (v: number) => v.toFixed(1);
const n2 = (v: number) => v.toFixed(2);

/** A source, named where the number is used rather than only on /about. */
function Cite({ org, what }: { org: string; what: string }) {
  return (
    <p className="mt-1.5 text-[11px] text-muted">
      {what} — <span className="text-subtle">{org}</span>. Every figure is dated and
      re-checked on a schedule;{" "}
      <Link href="/about" className="text-accent hover:underline">
        see the sources
      </Link>
      .
    </p>
  );
}

export default function DeductionExplainer({
  inputs,
  config,
  finance,
  running,
  fbt,
  adminFee,
}: {
  inputs: LeaseInputs;
  config: EngineConfig;
  finance: LeaseFinance;
  running: RunningCostBreakdown;
  fbt: FbtOutcome;
  adminFee: number;
}) {
  const r = config.running;
  const km = Math.max(0, inputs.annualKm);
  const electric = inputs.fuelType === "electric";
  const gstPct = (config.gst.rate * 100).toFixed(0);

  // The consumption actually used: this model's own figure where the
  // catalogue knows it, otherwise the class default.
  const usedKwh = inputs.consumptionPer100km ?? r.fuel.kwhPer100km;
  const usedLitres = inputs.consumptionPer100km ?? r.fuel.litresPer100km;
  const ownFigure = inputs.consumptionPer100km != null;

  return (
    <Explainer title="Where these numbers come from">
      <p>
        Two different kinds of number sit in this table, and the difference matters more
        than any single figure.
      </p>
      <p className="rounded-lg border border-line bg-panel-2 p-3 text-xs leading-relaxed">
        <strong className="text-ink">Calculated</strong> — the lease payment and the FBT
        follow from what you have already entered. Change the rate, the term or the price
        and they move. Nothing in them is estimated.
        <br />
        <br />
        <strong className="text-ink">Benchmarked</strong> — the running costs are modelled
        from published survey data against your kilometres and your car. They are the
        honest starting point for a car nobody has quoted yet, and they will not match a
        real quote to the dollar. When you have one,{" "}
        <Link href="/decode" className="text-accent hover:underline">
          decode it
        </Link>{" "}
        and its own figures replace these.
      </p>

      <div className="mt-1">
        <InlineExplainer label="Lease payments" value={fmtCurrency(finance.annualPayment)}>
          <strong>Calculated.</strong> A level payment that pays{" "}
          {fmtCurrency(finance.amountFinanced)} down to a {fmtCurrency(finance.residual)}{" "}
          residual over {inputs.termYears} year{inputs.termYears === 1 ? "" : "s"} at{" "}
          {n2(inputs.interestRatePct)}% — {fmtCurrency(finance.monthlyPayment)} a month,{" "}
          {fmtCurrency(finance.annualPayment)} a year.
          <br />
          <br />
          The lease is written over {fmtCurrency(finance.amountFinanced)} rather than the{" "}
          {fmtCurrency(finance.priceInclGst)} you see advertised, because the financier buys
          the car and claims the {gstPct}% GST back — {fmtCurrency(finance.gstCredit)} here.
          The residual is {n1(finance.residualPct)}% of that, which is the ATO minimum for
          this term.
        </InlineExplainer>

        {inputs.includeRunningCosts && (
          <>
            <InlineExplainer
              label={electric ? "Charging" : "Fuel"}
              value={fmtCurrency(running.fuel)}
            >
              <strong>Benchmarked.</strong>{" "}
              {electric ? (
                <>
                  {n0(km)} km ÷ 100 × {n1(usedKwh)} kWh/100km × ${n2(r.fuel.pricePerKwh)} per
                  kWh, then {gstPct}% GST removed.
                </>
              ) : (
                <>
                  {n0(km)} km ÷ 100 × {n1(usedLitres)} L/100km × ${n2(r.fuel.pricePerLitre)}{" "}
                  per litre, then {gstPct}% GST removed.
                  {inputs.fuelType === "hybrid" && " A hybrid is budgeted at 72% of that."}
                  {inputs.fuelType === "phev" &&
                    " A plug-in hybrid runs on both, so it is split roughly 45% fuel and 55% electricity rather than pretending it is either one."}
                </>
              )}
              <br />
              <br />
              {ownFigure
                ? "The consumption is this model's own combined-cycle figure, not a class average."
                : "No specific model is chosen, so this is the class average. Pick the car above and its own figure is used instead."}
              <Cite
                org="Green Vehicle Guide, and the AER for electricity or the AIP for fuel"
                what="Consumption and price"
              />
            </InlineExplainer>

            <InlineExplainer label="Servicing" value={fmtCurrency(running.servicing)}>
              <strong>Benchmarked.</strong> ${n0(r.servicing.annualBase)} a year plus{" "}
              {n0(km)} km × ${n2(r.servicing.perKm)} per km
              {electric && (
                <>
                  , then × {n2(r.servicing.evMultiplier)} because an electric car has no oil,
                  filters, plugs or exhaust to service
                </>
              )}
              , with {gstPct}% GST removed.
              <Cite
                org="the Australian motoring clubs' running-costs survey (RACV / RAA / NRMA)"
                what="Servicing benchmarks"
              />
            </InlineExplainer>

            <InlineExplainer label="Tyres" value={fmtCurrency(running.tyres)}>
              <strong>Benchmarked.</strong> A set costs about ${n0(r.tyres.setCost)} and
              lasts around {n0(r.tyres.kmPerSet)} km, so {n0(km)} km a year works out at{" "}
              {(km / r.tyres.kmPerSet).toFixed(2)} of a set — GST removed.
              <Cite
                org="the Australian motoring clubs' running-costs survey"
                what="Tyre cost and life"
              />
            </InlineExplainer>

            <InlineExplainer
              label="Registration and CTP"
              value={fmtCurrency(running.registration)}
            >
              <strong>Benchmarked.</strong>{" "}
              {inputs.state
                ? `The combined registration and CTP figure for ${inputs.state}.`
                : "A national midpoint, because no state is set. These vary by hundreds between states — set one on the car above for a closer figure."}
              <br />
              <br />
              Carried at face value rather than ex-GST: registration itself is GST-free,
              even though the CTP part of it is not.
              <Cite org="state road authorities" what="Registration and CTP" />
            </InlineExplainer>

            <InlineExplainer label="Insurance" value={fmtCurrency(running.insurance)}>
              <strong>Benchmarked.</strong> {n1(r.insurance.pctOfValue)}% of the{" "}
              {fmtCurrency(inputs.vehiclePrice)} price, with a floor of $
              {n0(r.insurance.minAnnual)} — GST removed.
              <br />
              <br />
              This is the line most worth replacing with a real number. A premium turns on
              your age, your address and your history, none of which this knows.
              <Cite
                org="the Australian motoring clubs' running-costs survey"
                what="Premium benchmarks"
              />
            </InlineExplainer>

            <InlineExplainer label="Roadside assistance" value={fmtCurrency(running.roadside)}>
              <strong>Benchmarked.</strong> A flat ${n0(r.roadsideAnnual)} a year, GST
              removed. Some providers bundle it and some do not.
            </InlineExplainer>
          </>
        )}

        <InlineExplainer label="Lease management fee" value={fmtCurrency(adminFee)}>
          {inputs.adminFeeAnnual != null ? (
            <>
              <strong>Yours.</strong> This came from your quote rather than our benchmark.
            </>
          ) : (
            <>
              <strong>Benchmarked.</strong> What a provider charges to run the package —
              collecting the deductions, paying the bills and reconciling at year end.
            </>
          )}
          <br />
          <br />
          The market sits between ${n0(config.benchmarks.managementFeeAnnual.low)} and $
          {n0(config.benchmarks.managementFeeAnnual.high)} a year, and it is the fee
          providers vary most. A quote well above that range is worth asking about.
          <Cite org="published provider pricing, sampled" what="Fee range" />
        </InlineExplainer>

        {fbt.fbtPayable > 0 && (
          <InlineExplainer
            label="Fringe benefits tax"
            value={fmtCurrency(fbt.fbtPayable)}
          >
            <strong>Calculated.</strong> The statutory formula takes{" "}
            {(config.fbt.statutoryRate * 100).toFixed(0)}% of the car&apos;s{" "}
            {fmtCurrency(fbt.baseValue)} GST-inclusive base value ={" "}
            {fmtCurrency(fbt.taxableValue)} of taxable value. That is grossed up and taxed
            at {(config.fbt.rate * 100).toFixed(0)}%, which is where{" "}
            {fmtCurrency(fbt.fbtPayable)} comes from.
            <br />
            <br />
            Your employer owes it, and passes it on in the deduction.
          </InlineExplainer>
        )}

        {fbt.employeeContribution > 0 && (
          <InlineExplainer
            label="Employee contribution"
            value={fmtCurrency(fbt.employeeContribution)}
          >
            <strong>Calculated.</strong> Paying {fmtCurrency(fbt.taxableValue)} — the
            taxable value — out of post-tax pay cancels the FBT bill exactly. That is the
            Employee Contribution Method, and it is why this line is post-tax while
            everything else is pre-tax.
            <br />
            <br />
            It is not a fee. It is the cheaper of two ways to settle the same FBT, because
            the tax on it is your marginal rate rather than {(config.fbt.rate * 100).toFixed(0)}%
            on a grossed-up amount.
          </InlineExplainer>
        )}
      </div>

      <p className="text-xs text-muted">
        Running costs are budgeted <strong className="text-ink">without GST</strong>. Your
        employer claims the {gstPct}% back, so the lease only has to cover the rest — one
        of the real savings in packaging, and a common reason these figures look lower than
        what you pay at the pump today.
      </p>
    </Explainer>
  );
}
