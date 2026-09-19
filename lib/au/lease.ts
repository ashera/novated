// A lease is the thing a person is actually deciding about.
//
// Before this, the calculator owned a scenario and the decoder owned quotes,
// and each carried its own copy of the car. That was wrong twice over: you had
// to describe the same vehicle in two places, and nothing tied a quote to the
// scenario it should be judged against.
//
// So the car is defined ONCE, on the lease, and both tools read it. A quote is
// a child of the lease it quotes for. Saving saves the lot, and a person can
// have several leases on the go — most people shopping for a car are comparing
// more than one.
//
// The engine is deliberately untouched by all this. LeaseInputs and Quote still
// carry the vehicle fields they always did; this module composes them from the
// shared spec at the point of use, so the storage shape and the calculation
// shape can change independently.

import type { AuState } from "./config";
import type { PurchaseBreakdown } from "./purchase";
import type { BodyType, Vehicle } from "./vehicles";
import type {
  AnnualRunningCosts,
  CarCondition,
  EmployerFbtStatus,
  FbtMethod,
  FuelType,
  LeaseInputs,
  PayCycle,
  PurchaseChannel,
} from "./novated";
import { defaultInputs } from "./novated";
import {
  decodeQuote,
  quoteToLeaseInputs,
  type Quote,
  type QuoteFrequency,
  type QuoteLines,
} from "./quote";
import type { EngineConfig } from "./config";
import type { StatementRow } from "./statement";
import { DEFAULT_CONFIG } from "./config";

/** The car. Defined once per lease, shared by every tool. */
export interface VehicleSpec {
  /** Catalogue vehicle, when one was picked. Drives the artwork. */
  vehicleId?: string;
  /**
   * A car the catalogue doesn't have yet.
   *
   * Only read when there is no vehicleId. The catalogue is 44 curated models
   * and the Australian market is hundreds, so "not listed" is a normal state,
   * not an error — and a lease that can't name the car is a lease the user
   * can't check. The consumption figure is the one that matters beyond
   * display: without it the engine falls back to a class average, which at
   * 15,000km a year is hundreds of dollars of error in the running-cost
   * budget the padding findings are measured against.
   */
  make?: string;
  model?: string;
  bodyType?: BodyType;
  /**
   * The CAR's cost price, GST included — not the drive-away figure.
   * Never inferred: it varies by dealer.
   */
  price?: number;
  /** Stamp duty, rego, CTP and plates, where they are financed. Kept apart
   *  from the price because the ATO keeps them out of the FBT base value. */
  onRoadCosts?: number;
  /** What the user itemised in the price builder, so it can be reopened and
   *  corrected rather than retyped. */
  purchase?: PurchaseBreakdown;
  fuelType: FuelType;
  annualKm?: number;
  state?: AuState;
  /** The model's own combined-cycle figure, when the catalogue knows it. */
  consumptionPer100km?: number;
  /** Delivery. Only the decoder asks; part-year FBT depends on it. */
  firstHeldDate?: string;
  /**
   * New, ex-demo or second-hand, and the facts that follow from it.
   *
   * Absent means new, which is what every lease saved before we asked was
   * modelled as — so an existing lease's figures do not move when this ships.
   * `firstRegisteredDate` is about the CAR's history, not this driver's: it is
   * what decides whether a second-hand EV can be exempt at all, and is not to
   * be confused with `firstHeldDate`, which is the day this lease takes
   * delivery.
   */
  condition?: CarCondition;
  firstRegisteredDate?: string;
  /** What it sold for new — the price the exemption's cap is measured on. */
  firstRetailPrice?: number;
  purchasedFrom?: PurchaseChannel;
}

/** Everything the calculator needs that ISN'T about the car. */
export interface ScenarioSpec {
  salary: number;
  termYears: number;
  interestRatePct: number;
  residualPct?: number;
  includeRunningCosts: boolean;
  fbtMethod: FbtMethod;
  hasHelpDebt?: boolean;
  /** Ordinary unless they work for a hospital, ambulance service, PBI,
   *  health promotion charity or other rebatable non-profit. */
  employerFbtStatus?: EmployerFbtStatus;
  /** Spendable dollars of the annual FBT cap already used on other packaging. */
  capUsedSpendable?: number;
  runningCostOverrides?: Partial<AnnualRunningCosts>;
  adminFeeAnnual?: number;
  establishmentFee?: number;
  /** What the "car loan" column is costed at. Defaults to the same secured
   *  car loan benchmark the decoder judges a quote's finance rate against —
   *  deliberately NOT the lease's own rate, which would let a poor quote drag
   *  its own comparison up with it. */
  comparisonLoanRatePct?: number;
  /** What the cash would earn if it weren't spent on the car. Only the
   *  "paid in cash" column uses it. */
  opportunityRatePct?: number;
  /** Whether the employer works super out on salary before packaging. Rare
   *  enough to be worth asking, valuable enough to be worth asking about. */
  employerPaysSuperOnPreSacrifice?: boolean;
  /** How often this person is paid. Display only. */
  payCycle?: PayCycle;
  /**
   * When the lease commences.
   *
   * On the scenario rather than the vehicle, because it is a fact about the
   * ARRANGEMENT: the same car leased a year apart can be taxed differently
   * now that the electric car concession is a schedule, and the phase a lease
   * starts under follows it for life. Not to be confused with the vehicle's
   * firstRegisteredDate, which is about the car's own history.
   */
  commencementDate?: string;
  /**
   * The quote these figures were taken from, if any.
   *
   * The id and not the numbers: the label and the solved rate are derived
   * from the quote when they are shown, so editing the quote updates what
   * the calculator says about it rather than leaving a stale copy behind.
   * Store inputs, never results.
   */
  fromQuoteId?: string;
}

/** Everything a decoded quote holds that ISN'T about the car. */
export interface QuoteSpec {
  id: string;
  label: string;
  frequency: QuoteFrequency;
  amountFinanced?: number;
  residualIncGst?: number;
  termMonths: number;
  /** The rate the quote itself claims, where it prints one. */
  statedRatePct?: number;
  /** What the provider said accounts for the gap, once asked. */
  explainedFeesFinanced?: number;
  explainedFeesPerPayment?: number;
  /** Months deferred before the first payment, and whether the end date moved. */
  deferredMonths?: number;
  deferralExtendsTerm?: boolean;
  lines: QuoteLines;
  statedPreTax?: number;
  statedPostTax?: number;
  /** A quote may be written against a different salary than the scenario. */
  salary?: number;
  /** When it was added. "Processed on" in the UI. */
  createdAt?: string;
  updatedAt?: string;
}

/**
 * How far along a quote is.
 *
 * Derived, never stored. A status someone has to remember to set is a status
 * that goes stale, and this one has an obvious definition anyway: a quote is
 * complete when we can do the thing the tool exists to do — recover the
 * interest rate. Anything less is still being typed in.
 */
export type QuoteStatus = "new" | "in-progress" | "complete";

export function quoteStatus(
  lease: Lease,
  spec: QuoteSpec,
  config: EngineConfig,
): QuoteStatus {
  const touched =
    spec.amountFinanced != null ||
    spec.residualIncGst != null ||
    spec.statedRatePct != null ||
    spec.statedPreTax != null ||
    Object.values(spec.lines).some((v) => typeof v === "number");
  if (!touched) return "new";
  return decodeQuote(leaseToQuote(lease, spec), config).impliedRatePct != null
    ? "complete"
    : "in-progress";
}

export interface Lease {
  version: 1;
  name: string;
  vehicle: VehicleSpec;
  scenario: ScenarioSpec;
  quotes: QuoteSpec[];
  /**
   * Transactions pasted from the provider's portal, kept over time.
   *
   * Inputs, not results: the rows are what the statement said, and every
   * total, rate and trend is recomputed from them on read. A portal shows
   * twenty-five rows at a time, so the only way to see a year is to keep what
   * has been seen — and once it is kept, the interesting question stops being
   * "does this window add up" and becomes "is anything missing".
   */
  statement?: StatementRow[];
  notes?: string;
  /**
   * The quote the user has settled on.
   *
   * Different from scenario.fromQuoteId, which only says what the figures are
   * modelled on — you can try several. This is a decision: "this is the one",
   * and it is what turns the page from a what-if into a payslip they can
   * expect. Always the active quote or absent, so the two can never disagree.
   */
  lockedQuoteId?: string;
}

/** What to call a quote on screen. Names are stored as typed, so a blank or
 *  whitespace-only one needs something to show. */
export function quoteLabel(spec: { label?: string }, fallback = "Untitled quote"): string {
  return spec.label?.trim() || fallback;
}

/**
 * Has anybody said who sent this quote?
 *
 * A quote without a provider on it is a page of figures with no owner. The
 * whole point of keeping several is to put them beside each other, and
 * "Untitled quote" against "Untitled quote" compares nothing — so this is a
 * requirement rather than a nicety, and {@link lockQuote} enforces it.
 *
 * It used to be dodged by pre-filling "Quote 2", which looked like an answer
 * and so was left alone. A field nobody has filled in should look like one.
 */
/** What the decoder should open on, given the lease and the id it was asked for. */
export interface DecoderTarget {
  /** The existing quote to edit, or null to start a fresh one. */
  spec: QuoteSpec | null;
  /** Show the worked example — only right for somebody who has told us nothing. */
  isExample: boolean;
  /** Show an empty form carrying the lease's car. */
  blankAgainstTheirCar: boolean;
  /** Opening blank while other quotes exist, so the page can say where they are. */
  hasOthers: boolean;
}

/**
 * Which quote the decoder opens, and what it shows before anything is typed.
 *
 * Extracted because it had two bugs in it at once and there is no way to test
 * a component here. Both came from the same mistake — inferring intent from
 * the lease's contents instead of from what was actually asked for.
 *
 * It used to fall back to the lease's first quote whenever no id was given,
 * so "Decode a quote" in the nav silently reopened an old one. Landing on
 * figures you half-recognise reads as a bug even when they are yours. Nothing
 * requested now means a new quote, every time.
 *
 * The car is deliberately not cleared with the rest. It belongs to the lease
 * rather than to any quote — which is the whole reason the two are stored
 * apart — and re-entering it for each provider would be asking the same
 * question three times.
 */
export function decoderTarget(lease: Lease, activeQuoteId: string | null): DecoderTarget {
  const spec = lease.quotes.find((q) => q.id === activeQuoteId) ?? null;
  // A worked example suits somebody with no car AND no quotes. Having quotes
  // but no car still counts as having told us something, so that gets the
  // blank form rather than an $85,000 demonstration.
  const isExample = !spec && !hasChosenCar(lease.vehicle) && lease.quotes.length === 0;
  return {
    spec,
    isExample,
    blankAgainstTheirCar: !spec && !isExample,
    hasOthers: !spec && lease.quotes.length > 0,
  };
}

export function quoteIsNamed(spec: { label?: string }): boolean {
  return (spec.label ?? "").trim().length > 0;
}

/**
 * What to call the car, wherever it is shown.
 *
 * The catalogue entry when there is one, otherwise what the user told us, and
 * a placeholder only when we genuinely have nothing.
 */
export function vehicleName(
  v: VehicleSpec,
  catalogue: Vehicle[],
  fallback = "Your car",
): string {
  const picked = catalogue.find((c) => c.id === v.vehicleId);
  if (picked) return `${picked.make} ${picked.model}`;
  const custom = [v.make?.trim(), v.model?.trim()].filter(Boolean).join(" ");
  return custom || fallback;
}

/** True when the user has described a car we don't stock. */
export function isCustomVehicle(v: VehicleSpec): boolean {
  return !v.vehicleId && Boolean(v.make?.trim() || v.model?.trim());
}

/**
 * Has anybody actually said what the car is?
 *
 * The lease always has a car, because the engine needs one to compute
 * anything — an untouched lease carries a $55,000 electric default. That is
 * fine as a starting point and dangerous as an answer: every figure derived
 * from it is a confident number about a car the reader never chose.
 *
 * So anything that states a result as though it were theirs checks this
 * first. Three ways to have chosen: picked one from the catalogue, described
 * one we don't stock, or simply typed a price over the default.
 */
export function hasChosenCar(v: VehicleSpec): boolean {
  return Boolean(v.vehicleId) || isCustomVehicle(v) || v.price != null;
}

/**
 * Does this lease's price need breaking down?
 *
 * The price field used to be a single box labelled "also Drive Away Price",
 * so a lot of stored leases hold a drive-away figure where the car's cost
 * price belongs. That silently overstates the FBT base value by the whole of
 * the stamp duty, registration and CTP — and on an electric car it can push
 * the price past the exemption threshold and cost the lot.
 *
 * We cannot tell a drive-away figure from a car price by looking at it. What
 * we can tell is whether anyone was ever ASKED: a price with no breakdown
 * behind it was typed before the question existed. Saving anything through
 * the price builder — even "it's just the car" — records an answer and
 * settles it.
 *
 * There is no default price to exclude any more, so every price in the box was
 * typed by somebody and every one of them is worth asking about — including
 * the $55,000 car that used to collide with the default and go unprompted.
 */
export function priceNeedsBreakdown(v: VehicleSpec): boolean {
  return v.price != null && v.purchase == null;
}

/**
 * A lease with no car in it yet.
 *
 * It used to open at $55,000, which put a number in the price box that nobody
 * had typed and a full set of results underneath it — confident figures about
 * a car the reader had never chosen. Every consumer then needed a way to tell
 * that apart from a real answer, which is the whole reason hasChosenCar and
 * priceNeedsBreakdown had to compare against this function's own default and
 * carry caveats about a genuine $55,000 car being mistaken for it.
 *
 * Absent is a state the type already had. The fuel type and the distance stay,
 * because they are assumptions about use rather than claims about a particular
 * car, and both are visible controls the reader can see are set.
 */
export function defaultVehicle(): VehicleSpec {
  return { fuelType: "electric", annualKm: 15_000 };
}

export function defaultScenario(): ScenarioSpec {
  const d = defaultInputs(DEFAULT_CONFIG);
  return {
    salary: d.salary,
    termYears: d.termYears,
    interestRatePct: d.interestRatePct,
    includeRunningCosts: d.includeRunningCosts,
    fbtMethod: d.fbtMethod,
    hasHelpDebt: false,
  };
}

export function newLease(name = "My lease"): Lease {
  return {
    version: 1,
    name,
    vehicle: defaultVehicle(),
    scenario: defaultScenario(),
    quotes: [],
  };
}

/**
 * A blank quote to start typing into.
 *
 * The term defaults to the lease's own rather than to five years, because a
 * quote is a quote FOR this lease: on a three-year lease, starting every new
 * quote at 60 months means correcting the same field every time. It is still
 * only a default — providers quote 48 against 60 on the same car, and telling
 * them apart is most of the reason for holding two quotes at once.
 */
export function newQuoteSpec(label = "", termMonths = 60): QuoteSpec {
  return {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    frequency: "fortnightly",
    termMonths,
    lines: {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * A lease of your own, from a quote somebody sent you.
 *
 * The share link is read-only and deliberately narrow — it carries the car and
 * one provider's document, and nothing about the person who was quoted. That
 * makes it a good thing to be sent and a dead end to act on: the figures on it
 * are priced against somebody else's salary, and the reader's own position can
 * be very different on the same quote. Two people on the same car and the same
 * rate can be tens of thousands apart once their brackets, HELP and FBT
 * position are in it.
 *
 * So this takes the two things the share DOES carry and builds a workspace
 * around them. The reader lands on a lease that already knows the car and
 * already holds the quote, with only their own salary left to enter — which is
 * the one thing we could not have known and the one thing that makes the
 * answer theirs.
 *
 * It is a COPY, in every sense that matters. A fresh id, so nothing here can
 * be confused with the sender's quote; a fresh createdAt, because "processed
 * on" means when it reached this workspace; and no salary, because a quote may
 * have been written against one and it is not the reader's business. Nothing
 * the reader does afterwards reaches the sender — there is no link back, by
 * design.
 *
 * The quote is activated, not merely attached. Landing on a lease that holds
 * the document but models our own default rate would answer a question nobody
 * asked — the reader followed a link about THIS quote, and a headline figure
 * computed from something else is worse than no figure, because it looks like
 * an answer. Where the quote cannot be solved `activateQuote` declines, and
 * the term set below is what survives: the arithmetic falls back, the term
 * does not.
 */
export function leaseFromSharedQuote(
  vehicle: VehicleSpec,
  spec: QuoteSpec,
  config: EngineConfig,
  name = "My lease",
): Lease {
  const base = newLease(name);
  const quote: QuoteSpec = {
    ...spec,
    id: newQuoteSpec().id,
    createdAt: new Date().toISOString(),
    updatedAt: undefined,
    // Stripped on the server before it is ever serialised to the reader; done
    // again here because this is the function that decides what a copy IS, and
    // a second caller should not have to know to strip it.
    salary: undefined,
  };
  const seeded: Lease = {
    ...base,
    vehicle,
    scenario: {
      ...base.scenario,
      // The term belongs to the quote, not to the reader's preferences — a
      // four-year quote modelled over five is not that quote any more.
      termYears: spec.termMonths / 12,
    },
    quotes: [quote],
  };
  return activateQuote(seeded, quote.id, config);
}

// ── Composing what the engine expects ───────────────────────────────────────

/** The lease as calculator inputs: the shared car, plus the scenario. */
export function leaseToInputs(lease: Lease): LeaseInputs {
  const base = defaultInputs(DEFAULT_CONFIG);
  const v = lease.vehicle;
  return {
    ...base,
    ...lease.scenario,
    vehicleId: v.vehicleId,
    vehiclePrice: v.price ?? base.vehiclePrice,
    onRoadCosts: v.onRoadCosts,
    fuelType: v.fuelType,
    annualKm: v.annualKm ?? base.annualKm,
    state: v.state,
    consumptionPer100km: v.consumptionPer100km,
    condition: v.condition,
    firstRegisteredDate: v.firstRegisteredDate,
    firstRetailPrice: v.firstRetailPrice,
    purchasedFrom: v.purchasedFrom,
  };
}

/** One of the lease's quotes, as the decoder expects it: the shared car,
 *  plus the figures transcribed off that document. */
export function leaseToQuote(lease: Lease, spec: QuoteSpec): Quote {
  const v = lease.vehicle;
  return {
    label: spec.label,
    frequency: spec.frequency,
    vehiclePrice: v.price,
    onRoadCosts: v.onRoadCosts,
    fuelType: v.fuelType,
    vehicleId: v.vehicleId,
    consumptionPer100km: v.consumptionPer100km,
    state: v.state,
    annualKm: v.annualKm,
    firstHeldDate: v.firstHeldDate,
    condition: v.condition,
    firstRegisteredDate: v.firstRegisteredDate,
    firstRetailPrice: v.firstRetailPrice,
    purchasedFrom: v.purchasedFrom,
    amountFinanced: spec.amountFinanced,
    residualIncGst: spec.residualIncGst,
    termMonths: spec.termMonths,
    statedRatePct: spec.statedRatePct,
    explainedFeesFinanced: spec.explainedFeesFinanced,
    explainedFeesPerPayment: spec.explainedFeesPerPayment,
    deferredMonths: spec.deferredMonths,
    deferralExtendsTerm: spec.deferralExtendsTerm,
    lines: spec.lines,
    statedPreTax: spec.statedPreTax,
    statedPostTax: spec.statedPostTax,
    salary: spec.salary ?? lease.scenario.salary,
  };
}

/**
 * Overlay the lease's car onto a quote, whatever car the quote was carrying.
 *
 * The decoder shows the car as settled — it belongs to the lease and is
 * changed in the calculator — so an edit made there must never be able to
 * redefine it. Without this, the first keystroke against the example quote
 * copied its $85,000 demonstration price onto the lease as though the user
 * had chosen it, and the page then offered no way to correct it.
 *
 * Delivery is deliberately not overlaid: it is stored on the vehicle but
 * belongs to the quote, and part-year FBT turns on it.
 */
export function withLeaseVehicle(lease: Lease, q: Quote): Quote {
  const v = lease.vehicle;
  return {
    ...q,
    vehicleId: v.vehicleId,
    vehiclePrice: v.price,
    onRoadCosts: v.onRoadCosts,
    fuelType: v.fuelType,
    annualKm: v.annualKm,
    state: v.state,
    consumptionPer100km: v.consumptionPer100km,
    condition: v.condition,
    firstRegisteredDate: v.firstRegisteredDate,
    firstRetailPrice: v.firstRetailPrice,
    purchasedFrom: v.purchasedFrom,
  };
}

/**
 * Put a quote's figures into the lease's scenario.
 *
 * One definition of what "modelling this quote" means, because there are two
 * ways in — the decoder's hand-off and the quotes list on the hub — and a
 * field copied in one place but not the other would quietly model half a
 * quote. The car is untouched: it belongs to the lease, and every quote on
 * that lease is a quote for the same car.
 */
export function applyScenarioFromQuote(
  lease: Lease,
  inputs: LeaseInputs,
  quoteId?: string,
): Lease {
  return {
    ...lease,
    scenario: {
      ...lease.scenario,
      interestRatePct: inputs.interestRatePct,
      residualPct: inputs.residualPct,
      includeRunningCosts: inputs.includeRunningCosts,
      runningCostOverrides: inputs.runningCostOverrides,
      adminFeeAnnual: inputs.adminFeeAnnual,
      termYears: inputs.termYears,
      commencementDate: inputs.commencementDate ?? lease.scenario.commencementDate,
      fromQuoteId: quoteId,
    },
    // Modelling a different quote means the decision is being reconsidered, so
    // a lock on the old one is stale. Enforced here rather than at each call
    // site, because there are two ways in — this page's list and the decoder's
    // hand-off — and a lock left pointing at a quote the figures are no longer
    // modelled on would put a payslip on screen built from something else.
    lockedQuoteId: lease.lockedQuoteId === quoteId ? lease.lockedQuoteId : undefined,
  };
}

/**
 * Model one of the lease's own quotes, without going via the decoder.
 *
 * Returns the lease unchanged when the quote can't be solved: without a rate,
 * quoteToLeaseInputs falls back to OUR default, and applying that while
 * labelling it the quote's figures would be a lie the user has no way to see.
 * Callers should only offer this for a quote that decodes.
 */
export function activateQuote(lease: Lease, quoteId: string, config: EngineConfig): Lease {
  const spec = lease.quotes.find((q) => q.id === quoteId);
  if (!spec) return lease;
  const quote = leaseToQuote(lease, spec);
  const decoded = decodeQuote(quote, config);
  if (decoded.impliedRatePct == null) return lease;
  return applyScenarioFromQuote(lease, quoteToLeaseInputs(quote, decoded, config), quoteId);
}

/** Settle on the quote currently being modelled. */
export function lockQuote(lease: Lease, quoteId: string): Lease {
  if (lease.scenario.fromQuoteId !== quoteId) return lease;
  const spec = lease.quotes.find((q) => q.id === quoteId);
  if (!spec) return lease;
  // Refused here and not only in the button, because locking in is the record
  // of a decision — and "I settled on Untitled quote" is not one. The card
  // disables the button for the same reason, but the rule belongs with the
  // entity rather than with one of the places that offers it.
  if (!quoteIsNamed(spec)) return lease;
  return { ...lease, lockedQuoteId: quoteId };
}

export function unlockQuote(lease: Lease): Lease {
  return { ...lease, lockedQuoteId: undefined };
}

/**
 * Throw a quote away.
 *
 * Two rules, and both are about not leaving the lease pointing at something
 * that no longer exists:
 *
 *   - a LOCKED quote is refused outright. Locking in is the record of a
 *     decision, and the payslip on the lease page is built from it — deleting
 *     it would take that away without the user ever revisiting the decision.
 *     Unlock first, which is a deliberate act in its own right.
 *   - if it was the quote being modelled, the ATTRIBUTION goes and the figures
 *     stay. The rate, term and budgets on the lease are the user's inputs now;
 *     silently reverting them would undo work they never asked to lose. What
 *     can't survive is the claim that they came from a quote that is gone.
 */
export function removeQuote(lease: Lease, quoteId: string): Lease {
  if (lease.lockedQuoteId === quoteId) return lease;
  if (!lease.quotes.some((q) => q.id === quoteId)) return lease;
  const wasModelled = lease.scenario.fromQuoteId === quoteId;
  return {
    ...lease,
    quotes: lease.quotes.filter((q) => q.id !== quoteId),
    scenario: wasModelled
      ? { ...lease.scenario, fromQuoteId: undefined }
      : lease.scenario,
  };
}

/** The locked quote, if the lock is still meaningful. */
export function lockedQuote(lease: Lease): QuoteSpec | null {
  const id = lease.lockedQuoteId;
  if (!id || id !== lease.scenario.fromQuoteId) return null;
  return lease.quotes.find((q) => q.id === id) ?? null;
}

/** Split an edited Quote back apart: the car onto the lease, the rest onto the
 *  quote. Editing the vehicle from inside the decoder must update the lease,
 *  or the two tools drift apart again. */
export function applyQuoteEdit(lease: Lease, quoteId: string, q: Quote): Lease {
  const vehicle: VehicleSpec = {
    ...lease.vehicle,
    vehicleId: q.vehicleId,
    price: q.vehiclePrice,
    onRoadCosts: q.onRoadCosts,
    fuelType: q.fuelType,
    annualKm: q.annualKm,
    state: q.state,
    consumptionPer100km: q.consumptionPer100km,
    firstHeldDate: q.firstHeldDate,
  };
  const quotes = lease.quotes.map((s) =>
    s.id !== quoteId
      ? s
      : {
          ...s,
          // Stored exactly as typed. Trimming here looked harmless but the
          // name field reads its value back out of the lease, so a trailing
          // space vanished on the keystroke that made it and the next letter
          // landed against the trimmed text: "Maxxia offer" came out
          // "Maxxiaoffer". Falling back to the old name on an empty field was
          // worse still — clearing it looked like the edit hadn't saved.
          // Tidying belongs at the point of display: see quoteLabel.
          label: q.label ?? s.label,
          frequency: q.frequency,
          amountFinanced: q.amountFinanced,
          residualIncGst: q.residualIncGst,
          termMonths: q.termMonths,
          statedRatePct: q.statedRatePct,
          explainedFeesFinanced: q.explainedFeesFinanced,
          explainedFeesPerPayment: q.explainedFeesPerPayment,
          deferredMonths: q.deferredMonths,
          deferralExtendsTerm: q.deferralExtendsTerm,
          lines: q.lines,
          statedPreTax: q.statedPreTax,
          statedPostTax: q.statedPostTax,
          salary: q.salary,
          updatedAt: new Date().toISOString(),
        },
  );
  return { ...lease, vehicle, quotes };
}

// ── Reading what's already stored ───────────────────────────────────────────

/** Bring anything stored — a current lease, or a pre-lease scenario or quote —
 *  up to the current shape. Anything unrecognisable becomes a fresh lease
 *  rather than an error, so a corrupt row still opens. */
export function migrateLease(raw: unknown): Lease {
  if (!raw || typeof raw !== "object") return newLease();
  const l = raw as Partial<Lease>;
  if (!l.vehicle && !l.scenario) return newLease();
  return {
    version: 1,
    name: l.name?.trim() || "My lease",
    vehicle: { ...defaultVehicle(), ...(l.vehicle ?? {}) },
    scenario: { ...defaultScenario(), ...(l.scenario ?? {}) },
    quotes: Array.isArray(l.quotes)
      ? l.quotes
          .filter((q) => q && q.id)
          // Quotes stored before createdAt existed fall back to when they were
          // last touched, so the list always has a date to show.
          .map((q) => ({ ...q, createdAt: q.createdAt ?? q.updatedAt }))
      : [],
    notes: l.notes,
    // Only meaningful while it still points at a quote that exists and is the
    // one being modelled — a lock left on a deleted or superseded quote would
    // claim a decision the user did not make.
    lockedQuoteId: l.lockedQuoteId,
    // Every row needs a date and an amount to be worth anything: a row missing
    // either cannot be ordered or totalled, and one that arrives from storage
    // malformed would poison the reconciliation rather than fail visibly.
    statement: Array.isArray(l.statement)
      ? l.statement.filter((r) => r && typeof r.date === "string" && typeof r.amount === "number")
      : [],
  };
}
