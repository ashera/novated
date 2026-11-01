"use client";

import { useState } from "react";

import DeductionTable from "./DeductionTable";
import DeductionExplainer from "./DeductionExplainer";
import VehicleArt from "./VehicleArt";
import LedgerTable from "./LedgerTable";
import GstReconciliation from "./GstReconciliation";
import type { RemittanceRow } from "@/lib/au/remittance";
import {
  financialYearLabel,
  financialYearsIn,
  inFinancialYear,
} from "@/lib/au/financialYear";
import { orderLog } from "@/lib/au/statementLog";
import type { StatementRow } from "@/lib/au/statement";
import { modelledDeduction, quotedDeduction } from "@/lib/au/deduction";
import type { QuoteDecode } from "@/lib/au/quote";
import type { VehicleSpec } from "@/lib/au/lease";
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
  vehicle,
  commencementDate,
  ledger = [],
  remittances = [],
  defaultFinancialYear,
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
  quote?: {
    decode: QuoteDecode;
    provider: string;
    /**
     * The schedule facts, listed one by one rather than handed over as a
     * QuoteSpec.
     *
     * A QuoteSpec can carry the salary the quote was written against, and
     * passing the whole object serialised it into the page — caught by the
     * e2e check that this link carries no salary, which is the only reason it
     * did not ship. Naming the four fields the schedule needs means a field
     * added to QuoteSpec later cannot arrive here unnoticed.
     */
    schedule: {
      termMonths: number;
      frequency: "weekly" | "fortnightly" | "monthly";
      financePerPayment: number | null;
      residualIncGst: number | null;
      deferredMonths: number;
    };
  } | null;
  /** The car, for the schedule's identification block and its picture. */
  vehicle: VehicleSpec;
  /** ISO date the lease commences, where the lease records one. */
  commencementDate?: string;
  /**
   * The owner's transaction ledger, where they keep one.
   *
   * Carried on this page and no other share, at the owner's request: it is
   * the record of what actually left the account, which is what an accountant
   * reconciles the deduction against. Read-only here — no row can be removed
   * from somebody else's ledger, so LedgerTable is given no `onForget`.
   */
  ledger?: StatementRow[];
  /**
   * The employer's GST payments, where the owner has loaded them.
   *
   * The reason this page exists in its current form: an accountant holding
   * both documents is the person who can tell whether what the employer
   * claimed actually reached the lease account, and the portal shows only one
   * side of it. Read-only here — the pairing is shown with its working, not
   * offered for editing, since these are not the reader's rows to change.
   */
  remittances?: RemittanceRow[];
  /**
   * The year the ledger and the GST tables open on.
   *
   * Worked out on the server and passed in rather than read from the clock
   * here, so the markup this component renders on the server and the markup
   * it renders in the browser cannot disagree about what "last completed
   * year" means across a midnight or a 1 July.
   */
  defaultFinancialYear?: string;
}) {
  const { inputs, finance, running, fbt, package: pkg } = result;
  const cycle = effectivePayCycle(inputs.payCycle, config);
  const cycles = PAY_CYCLES_PER_YEAR[cycle];
  const noun = PAY_CYCLE_NOUN[cycle];
  const adminFee = inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual;

  const n = (v: number | null) => (v == null ? "—" : fmtCurrency(v));

  /*
   * The period both tables are read through.
   *
   * One piece of state behind two controls rather than two independent
   * filters. An accountant reconciling a year wants the ledger and the GST
   * for the same year, and a page that could show one year's transactions
   * beside another year's GST would be a page that invites a mistake nothing
   * on it would reveal. The control appears in both card headers because the
   * cards are long and whichever one you are reading should say which period
   * it is showing.
   */
  const years = financialYearsIn([
    ...ledger.map((r) => r.date),
    ...remittances.map((r) => r.date),
  ]);
  const [financialYear, setFinancialYear] = useState<string | null>(
    defaultFinancialYear ?? null,
  );
  const ledgerInYear = inFinancialYear(ledger, financialYear);

  const YearPicker = ({ id }: { id: string }) => (
    <label className="flex items-center gap-2 text-xs text-muted" htmlFor={id}>
      Financial year
      <select
        id={id}
        value={financialYear ?? "all"}
        onChange={(e) => setFinancialYear(e.target.value === "all" ? null : e.target.value)}
        className="rounded border border-line bg-panel px-2 py-1 text-xs text-ink"
      >
        <option value="all">All years</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {financialYearLabel(y)}
          </option>
        ))}
        {/* The default can name a year the data does not reach — a lease whose
            statements all sit in the current year, say. Offered anyway, so the
            picker shows what is actually selected rather than silently
            displaying somebody else's year. */}
        {financialYear && !years.includes(financialYear) && (
          <option value={financialYear}>{financialYearLabel(financialYear)}</option>
        )}
      </select>
    </label>
  );

  /*
   * The schedule's own dates and counts.
   *
   * An accountant asked for "the lease schedule", which is a document with a
   * settled shape: what is being leased, over what period, for what payment,
   * against what residual. Most of it was already on the page, scattered
   * across two cards and ordered for somebody deciding whether to lease
   * rather than somebody filing it.
   */
  const termMonths = quote?.schedule.termMonths ?? inputs.termYears * 12;
  const PAYMENTS_PER_YEAR = { weekly: 52, fortnightly: 26, monthly: 12 } as const;
  const payFreq = quote?.schedule.frequency ?? "monthly";
  const perYear = PAYMENTS_PER_YEAR[payFreq];
  const freqNoun = { weekly: "week", fortnightly: "fortnight", monthly: "month" }[payFreq];
  const financePerPayment = quote?.schedule.financePerPayment ?? null;
  const deferred = quote?.schedule.deferredMonths ?? 0;

  const asDate = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const fmtDate = (d: Date | null) =>
    d == null
      ? "—"
      : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const start = asDate(commencementDate);
  /* The end date follows the term, and the deferral does not move it unless
     the lease says so — which is the question the deferral finding sends back
     to the provider, so it is not assumed here. */
  const end = start ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + termMonths, start.getUTCDate())) : null;

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

  /*
   * The luxury car charge, where there is one.
   *
   * Taken from the row the table actually prints rather than recomputed, so
   * the card cannot explain a different number from the one above it — which
   * matters more here than elsewhere, because with a quote attached the
   * charge is the provider's figure and our benchmark is only a check on it.
   */
  const lcaRow = breakdown.rows.find((r) => r.key === "luxuryCarAdjustment");
  const lca = lcaRow?.annual ?? 0;
  const carLimit = config.gst.carLimit;
  const lcaExcess =
    fin.amountFinanced == null ? null : Math.max(0, fin.amountFinanced - carLimit);
  const lcaPct = config.lease.luxuryCarAdjustmentPct;
  const lcaBenchmark = lcaExcess == null ? null : lcaExcess * (lcaPct / 100);

  /* The period the ledger covers, for the sentence above it. Dates are ISO in
     the store, so a string compare orders them. */
  const ledgerDates = ledger.map((r) => r.date).filter(Boolean).sort();
  const ledgerSpan =
    ledgerDates.length > 0
      ? `${fmtDate(asDate(ledgerDates[0]))} to ${fmtDate(asDate(ledgerDates[ledgerDates.length - 1]))}`
      : "";

  /* Stated on the quote where it is stated; otherwise GST added to ours. */
  const residualIncGst =
    quote?.schedule.residualIncGst ?? (fin.residual == null ? null : fin.residual * (1 + config.gst.rate));

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

      {/*
        * The lease schedule, first.
        *
        * Asked for by name: an accountant wants the schedule before the
        * payslip arithmetic, because it is the document that establishes what
        * the arithmetic is about — what is leased, over what period, for what
        * payment, against what residual. These facts were already on the page
        * but sat below the deduction and were split across two cards, ordered
        * for somebody deciding whether to lease rather than somebody filing it.
        *
        * The picture earns its place here rather than decorating the header:
        * on a schedule the vehicle is an identifying fact, and a reader
        * checking a document against a car park wants to see the car.
        */}
      <section className="rounded-xl border border-line bg-panel p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">Lease schedule</h2>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="w-full shrink-0 lg:w-72">
            <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-lg border border-line bg-panel-2 p-2">
              <VehicleArt
                src={
                  vehicle.vehicleId
                    ? `/api/vehicle-image/${encodeURIComponent(vehicle.vehicleId)}`
                    : null
                }
                alt={carName || "The leased vehicle"}
                bodyType={vehicle.bodyType}
              />
            </div>
            <p className="mt-2 text-center text-xs text-muted">
              {carName || leaseName || "The leased vehicle"}
            </p>
          </div>

          <dl className="grid min-w-0 flex-1 gap-x-8 gap-y-0 sm:grid-cols-2">
            {(
              [
                ["Vehicle", carName || leaseName || "\u2014"],
                ["Financier / provider", quote ? quote.provider : "\u2014"],
                ["Commencement", fmtDate(start)],
                [
                  "Term",
                  `${termMonths} months (${(termMonths / 12).toFixed(termMonths % 12 === 0 ? 0 : 1)} years)`,
                ],
                ["Expiry", fmtDate(end)],
                [
                  "Payment",
                  financePerPayment != null
                    ? `${fmtCurrencyCents(financePerPayment)} a ${freqNoun}`
                    : fin.monthly == null
                      ? "\u2014"
                      : `${fmtCurrency(fin.monthly)} a month`,
                ],
                [
                  "Number of payments",
                  deferred > 0
                    ? `${Math.round((termMonths / 12) * perYear) - Math.round((deferred / 12) * perYear)} (${deferred} ${deferred === 1 ? "month" : "months"} deferred at the start)`
                    : String(Math.round((termMonths / 12) * perYear)),
                ],
                ["Amount financed", n(fin.amountFinanced)],
                ["Interest rate", fin.ratePct == null ? "\u2014" : `${fin.ratePct.toFixed(2)}%`],
                [
                  "Residual (ex GST)",
                  fin.residual == null || fin.amountFinanced == null
                    ? n(fin.residual)
                    : `${fmtCurrency(fin.residual)} (${((fin.residual / fin.amountFinanced) * 100).toFixed(2)}%)`,
                ],
                ["Residual (inc GST)", n(residualIncGst)],
                ["Total interest over the term", n(fin.totalInterest)],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-4 border-b border-line py-2"
              >
                <dt className="text-sm text-subtle">{k}</dt>
                <dd className="text-right text-sm font-medium tabular-nums text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          {quote
            ? "These are the quote\u2019s own figures. The interest rate is solved from its payment, amount financed and residual rather than taken on trust."
            : `The lease is written over ${fmtCurrency(finance.amountFinanced)} rather than the ${fmtCurrency(finance.priceInclGst)} purchase price, because the financier buys the car and claims the GST back \u2014 ${fmtCurrency(finance.gstCredit)} here.`}{" "}
          The residual falls due at the end of the term and is not part of any deduction
          below.
          {deferred > 0 &&
            ` The first ${deferred} ${deferred === 1 ? "month" : "months"} are deferred, so interest accrues before any payment is made; whether the end date holds or moves out by ${deferred} ${deferred === 1 ? "month" : "months"} is worth confirming with the provider.`}
        </p>
      </section>

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

      {/*
        * The luxury car charge, explained where it is charged.
        *
        * It needs a card of its own for two reasons. The name is the problem:
        * readers take it for the Luxury Car Tax, which is a different thing
        * with a different threshold and in most cases is not payable at all
        * on the cars this charge lands on. And unlike every other line, it is
        * not a cost of running the car — it is the financier recovering tax
        * relief they cannot claim, which is why an accountant asks what it is
        * before anything else on the page.
        *
        * Only when there is one. A card explaining a $0 line would be a card
        * about nothing.
        */}
      {lca > 0 && (
        <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <h2 className="text-base font-semibold text-ink">
            Why there is a luxury car charge
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-subtle">
            {lcaExcess != null && lcaExcess > 0 ? (
              <>
                The amount financed is {fmtCurrency(fin.amountFinanced!)}, which is{" "}
                {fmtCurrency(lcaExcess)} above the ATO&apos;s car limit of{" "}
                {fmtCurrency(carLimit)}. On that excess the financier cannot claim the GST
                credit or the depreciation they could claim on a cheaper car, so the cost
                they cannot recover from the ATO is passed on in the lease — here{" "}
                {fmtCurrency(lca)} a year.
              </>
            ) : (
              <>
                This quote charges {fmtCurrency(lca)} a year as a luxury car charge, but the
                amount financed is at or below the ATO&apos;s car limit of{" "}
                {fmtCurrency(carLimit)} — the threshold the charge normally arises from.
                Worth asking the provider what it is for.
              </>
            )}
          </p>

          {lcaExcess != null && lcaExcess > 0 && (
            <dl className="mt-4 grid gap-x-8 gap-y-0 sm:grid-cols-2">
              {(
                [
                  ["Amount financed", fmtCurrency(fin.amountFinanced!)],
                  ["ATO car limit", fmtCurrency(carLimit)],
                  ["Excess over the limit", fmtCurrency(lcaExcess)],
                  ["Charged on this lease", `${fmtCurrency(lca)} a year`],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-4 border-b border-line py-2"
                >
                  <dt className="text-sm text-subtle">{k}</dt>
                  <dd className="text-sm font-medium tabular-nums text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* The benchmark is a market sample, not a rate anybody legislated,
              so it is offered as a comparison rather than as the right answer
              — see sources: the car limit is the ATO's, the percentage is
              ours, collected from real quotes. */}
          {lcaBenchmark != null && lcaBenchmark > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Across the quotes we have collected, providers charge about {lcaPct}% of the
              excess a year, which on {fmtCurrency(lcaExcess!)} would be around{" "}
              {fmtCurrency(lcaBenchmark)}.{" "}
              {Math.abs(lca - lcaBenchmark) <= Math.max(50, lcaBenchmark * 0.1)
                ? "This one is in line with that."
                : lca > lcaBenchmark
                  ? `This one is ${fmtCurrency(lca - lcaBenchmark)} a year above that, which is worth asking about.`
                  : `This one is ${fmtCurrency(lcaBenchmark - lca)} a year below that.`}{" "}
              The car limit is the ATO&apos;s; the percentage is a market benchmark rather
              than a legislated rate, and it varies between financiers.
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-muted">
            <strong className="text-ink">Not the Luxury Car Tax.</strong> That is a separate
            tax paid once on the vehicle itself, with a higher threshold
            {finance.luxuryCarTax > 0
              ? `, and ${fmtCurrency(finance.luxuryCarTax)} of it applies to this car.`
              : " — none is payable on this car."}{" "}
            This charge is not a tax at all: it is the financier recovering relief the car
            limit denies them. It is deducted before tax with the rest of the package.
          </p>
        </section>
      )}

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

      {/*
        * The two sides of the GST, which is the reconciliation an accountant
        * opens this page to do.
        *
        * Above the ledger rather than below it: the ledger answers "what
        * happened in the account", and this answers "and did everything the
        * employer paid get there" — which is the question the ledger raises
        * and cannot settle on its own.
        */}
      {remittances.length > 0 && ledger.length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">
              GST: what the employer paid, and what reached the lease
            </h2>
            <YearPicker id="fy-gst" />
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
            The employer claims the GST on the rental and the fees and remits it to the
            provider, who credits it to the lease account. Only the credit side appears on the
            provider&apos;s statement; the payments below come from the employer&apos;s own
            accounting export, matched to the credits that answer them.
          </p>
          <div className="mt-4">
            <GstReconciliation
              ledger={ledger}
              remittances={remittances}
              financialYear={financialYear}
            />
          </div>
        </section>
      )}

      {/*
        * What actually left the account.
        *
        * Everything above this is what the lease SAYS comes out; this is what
        * did. They are different questions and an accountant wants both — the
        * deduction to check the payslip against, and the ledger to check the
        * deduction against. A budgeted running cost that is never spent is
        * only visible here.
        *
        * Ordered, not raw: orderLog is what the owner's own ledger view uses,
        * so the two show the same sequence rather than one sorted by insertion
        * and the other by date.
        */}
      {ledger.length > 0 && (
        <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Transaction ledger</h2>
            <YearPicker id="fy-ledger" />
          </div>
          <p className="mt-1 text-sm text-muted">
            What has actually gone through the lease account, as recorded from the
            provider&apos;s statements. {ledgerInYear.length} transaction
            {ledgerInYear.length === 1 ? "" : "s"}
            {financialYear ? ` in ${financialYear}` : ledgerSpan ? `, ${ledgerSpan}` : ""}. The
            &ldquo;read as&rdquo; column is this site&apos;s classification of each line, not
            the provider&apos;s.
          </p>
          <div className="mt-4">
            {ledgerInYear.length > 0 ? (
              <LedgerTable rows={orderLog(ledgerInYear)} />
            ) : (
              <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs leading-relaxed text-subtle">
                No transactions in {financialYear}. Choose another year, or &ldquo;All
                years&rdquo;, to see the {ledger.length} on record.
              </p>
            )}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Amounts are shown to the cent, as the statement printed them. A line classified
            under the wrong heading is the usual explanation for a total that looks wrong,
            which is why the classification is on show rather than applied silently.
            {financialYear &&
              " Each balance is the one the statement printed on that line; filtered to a single year, the column no longer runs continuously from the row above."}
          </p>
        </section>
      )}

      <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-ink">Where each figure comes from</h2>
        {/*
          * Only our own working belongs here, and with a quote attached almost
          * none of it is ours.
          *
          * This section used to render the modelled derivations unconditionally,
          * which put "a level payment that pays $84,429 down to a $23,750
          * residual — $1,580 a month" at the foot of a page whose schedule and
          * deduction table said $78,095 and $1,457.10. Two values for the lease
          * payment in one document, which is worse than either on its own and
          * exactly the complaint that produced this page's rewrite.
          *
          * Where the figures are the provider's, the honest answer to "where
          * does this come from" is "their quote" — plus the one thing we do
          * derive, which is the interest rate their own numbers imply.
          */}
        {quote ? (
          <>
            <p className="mt-1 text-sm text-muted">
              What is read off the document, and what is worked out from it.
            </p>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-subtle">
              <p className="rounded-lg border border-line bg-panel-2 p-3 text-xs leading-relaxed">
                <strong className="text-ink">Read off the quote</strong> — every line in the
                table above is {quote.provider}&apos;s own stated amount at the quote&apos;s
                own frequency, annualised by multiplying by {perYear}. Nothing in the
                deduction is modelled, estimated or benchmarked.
                <br />
                <br />
                <strong className="text-ink">Worked out here</strong> — the interest rate.
                A quote states a payment, an amount financed, a residual and a term, and
                those four fix the rate exactly; most quotes do not print it. Solving it is
                the one number on this page that is ours rather than theirs.
              </p>
              {fin.ratePct != null && fin.amountFinanced != null && fin.residual != null && (
                <p className="text-xs leading-relaxed text-muted">
                  {fmtCurrencyCents(financePerPayment ?? 0)} a {freqNoun} pays{" "}
                  {fmtCurrency(fin.amountFinanced)} down to a {fmtCurrency(fin.residual)}{" "}
                  residual over {termMonths} months. The rate that produces that payment is{" "}
                  {fin.ratePct.toFixed(2)}%
                  {deferred > 0
                    ? `, with the first ${deferred} ${deferred === 1 ? "month" : "months"} deferred — interest accrues through the deferral and is repaid by the payments that remain, which is part of why the rate is what it is.`
                    : "."}
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted">
                Running costs in a packaged lease are budgeted{" "}
                <strong className="text-ink">without GST</strong>, because the employer
                claims it back. That is why these lines look lower than the same bills paid
                personally. They are budgets: a surplus or shortfall is reconciled by the
                provider, usually at the end of the lease.
              </p>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </section>
    </div>
  );
}
