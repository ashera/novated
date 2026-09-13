"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import Field from "./Field";
import InfoTip from "./InfoTip";
import StatCard from "./StatCard";
import TopBar, { type TopBarUser } from "./TopBar";
import PayPacketSplit from "./PayPacketSplit";
import CostComparisonChart from "./CostComparisonChart";
import InfoBlastBanner from "./InfoBlastBanner";
import VehicleCard from "./VehicleCard";
import DeductionExplainer from "./DeductionExplainer";
import StatExplainer from "./StatExplainer";
import PayslipImpact from "./PayslipImpact";
import LockedSummary from "./LockedSummary";
import EarlyExit from "./EarlyExit";
import type { Vehicle } from "@/lib/au/vehicles";
import { fmtCurrency } from "@/lib/au/format";
import {
  calculateLease,
  effectivePayCycle,
  PAY_CYCLES_PER_YEAR,
  PAY_CYCLE_LABEL,
  PAY_CYCLE_NOUN,
  type PayCycle,
} from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";
import {
  applyScenarioFromQuote,
  leaseToInputs,
  lockedQuote,
  priceNeedsBreakdown,
  unlockQuote,
  quoteLabel,
  type Lease,
} from "@/lib/au/lease";
import { useLease } from "./useLease";
import LeaseBar from "./LeaseBar";
import Disclosures from "./Disclosures";
import Independence from "./Independence";
import QuotesCard from "./QuotesCard";
import { track, trackLeasePricedConversion } from "@/lib/analytics";
import { takeHandoff } from "@/lib/quoteHandoff";
import { trackVisit } from "@/app/actions/track";

export default function LeaseCalculator({
  user,
  country,
  config,
  catalogue,
  reviewDue = 0,
  sharedLease,
}: {
  user: TopBarUser | null;
  country?: string | null;
  config: EngineConfig;
  /** The vehicle picker's options, read from the database by the page. */
  catalogue: Vehicle[];
  reviewDue?: number;
  /** A lease opened from a public share link: shown as-is, not editable, and
   *  never mixed into the viewer's own saved leases. */
  sharedLease?: Lease | null;
}) {
  const store = useLease(Boolean(user) && !sharedLease);
  const lease = sharedLease ?? store.lease;
  const readOnly = Boolean(sharedLease);
  const [hydrated, setHydrated] = useState(false);
  const applied = useRef(false);

  // A quote handed over from the decoder carries the rate we solved and that
  // quote's own running-cost budgets. The CAR no longer needs carrying — both
  // tools read it off the same lease.
  //
  // Deliberately waits for the store to finish loading. Applying it on mount
  // raced the load: the patch went onto whatever lease was in hand, the load
  // then replaced that lease, and the only reason the figures survived at all
  // was the debounced save having already written them. The attribution did
  // not survive, so the calculator showed a quote's rate with nothing saying
  // where it came from. `applied` guards the one-shot, since this now runs
  // again whenever loading flips.
  useEffect(() => {
    if (sharedLease) return setHydrated(true);
    if (store.loading || applied.current) return;
    applied.current = true;
    const handed = takeHandoff();
    if (handed) {
      store.update((l) => applyScenarioFromQuote(l, handed.inputs, handed.quoteId));
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.loading, sharedLease]);

  const inputs = useMemo(() => leaseToInputs(lease), [lease]);

  // A shared lease is somebody else's, and read-only already. Giving it the
  // locked layout would put an "unlock" button on a page whose store belongs
  // to the viewer, not the owner — it would silently edit their own lease.
  const locked = readOnly ? null : lockedQuote(lease);


  const setVehicle = (patch: Partial<Lease["vehicle"]>) => {
    if (readOnly) return;
    store.update((l) => ({ ...l, vehicle: { ...l.vehicle, ...patch } }));
  };
  const set = <K extends keyof Lease["scenario"]>(key: K, value: Lease["scenario"][K]) => {
    if (readOnly) return;
    store.update((l) => ({ ...l, scenario: { ...l.scenario, [key]: value } }));
  };

  const result = useMemo(() => calculateLease(inputs, config), [inputs, config]);

  // Funnel signal: they have priced a real car, not just landed on the page.
  // Debounced, and only on the shape of the car — otherwise every slider tick of
  // the price would fire an event.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      track("Lease priced", {
        price: Math.round(inputs.vehiclePrice),
        fuel: inputs.fuelType,
        term: inputs.termYears,
      });
      void trackVisit({ event: "vehicle", value: Math.round(inputs.vehiclePrice) });
      trackLeasePricedConversion();
    }, 1_200);
    return () => clearTimeout(t);
  }, [hydrated, inputs.vehiclePrice, inputs.fuelType, inputs.termYears]);

  // Salary is the other half of the funnel — it's what makes the saving real.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      void trackVisit({ event: "salary", value: Math.round(inputs.salary) });
    }, 1_200);
    return () => clearTimeout(t);
  }, [hydrated, inputs.salary]);

  const { package: pkg, fbt, finance, running, comparison, term, warnings } = result;
  const payCycle = effectivePayCycle(inputs.payCycle, config);
  const cycleLabel = PAY_CYCLE_NOUN[payCycle];

  return (
    <>
      <TopBar user={user} country={country} reviewDue={reviewDue} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5"><InfoBlastBanner /></div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            What would a novated lease actually cost you?
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-subtle">
            Put in your salary and the car you have in mind. We&apos;ll show the pre-tax and
            post-tax split, what FBT does to it, and how the total compares with buying the
            same car another way — all on {config.financialYear} rules.
          </p>
          {/* Before the first number, not after the last one. A reader who
              assumes this is another provider's calculator reads everything
              below as a pitch. */}
          <Independence className="mt-2.5 max-w-3xl" />
        </div>

        <div className="mb-6">
          <VehicleCard
            header={!readOnly && <LeaseBar store={store} signedIn={Boolean(user)} />}
            catalogue={catalogue}
            vehicleId={inputs.vehicleId}
            onVehicle={(v) =>
              setVehicle({
                vehicleId: v?.id,
                consumptionPer100km: v?.consumption,
                ...(v ? { fuelType: v.fuelType } : {}),
              })
            }
            fuelType={inputs.fuelType}
            onFuelType={(f) => {
              setVehicle({ fuelType: f });
              track("Fuel type changed", { fuel: f });
            }}
            price={inputs.vehiclePrice}
            onPrice={(v) => setVehicle({ price: v })}
            customMake={lease.vehicle.make}
            customModel={lease.vehicle.model}
            customBodyType={lease.vehicle.bodyType}
            consumption={inputs.consumptionPer100km}
            onCustom={(patch) => setVehicle(patch)}
            onRoadCosts={lease.vehicle.onRoadCosts}
            purchase={lease.vehicle.purchase}
            onPurchase={(b) => setVehicle(b)}
            config={config}
            priceNeedsBreakdown={!readOnly && priceNeedsBreakdown(lease.vehicle)}
            commencementDate={lease.scenario.commencementDate}
            condition={lease.vehicle.condition}
            firstRegisteredDate={lease.vehicle.firstRegisteredDate}
            firstRetailPrice={lease.vehicle.firstRetailPrice}
            purchasedFrom={lease.vehicle.purchasedFrom}
            onCarHistory={(patch) => {
              setVehicle(patch);
              if (patch.condition) track("Car condition set", { condition: patch.condition });
            }}
            annualKm={inputs.annualKm}
            onAnnualKm={(v) => setVehicle({ annualKm: v })}
            state={inputs.state}
            onState={(st) => setVehicle({ state: st })}
          />
        </div>

        {!readOnly && <QuotesCard store={store} config={config} />}

        {/* Locked, the inputs are no longer inputs: they are the terms of a
            decision. The column goes rather than being greyed out — a wall of
            disabled sliders reads as a page fighting you — and the same facts
            come back as a summary below, with the payslip under it. */}
        <div
          className={
            locked
              ? "space-y-6"
              : "grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
          }
        >
          {locked && (
            <>
              <LockedSummary
                inputs={inputs}
                result={result}
                config={config}
                quoteLabel={quoteLabel(locked)}
                onUnlock={() => store.update(unlockQuote)}
              />
              <PayslipImpact result={result} config={config} quoteLabel={quoteLabel(locked)} />
            </>
          )}

          {/* ── Inputs ─────────────────────────────────────────────── */}
          {!locked && (
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">You and the term</h2>
              <div className="mt-4 space-y-5">
                <Field
                  label="Gross salary"
                  value={inputs.salary}
                  onChange={(v) => set("salary", v)}
                  min={30_000}
                  max={400_000}
                  step={1_000}
                  integer
                  prefix="$"
                  hint="Before tax, and not counting employer super — the salary figure on your contract, not your total package."
                />

                <div>
                  <span className="text-sm font-medium text-ink">You&apos;re paid</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(Object.keys(PAY_CYCLES_PER_YEAR) as PayCycle[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={readOnly}
                        onClick={() => set("payCycle", c)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                          payCycle === c
                            ? "border-accent bg-accent-subtle text-accent"
                            : "border-line bg-panel-2 text-subtle hover:border-line-bold hover:text-ink"
                        }`}
                      >
                        {PAY_CYCLE_LABEL[c]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    Only changes how the figures are sliced &mdash; the yearly totals are the
                    same either way.
                  </p>
                </div>

                <div>
                  <span className="text-sm font-medium text-ink">Lease term</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5].map((y) => (
                      <button
                        key={y}
                        type="button"
                        disabled={readOnly}
                        onClick={() => set("termYears", y)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                          inputs.termYears === y
                            ? "border-accent bg-accent-subtle text-accent"
                            : "border-line bg-panel-2 text-subtle hover:border-line-bold hover:text-ink"
                        }`}
                      >
                        {y} yr
                      </button>
                    ))}
                  </div>
                </div>

                {/*
                  Only meaningful for an electric car, and only since the 2026
                  Budget — but for those it decides everything. The concession
                  is a schedule now, and the phase a lease commences under
                  follows it for its whole life, so the same car started a year
                  apart can be taxed completely differently. Asked here rather
                  than assumed, and hidden where it would change nothing.
                */}
                {inputs.fuelType === "electric" && (
                  <label className="block">
                    <span className="text-sm font-medium text-ink">Lease starts</span>
                    <input
                      type="date"
                      disabled={readOnly}
                      value={lease.scenario.commencementDate ?? ""}
                      onChange={(e) => set("commencementDate", e.target.value || undefined)}
                      className="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
                    />
                    <span className="mt-1 block text-[11px] leading-snug text-muted">
                      The electric car FBT rules change on set dates, and a lease keeps whatever
                      applied when it started. Leave blank to assume it starts this financial year.
                    </span>
                  </label>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-base font-semibold text-ink">The lease</h2>
              <div className="mt-4 space-y-5">
                <Field
                  label="Interest rate"
                  value={inputs.interestRatePct}
                  onChange={(v) => set("interestRatePct", v)}
                  min={2}
                  max={15}
                  step={0.1}
                  suffix="%"
                  hint="The financier's rate. Ask for it — it isn't always quoted."
                />

                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={inputs.includeRunningCosts}
                    disabled={readOnly}
                    onChange={(e) => {
                      set("includeRunningCosts", e.target.checked);
                      track("Running costs toggled", { included: e.target.checked });
                    }}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="text-sm font-medium text-ink">
                      Package the running costs
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Fuel, servicing, tyres, registration and insurance come out of the same
                      deduction — and out of pre-tax salary.
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={inputs.hasHelpDebt ?? false}
                    disabled={readOnly}
                    onChange={(e) => set("hasHelpDebt", e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                  />
                  <span>
                    <span className="text-sm font-medium text-ink">
                      I have a HELP/HECS debt
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Reportable fringe benefits count towards your repayment income, so this
                      can cut into the saving.
                    </span>
                  </span>
                </label>

                {!fbt.exempt && (
                  <div>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      How FBT is handled
                      <InfoTip text="Nearly every lease uses the employee contribution method: you pay part of the package from post-tax salary, which cancels the FBT bill entirely." />
                    </span>
                    <div className="mt-2 grid gap-1.5">
                      {(
                        [
                          ["ecm", "Employee contribution (ECM)", "You pay the FBT taxable value from post-tax salary. FBT becomes nil."],
                          ["employer-pays", "Employer pays the FBT", "The grossed-up FBT bill is added to your deduction instead."],
                        ] as const
                      ).map(([key, label, hint]) => (
                        <button
                          key={key}
                          type="button"
                          disabled={readOnly}
                          onClick={() => {
                            set("fbtMethod", key);
                            track("FBT method changed", { method: key });
                          }}
                          className={`rounded-md border px-3 py-2 text-left transition ${
                            inputs.fbtMethod === key
                              ? "border-accent bg-accent-subtle"
                              : "border-line bg-panel-2 hover:border-line-bold"
                          }`}
                        >
                          <span className="block text-xs font-semibold text-ink">{label}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                            {hint}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
          )}

          {/* ── Results ────────────────────────────────────────────── */}
          <div className="space-y-6">
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  label={`Costs you per ${cycleLabel}`}
                  value={fmtCurrency(result.perPayCycle.takeHomeReduction)}
                  highlight
                  sub={`${fmtCurrency(pkg.takeHomeReduction)} a year off your take-home pay`}
                  explainer={<StatExplainer kind="cost" result={result} config={config} />}
                />
                <StatCard
                  label="Tax you don't pay"
                  value={fmtCurrency(pkg.taxSaved)}
                  unit="/yr"
                  sub={`Relieved at ${(pkg.effectiveReliefRate * 100).toFixed(1)}% on the pre-tax deduction`}
                  explainer={<StatExplainer kind="taxSaved" result={result} config={config} />}
                />
                <StatCard
                  label={comparison.savingVsLoan >= 0 ? "Better than a car loan by" : "Worse than a car loan by"}
                  value={fmtCurrency(Math.abs(comparison.savingVsLoan))}
                  sub={`Over the full ${term.years}-year term`}
                  tag={fbt.exempt ? "FBT exempt" : undefined}
                  tagTone="accent"
                  explainer={<StatExplainer kind="vsLoan" result={result} config={config} />}
                />
              </div>

              {fbt.exempt && (
                <p className="mt-4 rounded-lg border border-success/40 bg-success-subtle px-3.5 py-2.5 text-sm text-success-text">
                  <strong>No FBT on this car.</strong> {fbt.exemptReason} That means the entire
                  package comes out of pre-tax salary — no post-tax contribution at all.
                </p>
              )}

              {warnings.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {warnings.map((w) => (
                    <li
                      key={w}
                      className="rounded-lg border border-warning/40 bg-warning-subtle px-3.5 py-2.5 text-sm text-warning-text"
                    >
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <PayPacketSplit result={result} />
            <CostComparisonChart result={result} config={config} />

            {/* Straight after the comparison, because the comparison assumes
                the lease runs to term and this is what happens when it
                doesn't. Everything above is priced in pre-tax dollars; this
                card is the only one denominated in the other kind. */}
            <EarlyExit result={result} config={config} />

            {/* Breakdown */}
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-ink">What&apos;s in the deduction</h3>
                  <p className="mt-1 text-sm text-muted">
                    Everything the employer takes out of your pay each year, and which side of
                    tax it comes from.
                  </p>
                </div>
                <DeductionExplainer
                  inputs={inputs}
                  config={config}
                  finance={finance}
                  running={running}
                  fbt={fbt}
                  adminFee={inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual}
                />
              </div>

              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 font-medium">Item</th>
                    <th className="pb-2 text-right font-medium">Per year</th>
                    <th className="pb-2 text-right font-medium">Deducted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <Row label="Lease payments" value={finance.annualPayment} side="Pre-tax" />
                  {inputs.includeRunningCosts && (
                    <>
                      <Row label="Fuel or charging" value={running.fuel} side="Pre-tax" indent />
                      <Row label="Servicing" value={running.servicing} side="Pre-tax" indent />
                      <Row label="Tyres" value={running.tyres} side="Pre-tax" indent />
                      <Row label="Registration and CTP" value={running.registration} side="Pre-tax" indent />
                      <Row label="Insurance" value={running.insurance} side="Pre-tax" indent />
                      <Row label="Roadside assistance" value={running.roadside} side="Pre-tax" indent />
                    </>
                  )}
                  <Row
                    label="Lease management fee"
                    value={inputs.adminFeeAnnual ?? config.lease.defaultAdminFeeAnnual}
                    side="Pre-tax"
                  />
                  {fbt.fbtPayable > 0 && (
                    <Row label="Fringe benefits tax (grossed up)" value={fbt.fbtPayable} side="Pre-tax" />
                  )}
                  {fbt.employeeContribution > 0 && (
                    <Row
                      label="Employee contribution (cancels FBT)"
                      value={fbt.employeeContribution}
                      side="Post-tax"
                    />
                  )}
                  <tr className="font-semibold text-ink">
                    <td className="py-2.5">Total deducted</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {fmtCurrency(pkg.preTaxAnnual + pkg.postTaxAnnual)}
                    </td>
                    <td className="py-2.5 text-right text-xs font-normal text-muted">
                      {fmtCurrency(pkg.preTaxAnnual)} pre / {fmtCurrency(pkg.postTaxAnnual)} post
                    </td>
                  </tr>
                </tbody>
              </table>

              {!inputs.includeRunningCosts && (
                <p className="mt-3 text-xs text-muted">
                  Running costs of about {fmtCurrency(running.total)} a year aren&apos;t packaged —
                  you&apos;d pay those from your take-home pay, with GST.
                </p>
              )}
            </section>

            {/* The residual */}
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h3 className="text-base font-semibold text-ink">
                At the end of the {term.years} years
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <StatCard
                  label="Residual to pay out"
                  value={fmtCurrency(finance.residual)}
                  sub={`${finance.residualPct.toFixed(2)}% of the amount financed — the ATO minimum for this term`}
                  explainer={<StatExplainer kind="residual" result={result} config={config} />}
                />
                <StatCard
                  label="Total interest"
                  value={fmtCurrency(finance.totalInterest)}
                  sub={`At ${inputs.interestRatePct}% over ${term.years} years`}
                  explainer={<StatExplainer kind="interest" result={result} config={config} />}
                />
                <StatCard
                  label="GST you avoid"
                  value={fmtCurrency(term.gstSaved)}
                  sub="On the car and on packaged running costs"
                  explainer={<StatExplainer kind="gst" result={result} config={config} />}
                />
              </div>
              <p className="mt-3 text-sm text-subtle">
                The residual isn&apos;t optional — at the end of the term you either pay it to keep
                the car, refinance it into a new lease, or sell the car and cover any shortfall
                yourself. It is the part of a novated lease most people are surprised by.
              </p>
            </section>

            <div className="flex flex-wrap items-center gap-3 pb-4">
              <Link
                href="/report"
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
              >
                See the full report
              </Link>
              <Link
                href="/how-it-works"
                className="rounded border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition hover:bg-panel-2"
              >
                How a novated lease works
              </Link>
              {!user && (
                <span className="text-sm text-muted">
                  <Link href="/signup" className="font-medium text-accent hover:underline">
                    Create an account
                  </Link>{" "}
                  to save and compare scenarios.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* The decoder, the comparison and the printed report all carry this.
            The calculator produces the largest figures on the site and was
            the only one without it. */}
        <Disclosures config={config} />
      </main>
    </>
  );
}

function Row({
  label,
  value,
  side,
  indent = false,
}: {
  label: string;
  value: number;
  side: "Pre-tax" | "Post-tax";
  indent?: boolean;
}) {
  return (
    <tr>
      <td className={`py-2 text-subtle ${indent ? "pl-4" : ""}`}>{label}</td>
      <td className="py-2 text-right tabular-nums text-ink">{fmtCurrency(value)}</td>
      <td className="py-2 text-right">
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            side === "Pre-tax"
              ? "bg-accent-subtle text-accent"
              : "bg-discovery-subtle text-discovery-text"
          }`}
        >
          {side}
        </span>
      </td>
    </tr>
  );
}
