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
import CardHeading from "./CardHeading";
import DeductionExplainer from "./DeductionExplainer";
import StatExplainer from "./StatExplainer";
import PayslipImpact from "./PayslipImpact";
import LockedSummary from "./LockedSummary";
import EarlyExit from "./EarlyExit";
import SuperImpact from "./SuperImpact";
import CostTaster from "./CostTaster";
import LeaseSkeleton from "./LeaseSkeleton";
import SharedLeaseStart from "./SharedLeaseStart";
import type { Vehicle } from "@/lib/au/vehicles";
import { fmtCurrency } from "@/lib/au/format";
import {
  calculateLease,
  capFor,
  capSpendable,
  effectivePayCycle,
  isCappedEmployer,
  PAY_CYCLES_PER_YEAR,
  PAY_CYCLE_LABEL,
  PAY_CYCLE_NOUN,
  type EmployerFbtStatus,
  type PayCycle,
} from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";
import {
  applyScenarioFromQuote,
  leaseFromSharedLease,
  leaseFromSharedQuote,
  hasChosenCar,
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
import LeaseDashboard from "./LeaseDashboard";
import { track, trackLeasePricedConversion } from "@/lib/analytics";
import { takeHandoff, takeSharedLease, takeSharedQuote } from "@/lib/quoteHandoff";
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
    /*
     * Both are read even though at most one is acted on.
     * 
     * Each deletes itself on read, and that is what stops a stale one
     * surfacing later — so leaving the loser in place would just defer the
     * surprise to the next page load. A shared quote wins where both exist:
     * it means the reader arrived here from somebody else's link just now,
     * which is more recent intent than a handoff they left behind.
     */
    const shared = takeSharedQuote();
    const sharedWholeLease = takeSharedLease();
    const handed = takeHandoff();
    if (sharedWholeLease) {
      store.createFrom(
        leaseFromSharedLease(sharedWholeLease.lease, config, undefined, sharedWholeLease.salary),
      );
    } else if (shared) {
      store.createFrom(leaseFromSharedQuote(shared.vehicle, shared.quote, config, shared.leaseName));
    } else if (handed) {
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

  /** Rendered in the narrow column while deciding, and inline once settled. */
  /*
   * The left column holds one of two things, never nothing.
   *
   * Your own lease gets the quotes card. A shared one cannot have it — the
   * page renders the SENDER's lease while the store belongs to the viewer, so
   * those controls would edit a lease that is not on screen — so it gets the
   * invitation to take a copy instead. Both occupy the same column, which is
   * why the grid below can simply ask whether there is a sidebar.
   */
  const quotesCard = readOnly ? null : <QuotesCard store={store} config={config} signedIn={Boolean(user)} />;
  const sidebar = quotesCard ?? (sharedLease ? <SharedLeaseStart lease={sharedLease} /> : null);
  /**
   * Collapsed on a phone, open on a desktop.
   *
   * Below lg the card is at the top of a single column, where it has to be —
   * pushed below the result it was 8,600px down and nobody was going to find
   * it. But at full height it is the first screen of a calculator, spent on
   * something you cannot do yet. So it opens to a bar.
   *
   * State only governs the phone. At lg the panel carries lg:block and the
   * toggle lg:hidden, so the column is always open there whatever this says —
   * which also means it cannot be left in a state that hides the sidebar on a
   * resize.
   */
  const [quotesOpen, setQuotesOpen] = useState(false);

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

        {/* The question the page is answering, which is not the same question
            once a lease is running. "What would it cost you?" is conditional
            tense addressed to somebody who has signed — and the taster under
            it prices a decision they have already made. */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {locked ? "How your lease is tracking" : "What would a novated lease actually cost you?"}
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm text-subtle">
            {locked ? (
              <>
                Payments against the ones you agreed to, how much of the car you have actually
                paid off, and what is sitting in the account your provider holds. Build the
                ledger by pasting their transactions and it all follows from that.
              </>
            ) : (
              <>
                Put in your salary and the car you have in mind. We&apos;ll show the pre-tax and
                post-tax split, what FBT does to it, and how the total compares with buying the
                same car another way — all on {config.financialYear} rules.
              </>
            )}
          </p>
          {/* Before the first number, not after the last one. A reader who
              assumes this is another provider's calculator reads everything
              below as a pitch. */}
          <Independence className="mt-2.5 max-w-3xl" />
        </div>

        {/* Immediately under the question it answers. Below the car card it
            landed 1.16 screens down on a phone, which is no better than not
            being there — the card is over a thousand pixels tall once it
            stacks.

            Only once there is a car, though. Every other input has a default
            worth computing from; the car does not. Leading with "it costs you
            $354 a fortnight" for a $55,000 electric default nobody picked
            would be the most prominent wrong number on the site. */}
        {/* Nothing below the hero until the lease has actually arrived.

            The store opens on defaults and swaps once local storage or the
            account answers, so the page rendered a $55,000 electric car
            nobody chose and then jumped to the real one. Holding the shape
            until it is known costs a beat and removes the flash. */}
        {store.loading ? (
          <LeaseSkeleton />
        ) : (
        <>
        {!locked && hasChosenCar(lease.vehicle) && (
          <CostTaster
            result={result}
            config={config}
            /* scenario.fromQuoteId is what "these figures are modelled on that
               quote" means, so it is also what decides whether the rate beside
               them is a solved fact or our assumption. */
            rateFromQuote={
              lease.quotes.find((q) => q.id === lease.scenario.fromQuoteId)?.label?.trim() ||
              undefined
            }
          />
        )}

        {/* The page reads down one column now: the car, the terms it is on,
            then what those terms do to your pay. The quotes sit beside all of
            it rather than between the car and the terms, because they are a
            running tally rather than a step — you collect them over days, and
            what you learn from one changes the term or the rate you try next.
            Sticky for the same reason.

            Locked, the inputs are no longer inputs: they are the terms of a
            decision. The column goes rather than being greyed out — a wall of
            disabled sliders reads as a page fighting you — and the same facts
            come back as a summary, with the payslip under it. */}
        <div
          className={
            locked || !sidebar
              ? // One column, because there is no sidebar to make room for.
                //
                // A shared lease has no quotes card — the recipient is not
                // choosing between quotes, they were sent a result — but the
                // two-column rule did not know that, so it kept reserving the
                // 22rem track and rendered a 352px-wide, 0px-high nothing down
                // the left of every shared page, with the lease squashed into
                // what was left.
                "space-y-6"
              : // grid-cols-1 is not redundant. Without it the single implicit
                // column below `lg` is `auto`, which sizes to MAX-content, so
                // the panel grew to 586px inside a 390px phone and took the
                // whole page sideways with it. The minmax(0,…) guards only
                // apply once the two-column rule does. grid-cols-1 expands to
                // repeat(1, minmax(0,1fr)), which clamps it to the container.
                "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
          }
        >
          {/* ── The quotes ─────────────────────────────────────────────
              First in the source again, which on a phone is the top of the
              page, and at lg is placed into the left column. Source order and
              what you see now agree at both widths, so the tab order and a
              screen reader follow the same path as the eye. */}
          {!locked && sidebar && (
            <div className="space-y-3 lg:col-start-1 lg:row-start-1 lg:sticky lg:top-20 lg:self-start">
              {/* The accordion exists to keep a tall quotes card from burying
                  the car on a phone. The shared-lease panel is four lines and
                  is the reason the reader is here, so it is not hidden behind
                  a tap. */}
              {!quotesCard ? (
                sidebar
              ) : (
                <>
              <button
                type="button"
                onClick={() => {
                  setQuotesOpen((o) => !o);
                  if (!quotesOpen) track("Quotes card expanded", { from: "mobile-accordion" });
                }}
                aria-expanded={quotesOpen}
                aria-controls="quotes-panel"
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-left shadow-[var(--shadow-card)] transition hover:border-accent lg:hidden"
              >
                {/* Named for what it does rather than what it holds. "Quotes
                    from providers" describes a container, and a container is
                    only worth opening if you already know what goes in it —
                    which on a phone, at the top of the page, before anything
                    has been entered, nobody does. */}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">
                      Decode a provider quote
                    </span>
                    {lease.quotes.length > 0 && (
                      <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent">
                        {lease.quotes.length}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                    When you get a quote or estimate from a provider, enter their numbers here to
                    reveal the real costs.
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-medium text-accent">
                    {quotesOpen ? "Hide" : lease.quotes.length > 0 ? "Show" : "Add one"}
                  </span>
                  <span
                    aria-hidden
                    className={`text-muted transition-transform ${quotesOpen ? "rotate-180" : ""}`}
                  >
                    ▾
                  </span>
                </span>
              </button>

              <div id="quotes-panel" className={`${quotesOpen ? "" : "hidden"} lg:block`}>
                {quotesCard}
              </div>
                </>
              )}
            </div>
          )}

          {/* ── The car, the terms, the numbers ────────────────────── */}
          {/* First in the source, and placed into the SECOND column at lg.
              It used to be second in the source and first on screen, which
              collapsed on a phone into quotes-before-anything-else — you had
              to scroll past a card about collecting quotes to reach the car
              you had not described yet.

              Explicit placement rather than a CSS `order` swap. Order moves
              what you see and not what you tab to or what a screen reader
              reads, so it would have fixed the phone by making those two
              disagree. This way the document says what it means — the main
              flow, then an aside — and the sidebar's position on the left at
              desktop is the bit that is decoration. */}
          <div className="space-y-6 lg:col-start-2 lg:row-start-1">
          {/* Locked, the car is settled too.
          
              A quote is a quote for a particular car at a particular price —
              the GST credit, the FBT base value and the amount financed all
              come off it — so a price edited under a lock leaves the summary
              beside it describing a car the quote was never written against.
              Same rule the decoder has always applied to a locked quote: it is
              the record of a decision, not a draft.
          
              Shown as values rather than disabled controls, because a greyed
              row of selects invites a fight with the page instead of
              explaining itself. */}
          <VehicleCard
            header={!readOnly && <LeaseBar store={store} signedIn={Boolean(user)} />}
            readOnlyVehicle={Boolean(locked)}
            readOnlyNote={
              locked
                ? "Settled with the quote you locked in — the price sets the GST credit, the FBT base value and the amount financed, so it cannot move while the quote does not. Unlock above to change the car."
                : undefined
            }
            stepHeading={!locked && <CardHeading step={1}>The vehicle</CardHeading>}
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
            // The stored car, not the computed inputs: leaseToInputs falls back
            // to the engine's own default so every figure has something to work
            // with, and reading that back into the box printed a price nobody
            // had typed — which is the thing being removed.
            price={lease.vehicle.price}
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

          {/* Settled, the page changes job.
              
              Before the signature everything here is a comparison — three
              columns, a crossover rate, what a different car would do. After
              it there is one lease, the terms cannot move, and the only
              questions left are whether it is being administered properly:
              are the payments the agreed ones, what is still owed, and how
              much of your pay is sitting in their account.
              
              So the comparison is not shrunk, it is put away. It is one click
              down and still correct, because a signed lease is not a reason to
              lose the reasoning behind it — people come back to it when the
              first statement arrives and does not look like the quote. */}
          {locked && (
            <>
              <LeaseDashboard
                lease={lease}
                config={config}
                quoteLabel={quoteLabel(locked)}
                onUnlock={() => store.update(unlockQuote)}
                onAddRows={(rows) => store.update((l) => ({ ...l, statement: rows }))}
              />

              <details className="rounded-xl border border-line bg-panel-2 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink">
                  The quote, the modelling and the comparison
                  <span className="ml-2 font-normal text-muted">
                    — everything the decision was based on
                  </span>
                </summary>
                <div className="mt-4 space-y-6">
                  {quotesCard}
                  <LockedSummary
                    inputs={inputs}
                    result={result}
                    config={config}
                    quoteLabel={quoteLabel(locked)}
                    onUnlock={() => store.update(unlockQuote)}
                  />
                  <PayslipImpact result={result} config={config} quoteLabel={quoteLabel(locked)} />
                  {/* The charts and the three-way comparison are not repeated
                      here — they are the report, in full, and duplicating them
                      inside a disclosure on the dashboard would be two copies
                      of the same modelling to keep in step. */}
                  <p className="text-sm text-subtle">
                    The full modelling — the comparison against a loan and cash, the paydown chart,
                    the early-exit position and every assumption behind them — is in{" "}
                    <Link href="/report" className="font-semibold text-accent hover:underline">
                      your report
                    </Link>
                    .
                  </p>
                </div>
              </details>
            </>
          )}

          {/* ── The terms ──────────────────────────────────────────── */}
          {!locked && (
            <>
            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <CardHeading step={2}>You and your employer</CardHeading>
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

                {/* Who you work for changes the answer rather than refining it:
                    inside a cap there is no FBT to cancel, so the post-tax
                    contribution this site would otherwise tell you to make is
                    money for nothing. Asked, not assumed — most people who
                    have a cap have already spent it on rent or a mortgage. */}
                <div>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    Who you work for
                    <InfoTip text="Public hospitals, ambulance services, public benevolent institutions and health promotion charities pay no FBT up to an annual cap. Inside it there is nothing to cancel, so no post-tax contribution is needed." />
                  </span>
                  <select
                    value={inputs.employerFbtStatus ?? "ordinary"}
                    disabled={readOnly}
                    onChange={(e) =>
                      set("employerFbtStatus", e.target.value as EmployerFbtStatus)
                    }
                    className="mt-2 w-full min-w-0 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-60"
                  >
                    <option value="ordinary">An ordinary employer</option>
                    <option value="hospital">Hospital, health service or ambulance</option>
                    <option value="pbi">Charity or benevolent institution</option>
                    <option value="rebatable">Other non-profit (FBT-rebatable)</option>
                  </select>

                  {isCappedEmployer(inputs.employerFbtStatus) && (
                    <label className="mt-3 block">
                      <span className="text-sm font-medium text-ink">
                        Already packaged each year
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Rent, mortgage or everyday living expenses through your packaging
                        provider. Your cap is{" "}
                        {fmtCurrency(
                          capSpendable(capFor(inputs.employerFbtStatus ?? "ordinary", config), config),
                        )}{" "}
                        a year — whatever is left of it can absorb the car instead.
                      </span>
                      {/* Same as the percentage below: blank rather than a
                          zero nobody can delete. */}
                      <input
                        type="number"
                        min="0"
                        step="500"
                        inputMode="numeric"
                        placeholder="0"
                        value={inputs.capUsedSpendable ?? ""}
                        disabled={readOnly}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") return set("capUsedSpendable", undefined);
                          const n = parseFloat(raw);
                          set("capUsedSpendable", Number.isNaN(n) ? undefined : n);
                        }}
                        onBlur={() => {
                          const n = inputs.capUsedSpendable;
                          if (n != null && n < 0) set("capUsedSpendable", 0);
                        }}
                        className="mt-2 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm tabular-nums text-ink focus:border-accent focus:outline-none disabled:opacity-60"
                      />
                    </label>
                  )}

                  {/* Asked of everyone, not just capped employers: it is a term
                      of a packaging scheme rather than a tax status, and a
                      university or a council can run one without having a cap.
                      Asked rather than inferred — the percentage varies, it is
                      not published anywhere we could read it, and guessing it
                      would be worse than a blank. */}
                  <label className="mt-3 block">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      Employer keeps a share of the saving
                      <InfoTip text="Common in public health, ambulance services and universities: the employer runs the packaging as a scheme and keeps part of the tax benefit it creates, usually half. It shows up on a payslip as a second pre-tax line beside the lease, often called 'share of saving'. A provider's quote states what you keep, without saying it is a share." />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Leave at zero unless your payslip or quote shows such a line. Check the
                      percentage against your own payslip — it is a term of your employer&apos;s
                      scheme, not the financier&apos;s.
                    </span>
                    <div className="mt-2 flex items-center gap-2">
                      {/* Empty, not zero, when unset.
                          A `?? 0` fallback pins a 0 in the box that cannot be
                          deleted — select it, type 4, and the field reads 04,
                          because the control re-renders the old value straight
                          back. Blank is the only value a number input can be
                          cleared TO, which is why QuoteField has always done
                          it this way.

                          Clamped on blur rather than on every keystroke, so
                          typing is never rewritten underneath the cursor. The
                          engine clamps regardless, so a moment of 150 on
                          screen costs nothing. */}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        inputMode="numeric"
                        placeholder="0"
                        value={inputs.employerSavingSharePct ?? ""}
                        disabled={readOnly}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") return set("employerSavingSharePct", undefined);
                          const n = parseFloat(raw);
                          set("employerSavingSharePct", Number.isNaN(n) ? undefined : n);
                        }}
                        onBlur={() => {
                          const n = inputs.employerSavingSharePct;
                          if (n == null) return;
                          const clamped = Math.min(100, Math.max(0, n));
                          if (clamped !== n) set("employerSavingSharePct", clamped);
                        }}
                        className="w-full min-w-0 rounded-lg border border-line bg-panel px-3 py-2 text-sm tabular-nums text-ink focus:border-accent focus:outline-none disabled:opacity-60"
                      />
                      <span className="shrink-0 text-sm text-muted">% of the tax saved</span>
                    </div>
                  </label>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]">
              <CardHeading step={3}>The lease</CardHeading>
              <div className="mt-4 space-y-5">

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
            </>
          )}

          {/* ── Results ──────────────────────────────────────────────
              Only once there is a car. The page used to open at a $55,000
              electric default and show the whole set — a saving, a payment, a
              comparison, an early-exit table — all of it confidently about a
              car nobody had chosen. The decoder has refused to do that since
              it was built; this is the same rule on the page that produces the
              largest figures on the site.

              Gated on the PRICE rather than on hasChosenCar: the catalogue
              carries specifications and not prices, so a car can be chosen and
              still have nothing to compute against. Showing results then would
              have swapped a visible default for an invisible one. */}
          {locked ? null : lease.vehicle.price == null ? (
            <section className="rounded-xl border border-dashed border-line bg-panel-2 p-6">
              <CardHeading eyebrow="Result">Waiting on the price</CardHeading>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-subtle">
                {hasChosenCar(lease.vehicle)
                  ? "We know the car — now tell us what it costs. "
                  : "Pick a car above, or just enter a price. "}
                Every figure below it is worked out from that one number: the GST the financier
                claims back, the FBT base value, whether an electric car clears the exemption
                threshold, and the payment itself. The catalogue holds specifications, not
                prices — they move by dealer and by week, so it has to come from you.
              </p>
            </section>
          ) : (
          <div className="space-y-6">
            <section
              id="the-numbers"
              className="scroll-mt-20 rounded-xl border border-line bg-panel p-5 shadow-[var(--shadow-card)]"
            >
              {/* The card had no title at all: three figures and a stack of
                  warnings, with nothing saying what it was or that it was the
                  point of the three cards above it. Marked as the result
                  rather than a fourth step, because it is not something to
                  fill in — numbering it would send people hunting for an input
                  that does not exist. */}
              <CardHeading eyebrow="Result">What it comes to</CardHeading>
              <p className="mt-1 mb-4 max-w-3xl text-sm text-subtle">
                Your three answers, costed against the rules in force — and anything about them
                worth knowing before you sign.
              </p>

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
            <CostComparisonChart
              result={result}
              config={config}
              opportunityRatePct={lease.scenario.opportunityRatePct}
              onOpportunityRate={readOnly ? undefined : (v) => set("opportunityRatePct", v)}
              loanRatePct={lease.scenario.comparisonLoanRatePct}
              onLoanRate={readOnly ? undefined : (v) => set("comparisonLoanRatePct", v)}
            />

            {/* Between the payslip and the exit card, because it belongs with
                the other thing nobody is shown: a cost that is real, lawful
                and invisible on every document the user will ever be handed. */}
            <SuperImpact
              result={result}
              config={config}
              onEmployerPays={
                readOnly ? undefined : (v) => set("employerPaysSuperOnPreSacrifice", v || undefined)
              }
            />

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
                  {/* Says that nothing here was typed, because that is the
                      question the table raises and cannot answer: the figures
                      are not editable on this page, so a reader who doubts one
                      has nowhere to go. The taxonomy itself stays in the
                      explainer — one clause here is a pointer, not a second
                      copy of it. */}
                  <p className="mt-1 text-sm text-muted">
                    Everything the employer takes out of your pay each year, and which side of
                    tax it comes from. None of it is typed in here — each line is either worked
                    out from the figures above or benchmarked from published data.
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
                {/* The GST-INCLUSIVE figure, because this card answers "what
                    do I have to find at the end" and the answer is the one
                    with GST on it. The lease document states the residual
                    without — that is the figure the ATO percentage is of, and
                    the one a provider's quote shows — so it stays in the
                    note, where it reconciles against their paperwork without
                    being mistaken for the cheque.

                    The paragraph below this grid used to break the news that
                    GST applies. It no longer has to: the headline is the real
                    number. */}
                <StatCard
                  label="Residual to pay out (inc. GST)"
                  value={fmtCurrency(term.residualPayable)}
                  sub={`${fmtCurrency(finance.residual)} on the lease at ${finance.residualPct.toFixed(2)}% — the ATO minimum for this term — plus GST`}
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
                  sub="On the car and packaged running costs, less the GST on the buyout"
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
          )}
          </div>

        </div>
        </>
        )}

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
