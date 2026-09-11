"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Field from "./Field";
import InfoTip from "./InfoTip";
import StatCard from "./StatCard";
import TopBar, { type TopBarUser } from "./TopBar";
import PayPacketSplit from "./PayPacketSplit";
import CostComparisonChart from "./CostComparisonChart";
import InfoBlastBanner from "./InfoBlastBanner";
import VehicleCard from "./VehicleCard";
import type { Vehicle } from "@/lib/au/vehicles";
import { fmtCurrency } from "@/lib/au/format";
import { calculateLease, type FuelType, type LeaseInputs } from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";
import { leaseToInputs, type Lease } from "@/lib/au/lease";
import { useLease } from "./useLease";
import LeaseCard from "./LeaseCard";
import { track, trackLeasePricedConversion } from "@/lib/analytics";
import { takeHandoff, type QuoteHandoff } from "@/lib/quoteHandoff";
import { trackVisit } from "@/app/actions/track";

const STORAGE_KEY = "leasewiz-scenario";

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
  const [fromQuote, setFromQuote] = useState<QuoteHandoff | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // A quote handed over from the decoder carries the rate we solved and that
  // quote's own running-cost budgets. The CAR no longer needs carrying — both
  // tools read it off the same lease.
  useEffect(() => {
    if (sharedLease) return setHydrated(true);
    const handed = takeHandoff();
    if (handed) {
      setFromQuote(handed);
      store.update((l) => ({
        ...l,
        scenario: {
          ...l.scenario,
          interestRatePct: handed.inputs.interestRatePct,
          residualPct: handed.inputs.residualPct,
          includeRunningCosts: handed.inputs.includeRunningCosts,
          runningCostOverrides: handed.inputs.runningCostOverrides,
          adminFeeAnnual: handed.inputs.adminFeeAnnual,
          termYears: handed.inputs.termYears,
        },
      }));
    }
    setHydrated(true);
    // Runs once: the handoff is consumed on read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputs = useMemo(() => leaseToInputs(lease), [lease]);

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
  const cycleLabel = config.lease.payCyclesPerYear === 26 ? "fortnight" : "pay";

  return (
    <>
      <TopBar user={user} country={country} reviewDue={reviewDue} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {fromQuote ? (
          <div className="mb-5 rounded-xl border border-accent-border bg-accent-subtle px-4 py-3">
            <p className="text-sm text-ink">
              <strong>Filled in from {fromQuote.label}.</strong>{" "}
              {fromQuote.impliedRatePct != null && (
                <>
                  Modelled at the {fromQuote.impliedRatePct.toFixed(2)}% we solved from that
                  quote, with its own running-cost budgets.{" "}
                </>
              )}
              Change anything below to see what would have to be different.
            </p>
            <Link
              href="/decode"
              className="mt-1 inline-block text-sm font-medium text-accent hover:underline"
            >
              ← Back to the quote
            </Link>
          </div>
        ) : (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 shadow-[var(--shadow-card)]">
            <p className="text-sm text-subtle">
              <strong className="text-ink">Already been sent a quote?</strong> We&apos;ll work out
              the interest rate it doesn&apos;t print, and what the numbers really mean.
            </p>
            <Link
              href="/decode"
              className="rounded bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              Decode a quote
            </Link>
          </div>
        )}

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
        </div>

        {!readOnly && <LeaseCard store={store} signedIn={Boolean(user)} config={config} />}

        <div className="mb-6">
          <VehicleCard
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
            annualKm={inputs.annualKm}
            onAnnualKm={(v) => setVehicle({ annualKm: v })}
            state={inputs.state}
            onState={(st) => setVehicle({ state: st })}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* ── Inputs ─────────────────────────────────────────────── */}
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
                  hint="Before tax and before any packaging."
                />

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

          {/* ── Results ────────────────────────────────────────────── */}
          <div className="space-y-6">
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  label={`Costs you per ${cycleLabel}`}
                  value={fmtCurrency(pkg.takeHomeReduction / config.lease.payCyclesPerYear)}
                  highlight
                  sub={`${fmtCurrency(pkg.takeHomeReduction)} a year off your take-home pay`}
                />
                <StatCard
                  label="Tax you don't pay"
                  value={fmtCurrency(pkg.taxSaved)}
                  unit="/yr"
                  sub={`Relieved at ${(pkg.effectiveReliefRate * 100).toFixed(1)}% on the pre-tax deduction`}
                />
                <StatCard
                  label={comparison.savingVsLoan >= 0 ? "Better than a car loan by" : "Worse than a car loan by"}
                  value={fmtCurrency(Math.abs(comparison.savingVsLoan))}
                  sub={`Over the full ${term.years}-year term`}
                  tag={fbt.exempt ? "FBT exempt" : undefined}
                  tagTone="accent"
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
            <CostComparisonChart result={result} />

            {/* Breakdown */}
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <h3 className="text-base font-semibold text-ink">What&apos;s in the deduction</h3>
              <p className="mt-1 text-sm text-muted">
                Everything the employer takes out of your pay each year, and which side of tax
                it comes from.
              </p>

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
                />
                <StatCard
                  label="Total interest"
                  value={fmtCurrency(finance.totalInterest)}
                  sub={`At ${inputs.interestRatePct}% over ${term.years} years`}
                />
                <StatCard
                  label="GST you avoid"
                  value={fmtCurrency(term.gstSaved)}
                  sub="On the car and on packaged running costs"
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
