// Decoding a real provider quote.
//
// A novated lease quote is a dense page of figures that answers the question
// "what comes out of your pay" and studiously avoids the question "what is this
// costing me". The gap between those two is where this module lives.
//
// The central move is arithmetic, not opinion: a lease quote states the amount
// financed, the residual, the term and a finance rental, and those four numbers
// determine the interest rate exactly. Providers publish the first four and omit
// the fifth. We solve for it.
//
// Everything else here is a comparison against a benchmark that is itself stored
// as cited reference data, so a finding is a sourced claim rather than our
// opinion — see EngineConfig.benchmarks and lib/au/sources.ts.

import type { AuState, EngineConfig } from "./config";
import { marginalRelief } from "./tax";
import { fbtProRataFactor, fbtYearFor, daysAvailableInFirstFbtYear } from "./fbtYear";
import {
  annuityPayment,
  impliedRate,
  luxuryCarAdjustment,
  buildRunningCosts,
  defaultInputs,
  PAY_CYCLES_PER_YEAR,
  type AnnualRunningCosts,
  type CarCondition,
  type FuelType,
  type LeaseInputs,
  type PurchaseChannel,
} from "./novated";

/** The pay cycle a quote's figures are expressed in. Providers publish exactly
 *  one of these and never label it twice, so the reader has to tell us which —
 *  and getting it wrong scales every figure by 2x or more. */
export type QuoteFrequency = "weekly" | "fortnightly" | "monthly";

/** Pays per year for each cycle. The same numbers as a pay cycle, kept in one
 *  place — though the two stay separate types, because how a provider presents
 *  its figures and how often someone is paid are different facts that only
 *  happen to share an enum. */
export const CYCLES_PER_YEAR: Record<QuoteFrequency, number> = PAY_CYCLES_PER_YEAR;

/** The line items a quote breaks its package into. Every field is optional: a
 *  quote that omits one is a real quote, and the omission is itself a finding. */
export interface QuoteLines {
  /** The finance rental — "Lease Payment", "Repayments", "Lease Rental". */
  finance?: number;
  /** "Power", "Fuel/Charging", "Electricity". */
  energy?: number;
  /** "Servicing", "Maintenance". */
  maintenance?: number;
  tyres?: number;
  /** "Registration", "Registration + CTP". */
  registration?: number;
  insurance?: number;
  roadside?: number;
  /** "Lease Management", "Management Fee", "Admin Fee". */
  managementFee?: number;
  /** "Luxury Car Charge", "Luxury Car Adjustment". */
  luxuryCarAdjustment?: number;
}

export interface Quote {
  /** Free-text label the user gives it — the provider's name, usually. Never
   *  leaves the owner's own account; published benchmarks are anonymised. */
  label?: string;
  frequency: QuoteFrequency;

  // The car
  /** The CAR's cost price, inc GST — not the drive-away total. Stamp duty,
   *  rego and CTP live in onRoadCosts, because the ATO keeps them out of the
   *  FBT base value. */
  vehiclePrice?: number;
  /** Stamp duty, registration, CTP and plates, where they are financed. */
  onRoadCosts?: number;
  fuelType: FuelType;
  /** Catalogue vehicle, when the user picked one. Never sets the price. */
  vehicleId?: string;
  /** This model's consumption, when known from the catalogue. */
  consumptionPer100km?: number;

  // The finance
  amountFinanced?: number;
  residualIncGst?: number;
  termMonths: number;
  /**
   * The rate the quote claims, where it prints one. Most do not, which is the
   * reason this site solves it instead — but when a quote does state one it is
   * the most checkable claim on the document, and the gap between what it says
   * and what its own payment implies is nearly always something real sitting
   * inside the rental.
   */
  statedRatePct?: number;
  /**
   * What a provider said accounts for the gap, once asked.
   *
   * Two fields because a provider's answer distinguishes them and the
   * arithmetic does too. A fee capitalised into the amount borrowed is
   * amortised at the rate for the whole term; a charge sitting inside each
   * payment is flat. The same sentence — "there's an establishment fee in
   * there" — can mean either, and treating one as the other reconciles to the
   * wrong number and wrongly accuses somebody of a shortfall.
   */
  explainedFeesFinanced?: number;
  /** At the quote's frequency, like every other line. */
  explainedFeesPerPayment?: number;
  /**
   * Months between the financier settling the car and the first payment.
   *
   * The third kind of explanation a provider offers for a payment above their
   * stated rate, after a capitalised fee and a charge inside the rental — and
   * the only one that is a change to the schedule rather than to an amount.
   * Their money is out from settlement, so interest accrues through the
   * deferral and has to be repaid by whatever payments remain.
   *
   * Real, and commonly two months while payroll sets the deductions up.
   * Bounded, too, which is what makes the claim checkable.
   */
  deferredMonths?: number;
  /**
   * Does the lease still end when it was going to?
   *
   * The single question that decides how much a deferral is worth, and the one
   * nobody volunteers. If the residual date holds, the deferred months come
   * out of the payment count and everything is repaid by fewer, larger
   * payments. If the whole schedule moves, the payment rises by little more
   * than the interest that accrued. On five years at 9.5% that is the
   * difference between +4.3% and +1.9%.
   *
   * Defaults to the end date holding, because a term is normally written
   * against an FBT year and a residual the ATO sets by term.
   */
  deferralExtendsTerm?: boolean;

  // What the quote says comes out of your pay, at `frequency`
  lines: QuoteLines;
  statedPreTax?: number;
  statedPostTax?: number;

  /** Where the car is registered — registration and CTP vary by state. */
  state?: AuState;

  // You
  salary?: number;
  annualKm?: number;
  /** When the car is first held — delivery, in practice. ISO date. Quotes are
   *  written on a full-FBT-year assumption; this is what tests that. */
  firstHeldDate?: string;

  /** New, ex-demo or second-hand, and what follows from it: whether the FBT
   *  exemption can reach the car at all, and whether there is GST to claim.
   *  Carried from the lease, like every other fact about the car. */
  condition?: CarCondition;
  /** When the CAR was first registered — not when this lease takes delivery,
   *  which is firstHeldDate. */
  firstRegisteredDate?: string;
  firstRetailPrice?: number;
  purchasedFrom?: PurchaseChannel;
}

export type FindingSeverity = "critical" | "warn" | "ok";

export interface Finding {
  /** Stable key, so a finding can be tested and linked to without matching prose. */
  key: string;
  severity: FindingSeverity;
  /** Short category shown as a chip: Rate, Framing, Budget, Fees, GST… */
  category: string;
  title: string;
  detail: string;
  /** What this finding is worth over the whole term, where that's calculable.
   *  Findings are ordered by this, so the expensive ones surface first. */
  costOverTerm?: number;
  /** A question to send back to the provider, when the finding implies one. */
  question?: string;
}

/**
 * Checking a provider's explanation against their own figures.
 *
 * The decoder solves a rate, hands over a question, and until now stopped
 * there. This is the third step and the one nobody else does: they answer,
 * and the answer is arithmetic, so it can be tested rather than believed.
 *
 * Reconciling is not endorsing. A clean reconciliation means the explanation
 * is complete — not that the fees are reasonable — so what they cost is
 * reported alongside it, because "that accounts for the gap" and "that is
 * worth paying" are different findings and only one of them was asked about.
 */
export interface RateReconciliation {
  /** The payment their stated rate produces once their fees are included. */
  expectedMonthly: number;
  /** The payment the quote actually charges. */
  actualMonthly: number;
  /** Still unaccounted for, over the term. Positive = charged beyond the
   *  explanation; negative = the explanation overshoots what is charged. */
  unexplainedOverTerm: number;
  /** What the inclusions themselves cost over the term, at the stated rate.
   *  Includes the deferral, which is one of them. */
  feesOverTerm: number;
  /** Of that, what the deferral alone accounts for. Nil where there isn't one. */
  deferralOverTerm: number;
  /** True where the explanation lands within a dollar a month. */
  reconciles: boolean;
}

export interface QuoteDecode {
  /** The rate the quote didn't print. Null when it can't be determined. */
  impliedRatePct: number | null;
  /** Why we couldn't determine it, when we couldn't. */
  rateBlockedBy: string | null;
  amountFinanced: number | null;
  /** True when we derived the financed amount rather than reading it. */
  financedWasDerived: boolean;
  residualExGst: number | null;
  residualPctOfFinanced: number | null;
  monthlyFinancePayment: number | null;
  totalInterest: number | null;
  /** What the same lease would cost at the benchmark loan rate. */
  interestAtBenchmark: number | null;
  financeMargin: number | null;
  /** The itemised lines, annualised and summed. */
  annualLines: Record<string, number>;
  annualPackageTotal: number;
  /** Stated pre-tax + post-tax, annualised. Null when the quote doesn't say. */
  annualStatedDeduction: number | null;
  /** Stated deduction less the lines that explain it. */
  reconciliationGap: number | null;
  /** The rate the quote claims, where it printed one. */
  statedRatePct: number | null;
  /** The monthly payment that rate would actually produce on these figures. */
  paymentAtStatedRate: number | null;
  /** What the quote charges over the term above its own stated rate. Negative
   *  means the payment is below what the stated rate would cost. */
  statedRateGap: number | null;
  /** Whether what they said accounts for what they charge. Null until asked. */
  reconciliation: RateReconciliation | null;
  /**
   * The rate on the borrowing once disclosed fees are treated as borrowed.
   *
   * impliedRatePct is the all-in figure: it solves the payment against the
   * amount financed, so anything else inside the payment — a capitalised fee,
   * brokerage, an insurance — comes out looking like interest, because to the
   * person paying it there is no difference. That is the number that matters
   * and it does not move when fees are disclosed.
   *
   * This is the other half: put the fees where they belong, as money borrowed
   * rather than interest charged, and what is left is the rate on the loan —
   * which should land on the rate the provider stated. Showing both is what
   * makes the gap legible: neither figure is wrong, they are answers to
   * different questions.
   */
  ratePaidOnBorrowingPct: number | null;
  /** The rate on the money once a disclosed deferral is accounted for. Null
   *  where none is disclosed, or the figures it needs are missing. */
  rateAfterDeferralPct: number | null;
  findings: Finding[];
  questions: string[];
}

const GST = 1.1;

/** Annualise a figure published at the quote's frequency. */
function annualise(v: number, f: QuoteFrequency): number {
  return v * CYCLES_PER_YEAR[f];
}

/**
 * The three figures the interest rate is solved from, resolved the same way
 * every time.
 *
 * Two of them are not simply what somebody typed, which is why this is shared
 * rather than repeated. The amount financed is derived from the drive-away
 * price when the field is left blank — the form invites that, and most quotes
 * are read that way. And the residual is entered GST-inclusive, because that
 * is how providers quote it, but the finance is written over the ex-GST
 * figure, so the rate is solved against residualIncGst / 1.1.
 *
 * Getting either wrong does not fail loudly: it produces a plausible rate that
 * is quietly a few points out, or a per-field check that disagrees with the
 * finding underneath it about whether the same numbers are possible.
 */
export interface FinanceBasis {
  /** Stated, or derived from the drive-away price less the GST credit. */
  amountFinanced: number | null;
  /** True where it was derived rather than read off the quote. */
  financedWasDerived: boolean;
  /** The residual the finance is actually written over. */
  residualExGst: number | null;
  /** The finance line as a monthly amount, whatever cycle it was quoted at. */
  monthlyFinance: number | null;
}

/**
 * What a lease is written over, when the quote does not say.
 *
 * The financier pays the dealer's whole invoice — the car AND its on-road
 * costs — and claims the GST back on the car alone. So on-roads are part of
 * what is borrowed, which the engine has always had right
 * (novated.ts: price - gstCredit + onRoads) and the decoder's own placeholder
 * did not: it showed the car less the GST and left the on-roads out, so the
 * greyed figure disagreed with the lease it came from AND with what this file
 * computed when the field was left blank.
 *
 * Exported so there is one formula. Two were enough to disagree.
 */
export function derivedAmountFinanced(quote: Quote, config: EngineConfig): number | null {
  if (quote.vehiclePrice == null) return null;
  const driveAway = quote.vehiclePrice + (quote.onRoadCosts ?? 0);
  const creditable = Math.min(quote.vehiclePrice, config.gst.carLimit);
  return driveAway - (creditable - creditable / (1 + config.gst.rate));
}

/**
 * The rate on a schedule that starts late.
 *
 * Solved rather than read off, because a deferral compounds at the very rate
 * being solved for — the principal it grows depends on the answer. The payment
 * still rises monotonically with the rate, so bisection settles it; this is
 * impliedRate's method against the schedule a deferral actually produces.
 *
 * Extracted because two places want it: the rate on the borrowing once
 * disclosed fees are set aside, and the rate on the money once a deferral is
 * accounted for. Written twice they would drift, and the second copy is how
 * the first one's fix gets missed.
 */
export function rateWithDeferral(
  principal: number,
  balloon: number,
  payment: number,
  termMonths: number,
  deferredMonths: number,
  extendsTerm: boolean,
): number | null {
  const payments = extendsTerm ? termMonths : termMonths - deferredMonths;
  if (!(principal > 0) || !(payment > 0) || payments <= 0) return null;

  const payAt = (x: number) =>
    annuityPayment(principal * Math.pow(1 + x / 100 / 12, deferredMonths), balloon, x, payments);

  let lo = -5;
  let hi = 60;
  if (payAt(hi) < payment || payAt(lo) > payment) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (payAt(mid) < payment) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function financeBasis(quote: Quote, config: EngineConfig): FinanceBasis {
  const derived = derivedAmountFinanced(quote, config);
  let amountFinanced = quote.amountFinanced ?? null;
  let financedWasDerived = false;
  if (amountFinanced == null && derived != null) {
    amountFinanced = derived;
    financedWasDerived = true;
  }

  return {
    amountFinanced,
    financedWasDerived,
    residualExGst: quote.residualIncGst != null ? quote.residualIncGst / GST : null,
    monthlyFinance:
      quote.lines.finance != null ? annualise(quote.lines.finance, quote.frequency) / 12 : null,
  };
}

const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
/** Cents kept, for a figure read straight off the document. */
const cents = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
/** The quote's own period, said as a person would. */
const FREQ_NOUN: Record<QuoteFrequency, string> = {
  weekly: "week",
  fortnightly: "fortnight",
  monthly: "month",
};
const pct = (n: number) => `${n.toFixed(2)}%`;

/** "a", "a and b", "a, b and c" — so a generated sentence reads like English. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Decode a quote: solve the rate, reconcile the payment, and compare every line
 * against a cited benchmark.
 */
export function decodeQuote(quote: Quote, config: EngineConfig): QuoteDecode {
  const f = quote.frequency;
  const findings: Finding[] = [];

  // ── The financed amount ──────────────────────────────────────────────────
  // Where a quote doesn't state it, drive-away less the capped GST credit
  // reproduces it exactly on every quote that does — so derive it, and say so.
  //
  // Drive-away is the car PLUS the on-roads: the financier pays the dealer's
  // whole invoice. The GST credit is on the car alone, because that is what
  // the car limit applies to and what carries the GST.
  const driveAway =
    quote.vehiclePrice != null ? quote.vehiclePrice + (quote.onRoadCosts ?? 0) : null;
  const creditable = Math.min(quote.vehiclePrice ?? 0, config.gst.carLimit);
  const gstCredit = creditable - creditable / (1 + config.gst.rate);
  const basis = financeBasis(quote, config);
  const amountFinanced = basis.amountFinanced;
  const financedWasDerived = basis.financedWasDerived;
  const residualExGst = basis.residualExGst;
  const residualPctOfFinanced =
    residualExGst != null && amountFinanced ? (residualExGst / amountFinanced) * 100 : null;

  // ── The rate ─────────────────────────────────────────────────────────────
  const monthlyFinance = basis.monthlyFinance;

  let rate: number | null = null;
  let rateBlockedBy: string | null = null;
  if (quote.lines.finance == null) {
    rateBlockedBy =
      "The quote doesn't separate the finance payment from the running costs, so the interest rate can't be worked out from it.";
  } else if (amountFinanced == null) {
    rateBlockedBy =
      "The quote doesn't state the amount financed or the drive-away price, so the interest rate can't be worked out from it.";
  } else if (residualExGst == null) {
    rateBlockedBy =
      "The quote doesn't state the residual, so the interest rate can't be worked out from it.";
  } else {
    rate = impliedRate(amountFinanced, residualExGst, monthlyFinance!, quote.termMonths);
    if (rate == null) {
      rateBlockedBy =
        "These figures don't produce a sensible interest rate — one of the amount financed, residual, term or payment is likely to have been read wrongly.";
    }
  }

  // ── Interest, and what it would be at the benchmark ───────────────────────
  let totalInterest: number | null = null;
  let interestAtBenchmark: number | null = null;
  let financeMargin: number | null = null;
  if (rate != null && amountFinanced != null && residualExGst != null && monthlyFinance != null) {
    totalInterest = monthlyFinance * quote.termMonths + residualExGst - amountFinanced;
    const benchPayment = annuityPayment(
      amountFinanced,
      residualExGst,
      config.benchmarks.loanRatePct,
      quote.termMonths,
    );
    interestAtBenchmark =
      benchPayment * quote.termMonths + residualExGst - amountFinanced;
    financeMargin = totalInterest - interestAtBenchmark;
  }

  // ── Annualise the lines ──────────────────────────────────────────────────
  const annualLines: Record<string, number> = {};
  for (const [k, v] of Object.entries(quote.lines)) {
    if (typeof v === "number") annualLines[k] = annualise(v, f);
  }
  const annualPackageTotal = Object.values(annualLines).reduce((a, b) => a + b, 0);

  /* The financed figure the luxury car test needs, as far as it is known here
   * — the solve proper happens below, and this must not reorder it. */
  const amountFinancedForLca =
    quote.amountFinanced ?? (quote.vehiclePrice != null ? quote.vehiclePrice : null);

  const annualStatedDeduction =
    quote.statedPreTax != null || quote.statedPostTax != null
      ? annualise((quote.statedPreTax ?? 0) + (quote.statedPostTax ?? 0), f)
      : null;
  const reconciliationGap =
    annualStatedDeduction != null ? annualStatedDeduction - annualPackageTotal : null;

  /*
   * A gap that looks like an employer keeping part of the saving.
   *
   * Public health services, ambulance services and universities commonly run
   * the packaging as a scheme and take a share — usually half — of the tax
   * benefit it creates. On a payslip it is a second pre-tax line beside the
   * lease, often called "share of saving". On a quote it is frequently not
   * itemised at all: the inclusions list the car's costs, the deduction is
   * bigger, and nothing says why.
   *
   * Which is exactly the shape this looks for. The excess is measured against
   * the tax the whole deduction actually relieves, because that is what a
   * share is a share OF — and a fraction of the relief landing in a plausible
   * band is a far more specific signal than "the numbers don't add up".
   *
   * Reported from a real quote: inclusions of $717.96 a fortnight against a
   * deduction of $862.72, the $144.76 difference being precisely half the
   * $289.53 of tax the packaging saved.
   *
   * The band is deliberately narrow, and that is the whole design.
   *
   * Any unexplained gap is SOME fraction of the relief, so a wide band claims
   * this mechanism for every quote that simply doesn't add up — which is both
   * wrong and worse than the honest "nothing explains the difference" the
   * generic finding already gives. Written wide, it fired on five existing
   * fixtures that have nothing to do with employers at all.
   *
   * So it looks only for the arrangement that actually exists at scale: an
   * even split. The public health schemes this comes from take half, and a
   * gap landing within a few points of exactly half the relief is a specific
   * enough coincidence to be worth naming. A quarter-share would be missed —
   * and that is the right trade, because the generic finding still fires and
   * still asks the right question. A missed detection costs a reader one
   * sharper sentence; a false one tells them their employer is taking money
   * that a financed insurance actually explains.
   *
   * A luxury car adjustment is excluded first for the same reason: it is a
   * known cause of exactly this gap, and it has a real figure behind it
   * rather than a fitted one.
   */
  let employerShareGuess: { pct: number; annual: number; taxSaved: number } | null = null;
  if (
    reconciliationGap != null &&
    reconciliationGap > 50 &&
    annualStatedDeduction != null &&
    quote.salary != null &&
    quote.salary > 0
  ) {
    const lca =
      quote.lines.luxuryCarAdjustment == null && amountFinancedForLca != null
        ? luxuryCarAdjustment(amountFinancedForLca, config)
        : 0;
    const explainedByLca = lca > 0 && Math.abs(reconciliationGap - lca) < lca * 0.35;
    const relieved = marginalRelief(quote.salary, annualStatedDeduction, config).taxSaved;
    const asPct = relieved > 0 ? (reconciliationGap / relieved) * 100 : 0;
    if (!explainedByLca && asPct >= 44 && asPct <= 56) {
      employerShareGuess = { pct: asPct, annual: reconciliationGap, taxSaved: relieved };
    }
  }

  /*
   * What the quote says its rate is, against what its payment actually does.
   *
   * A gap is not usually dishonesty and the finding must not read as an
   * accusation: an establishment fee amortised into the rental, broker margin
   * over a base rate, or an insurance financed in will all widen it, and every
   * one of those is a real thing to ask about rather than a lie to catch.
   * Priced in dollars over the term, because "2.5 percentage points" is not a
   * number anybody can act on and "$4,200" is.
   */
  const statedRatePct = quote.statedRatePct ?? null;
  const paymentAtStatedRate =
    statedRatePct != null && amountFinanced != null && residualExGst != null
      ? annuityPayment(amountFinanced, residualExGst, statedRatePct, quote.termMonths)
      : null;
  const statedRateGap =
    paymentAtStatedRate != null && monthlyFinance != null
      ? (monthlyFinance - paymentAtStatedRate) * quote.termMonths
      : null;

  /*
   * What they said, against what they charge.
   *
   * Only once there is something to reconcile: a rate they claim, the figures
   * it applies to, and at least one fee they have named. Until then this is
   * silent rather than zero, because "nothing unexplained" and "nobody has
   * been asked yet" are different states and only one of them is reassuring.
   */
  const explainedFinanced = quote.explainedFeesFinanced ?? 0;
  const explainedPerPayment = quote.explainedFeesPerPayment ?? 0;
  /*
   * A deferral is an explanation like any other, so it opens the
   * reconciliation on its own — somebody told "it's the two-month deferral"
   * and nothing else has a claim to test and no fee to enter.
   *
   * Clamped below the term: a deferral that swallows every payment is not a
   * lease, and without the guard it would divide by nothing and report a
   * confident absurdity.
   */
  const deferred = Math.max(0, Math.min(quote.deferredMonths ?? 0, quote.termMonths - 1));
  const hasExplanation = explainedFinanced > 0 || explainedPerPayment > 0 || deferred > 0;

  let reconciliation: RateReconciliation | null = null;
  if (
    hasExplanation &&
    statedRatePct != null &&
    amountFinanced != null &&
    residualExGst != null &&
    monthlyFinance != null
  ) {
    const bare = annuityPayment(amountFinanced, residualExGst, statedRatePct, quote.termMonths);
    /*
     * The deferral, applied the way a financier applies it: interest accrues
     * on the whole balance from settlement and is capitalised, then what is
     * left of the schedule repays it.
     *
     * Two structures, and which one they used changes the answer by more than
     * most fees do — see `deferralExtendsTerm`.
     */
    const grow = (principal: number) =>
      principal * Math.pow(1 + statedRatePct / 100 / 12, deferred);
    const payments = quote.deferralExtendsTerm
      ? quote.termMonths
      : quote.termMonths - deferred;

    // Capitalised fees are borrowed and amortised; per-payment charges are not.
    const withFees =
      annuityPayment(
        grow(amountFinanced + explainedFinanced),
        residualExGst,
        statedRatePct,
        payments,
      ) + annualise(explainedPerPayment, f) / 12;

    const unexplainedPerMonth = monthlyFinance - withFees;
    /*
     * What the deferral alone is worth, holding the fees at nil. Reported so
     * the page can say how much of the gap it actually covers rather than
     * leaving "it's the deferral" as an unpriced assertion.
     */
    const deferralOnly =
      deferred > 0
        ? (annuityPayment(grow(amountFinanced), residualExGst, statedRatePct, payments) - bare) *
          quote.termMonths
        : 0;

    reconciliation = {
      expectedMonthly: withFees,
      actualMonthly: monthlyFinance,
      unexplainedOverTerm: unexplainedPerMonth * quote.termMonths,
      feesOverTerm: (withFees - bare) * quote.termMonths,
      deferralOverTerm: deferralOnly,
      reconciles: Math.abs(unexplainedPerMonth) < 1,
    };
  }

  /*
   * The same payment, asked a different question.
   *
   * Per-payment charges are not borrowed, so they come off the payment; fees
   * financed in are, so they go onto the principal. What the rate solves to
   * after that is the cost of the money alone.
   */
  let ratePaidOnBorrowingPct: number | null = null;
  if (reconciliation != null && amountFinanced != null && residualExGst != null && monthlyFinance != null) {
    const financePart = monthlyFinance - annualise(explainedPerPayment, f) / 12;
    const principal = amountFinanced + explainedFinanced;
    if (deferred > 0) {
      ratePaidOnBorrowingPct = rateWithDeferral(
        principal,
        residualExGst,
        financePart,
        quote.termMonths,
        deferred,
        Boolean(quote.deferralExtendsTerm),
      );
    } else {
      ratePaidOnBorrowingPct = impliedRate(
        principal,
        residualExGst,
        financePart,
        quote.termMonths,
      );
    }
  }

  /*
   * "It's the two-month deferral", priced.
   *
   * The commonest verbal explanation for a payment above a stated rate, and
   * the only one that costs the provider nothing to say. It is usually true —
   * their money is out from settlement — but it is bounded, and the bound
   * depends entirely on a question nobody volunteers: does the lease still end
   * when it was going to? Holding the end date, the deferred months come out
   * of the payment count and everything is repaid by fewer, larger payments.
   * Moving it, the payment rises by little more than the interest that
   * accrued. On five years at 9.5% that is +4.3% against +1.9%.
   *
   * So the sentence names the structure it assumed, which is the only way the
   * reader can tell whether we and the provider are talking about the same
   * arrangement.
   */
  const deferralNote = (r: RateReconciliation): string => {
    if (deferred < 1 || r.deferralOverTerm === 0) return "";
    const months = `${deferred} month${deferred === 1 ? "" : "s"}`;
    return (
      ` Of that, the ${months} before the first payment accounts for ` +
      `${money(Math.abs(r.deferralOverTerm))} — interest accruing while their money is out, ` +
      `worked out on the lease ${
        quote.deferralExtendsTerm
          ? `running ${months} longer than it otherwise would`
          : `still ending on its original date, so ${months} of payments are lost and the rest are larger`
      }. If that is not how theirs is written, the figure moves.`
    );
  };

  /*
   * What the deferral alone does to the rate.
   *
   * The solved rate is the all-in one: it asks what a lender charging nothing
   * but interest would have to charge to produce this payment, and a deferral
   * inflates that because the money was out for months before anything came
   * back. That is not margin, and it is printed on the quote — "Months
   * deferred: 2" — so it can be taken out and the difference shown.
   *
   * Deliberately outside the reconciliation. That machinery needs a rate the
   * provider stated, and real quotes disclose the deferral and not the rate,
   * so tying the two together left the commonest case doing nothing at all.
   */
  let rateAfterDeferralPct: number | null = null;
  if (deferred > 0 && amountFinanced != null && residualExGst != null && monthlyFinance != null) {
    rateAfterDeferralPct = rateWithDeferral(
      amountFinanced,
      residualExGst,
      monthlyFinance,
      quote.termMonths,
      deferred,
      Boolean(quote.deferralExtendsTerm),
    );
  }

  // ── Findings ─────────────────────────────────────────────────────────────

  /*
   * These carry no costOverTerm, deliberately.
   *
   * The decoder totals costOverTerm across findings to say how much avoidable
   * cost a quote holds. A reconciliation does not find new money — it explains
   * money the stated-rate finding has already counted, and the shortfall is a
   * part of that same gap. Pricing it again reported $2,296 of avoidable cost
   * for $1,148 of fees. The figures are still in the prose, where they belong;
   * they are just not added to a total twice.
   */
  if (reconciliation != null && statedRatePct != null) {
    const r = reconciliation;
    const est = config.lease.defaultEstablishmentFee;
    if (r.reconciles) {
      findings.push({
        key: "explanation-reconciles",
        severity: "ok",
        category: "Rate",
        title: "What they told you accounts for the difference",
        detail: `At ${pct(statedRatePct)} with those inclusions the payment comes to ${money(r.expectedMonthly)} a month, which is what the quote charges. Their explanation is complete — which is not the same as the inclusions being worth paying. They add ${money(r.feesOverTerm)} over the term, and that is a separate thing to negotiate.${deferralNote(r)}`,
        // Carries the cost now that it replaces the bare-gap finding rather
        // than sitting beside it, so the avoidable-cost total does not move
        // when somebody enters an explanation.
        costOverTerm: statedRateGap != null && statedRateGap > 0 ? statedRateGap : undefined,
        question:
          explainedFinanced > 0 && explainedFinanced > est * 1.5
            ? `You've told me the establishment and setup fees come to ${money(explainedFinanced)}. Published pricing is nearer ${money(est)} — is any of that negotiable?`
            : undefined,
      });
    } else if (r.unexplainedOverTerm > 0) {
      findings.push({
        key: "explanation-falls-short",
        severity: "warn",
        category: "Rate",
        title: "What they told you does not account for all of it",
        detail: `At ${pct(statedRatePct)} with those inclusions the payment should be ${money(r.expectedMonthly)} a month; the quote charges ${money(r.actualMonthly)}. That leaves ${money(r.unexplainedOverTerm)} over the term still unexplained — so either something else is in there, or one of the figures is not what it was described as.${deferralNote(r)}`,
        costOverTerm: statedRateGap != null && statedRateGap > 0 ? statedRateGap : undefined,
        question:
          deferred > 0
            ? `You've said the ${deferred}-month deferral explains it. Does the lease still end on its original date, or does it run ${deferred} months longer? On our figures the deferral covers ${money(Math.abs(r.deferralOverTerm))} of the gap and ${money(r.unexplainedOverTerm)} is left over — what accounts for the rest?`
            : `With the ${money(explainedFinanced + explainedPerPayment * CYCLES_PER_YEAR[f] * (quote.termMonths / 12))} of inclusions you've described, ${pct(statedRatePct)} produces ${money(r.expectedMonthly)} a month — but the quote charges ${money(r.actualMonthly)}. What accounts for the remaining ${money(r.unexplainedOverTerm)} over the term?`,
      });
    } else {
      findings.push({
        key: "explanation-overshoots",
        severity: "warn",
        category: "Rate",
        title: "What they told you would cost more than they are charging",
        detail: `Those inclusions at ${pct(statedRatePct)} would produce ${money(r.expectedMonthly)} a month, but the quote charges ${money(r.actualMonthly)} — ${money(Math.abs(r.unexplainedOverTerm))} less over the term. Worth checking whether a fee is charged separately rather than financed, or whether it applies at all — and whether it belongs in the other box, since one added to what you borrow costs less than the same money inside each payment.${deferralNote(r)}`,
      });
    }
  }

  if (
    statedRatePct != null &&
    statedRateGap != null &&
    paymentAtStatedRate != null &&
    // Once anything has been entered against it, the reconciliation findings
    // own this story — they state the same gap and what accounts for it. The
    // whole block goes rather than one branch of it: dropping a single branch
    // from an if/else chain does not remove that case, it hands it to the
    // next branch, and a positive gap was landing in "the payment is below
    // the stated rate" and saying "less" about a figure that was more.
    reconciliation == null
  ) {
    // A rounding difference is not a finding. Under a dollar a month either
    // way is the same rate as far as anyone is concerned.
    const perMonth = Math.abs(statedRateGap) / quote.termMonths;
    if (perMonth < 1) {
      findings.push({
        key: "stated-rate-checks-out",
        severity: "ok",
        category: "Rate",
        title: `The ${pct(statedRatePct)} they quoted is the rate you are actually paying`,
        detail: `The payment matches what ${pct(statedRatePct)} produces on ${money(amountFinanced ?? 0)} over ${quote.termMonths} months. Nothing extra is buried in the payment.`,
      });
    } else if (statedRateGap > 0) {
      findings.push({
        key: "stated-rate-understates",
        severity: "warn",
        category: "Rate",
        title: `The payment costs more than the ${pct(statedRatePct)} they quoted`,
        // Points at the box that appeared for this, but only while it is
        // still empty — telling somebody to go and use a thing they have
        // already used is how advice starts getting skimmed.
        detail: `At ${pct(statedRatePct)} the finance would be ${money(paymentAtStatedRate)} a month; the quote charges ${money(monthlyFinance ?? 0)} — ${money(statedRateGap)} more over the term${rate != null ? `, which is why it solves at ${pct(rate)} rather than ${pct(statedRatePct)}` : ""}. That gap is usually something financed inside the payment rather than a wrong rate: an establishment or documentation fee, broker margin over a base rate, or an insurance rolled in.${reconciliation == null ? " Once they tell you what, enter it under \u201cAsked them what\u2019s in it?\u201d and we will check whether their answer accounts for this." : ""}`,
        costOverTerm: statedRateGap,
        question: `You've quoted me ${pct(statedRatePct)}, but the finance payment works out at ${money(statedRateGap)} more than that rate produces over the term. What is included in the finance payment that isn't in the rate? And could you put the rate on the quote itself?`,
      });
    } else {
      findings.push({
        key: "stated-rate-overstates",
        severity: "ok",
        category: "Rate",
        title: `The payment is below the ${pct(statedRatePct)} they quoted`,
        detail: `At ${pct(statedRatePct)} the finance would be ${money(paymentAtStatedRate)} a month; the quote charges ${money(monthlyFinance ?? 0)} — ${money(Math.abs(statedRateGap))} less over the term. Worth confirming the residual and the term are the ones the rate was quoted against, because a figure in your favour is as likely to be a misread as a discount.`,
      });
    }
  }

  if (rate != null) {
    const over = rate - config.benchmarks.loanRatePct;
    // A rate a rounding error above the benchmark is not a finding. Only call it
    // out once the gap is big enough to be worth a conversation.
    const MATERIAL_PP = 0.1;
    findings.push({
      key: "implied-rate",
      severity:
        rate >= config.benchmarks.rateConcernPct
          ? "critical"
          : over > MATERIAL_PP
            ? "warn"
            : "ok",
      category: "Rate",
      title: `Finance is priced at ${pct(rate)}`,
      // "The quote doesn't state a rate" was written when no quote could. It
      // is now a claim about the document in hand, and it was still being
      // made over the top of a rate somebody had just typed in. The same goes
      // for the question, which asked what rate the finance is written at
      // when they had already said.
      detail:
        over > MATERIAL_PP
          ? `${statedRatePct == null ? "The quote doesn't state a rate. " : ""}Solved from the finance payment, it works out at ${pct(rate)} — ${pct(over)} above a comparable secured car loan at ${pct(config.benchmarks.loanRatePct)}, costing ${money(financeMargin ?? 0)} more over the term.`
          : `Solved from the finance payment. That is at or below a comparable secured car loan at ${pct(config.benchmarks.loanRatePct)} — a good rate.`,
      costOverTerm: financeMargin != null && financeMargin > 0 ? financeMargin : undefined,
      question:
        over > MATERIAL_PP
          ? statedRatePct == null
            ? "What interest rate is the finance written at, which financier is it with, and can you match a lower rate?"
            : "Which financier is the finance with, and can you match a lower rate?"
          : undefined,
    });
  } else if (rateBlockedBy) {
    findings.push({
      key: "rate-undeterminable",
      severity: "warn",
      category: "Rate",
      title: "The interest rate can't be determined from this quote",
      detail: rateBlockedBy,
      question:
        "What interest rate is the finance written at, what is the amount financed, and what is the residual?",
    });
  }

  // The savings headline never nets off the interest.
  if (totalInterest != null && totalInterest > 0) {
    findings.push({
      key: "interest-vs-savings",
      severity: "warn",
      category: "Framing",
      title: `The lease costs ${money(totalInterest)} in interest over the term`,
      detail:
        "Quotes lead with tax and GST savings. Those are real — but so is the interest, and it is rarely shown beside them. Judge the lease on the two together.",
    });
  }

  // Residual: at the ATO minimum, or padded to flatter the payment?
  if (residualPctOfFinanced != null) {
    const years = quote.termMonths / 12;
    const minPct = config.lease.residualMinPct[String(Math.round(years))];
    if (minPct != null) {
      const over = residualPctOfFinanced - minPct;
      findings.push({
        key: "residual",
        severity: over > 2 ? "warn" : "ok",
        category: "Residual",
        title:
          over > 2
            ? `The residual is ${pct(over)} above the ATO minimum`
            : "The residual is at the ATO minimum",
        detail:
          over > 2
            ? `At ${pct(residualPctOfFinanced)} against a minimum of ${pct(minPct)}, this lowers the payment now and leaves more owing at the end. You still owe ${money(quote.residualIncGst ?? 0)} in ${years} years.`
            : `${pct(residualPctOfFinanced)} of the amount financed, the lowest the ATO accepts for a ${years}-year term. You will owe ${money(quote.residualIncGst ?? 0)} at the end — that part is not optional.`,
        question: over > 2 ? "Why is the residual set above the ATO minimum for this term?" : undefined,
      });
    }
  }

  // Insurance — the widest-varying line in the market.
  if (annualLines.insurance != null && quote.vehiclePrice) {
    const asPct = (annualLines.insurance / quote.vehiclePrice) * 100;
    const { low, high } = config.benchmarks.insurancePctOfValue;
    const atLow = quote.vehiclePrice * (low / 100);
    const years = quote.termMonths / 12;
    findings.push({
      key: "insurance",
      severity: asPct > high * 0.85 ? "critical" : asPct > (low + high) / 2 ? "warn" : "ok",
      category: "Insurance",
      title:
        asPct > (low + high) / 2
          ? `Insurance is ${money(annualLines.insurance)} a year — the high end of the market`
          : `Insurance is ${money(annualLines.insurance)} a year — competitive`,
      detail:
        asPct > (low + high) / 2
          ? `That is ${asPct.toFixed(1)}% of the vehicle's value, against a market range of ${low}%–${high}%. At the low end this line would be about ${money(atLow)} a year, a difference of ${money((annualLines.insurance - atLow) * years)} over the term. Packaged insurance is often placed by the provider, who may earn commission on it.`
          : `That is ${asPct.toFixed(1)}% of the vehicle's value, at the low end of the ${low}%–${high}% range seen across providers.`,
      costOverTerm: asPct > (low + high) / 2 ? (annualLines.insurance - atLow) * years : undefined,
      question:
        asPct > (low + high) / 2
          ? "Can I use my own comprehensive policy instead of the one bundled in this quote, and do you receive a commission on it?"
          : undefined,
    });
  }

  // Management fee against the observed market range.
  if (annualLines.managementFee != null) {
    const { low, high } = config.benchmarks.managementFeeAnnual;
    const fee = annualLines.managementFee;
    if (fee > high) {
      findings.push({
        key: "management-fee",
        severity: "warn",
        category: "Fees",
        title: `The management fee is ${money(fee)} a year`,
        detail: `Above the ${money(low)}–${money(high)} range seen across providers, so worth ${money((fee - high) * (quote.termMonths / 12))} over the term.`,
        costOverTerm: (fee - high) * (quote.termMonths / 12),
        question: "Is the management fee negotiable, and what does it cover?",
      });
    } else {
      findings.push({
        key: "management-fee",
        severity: "ok",
        category: "Fees",
        title: `The management fee is ${money(fee)} a year`,
        detail: `Within the ${money(low)}–${money(high)} range seen across providers.`,
      });
    }
  }

  // Running-cost budgets against what the car actually needs.
  if (quote.annualKm && quote.vehiclePrice) {
    const bench = buildRunningCosts(
      {
        vehiclePrice: quote.vehiclePrice,
        fuelType: quote.fuelType,
        annualKm: quote.annualKm,
        state: quote.state,
        consumptionPer100km: quote.consumptionPer100km,
      } as LeaseInputs,
      config,
    );
    const pairs: [keyof QuoteLines, number, string][] = [
      ["energy", bench.fuel, "energy"],
      ["maintenance", bench.servicing, "maintenance"],
      ["tyres", bench.tyres, "tyres"],
      ["registration", bench.registration, "registration"],
    ];
    const tol = 1 + config.benchmarks.runningCostTolerancePct / 100;
    let padded = 0;
    const paddedNames: string[] = [];
    for (const [key, benchmark, label] of pairs) {
      const quoted = annualLines[key];
      if (quoted == null || benchmark <= 0) continue;
      if (quoted > benchmark * tol) {
        padded += quoted - benchmark;
        paddedNames.push(label);
      }
    }
    if (padded > 0) {
      const years = quote.termMonths / 12;
      findings.push({
        key: "running-cost-padding",
        severity: "warn",
        category: "Budget",
        title: `Running-cost budgets look padded by about ${money(padded)} a year`,
        detail: `The ${listOf(paddedNames)} ${paddedNames.length === 1 ? "budget is" : "budgets are"} above what this car should need at ${quote.annualKm.toLocaleString("en-AU")} km. You pre-pay the difference from every pay — ${money(padded * years)} across the term. Budgets are a lever providers use to shape the headline figure.`,
        costOverTerm: padded * years,
        question:
          "How were the running-cost budgets set, and what happens to any surplus at the end of the lease — is it refunded to me?",
      });
    }
  }

  // Do the itemised lines actually add up to the deduction they state?
  /*
   * The residual as a percentage is a check on the amount financed.
   *
   * Almost every quote sets the residual at the ATO minimum for the term — it
   * is the lowest the rules allow and the one financiers quote — so the
   * percentage is effectively known. Which makes it a way of testing the
   * figure it is a percentage OF: if the residual works out at 29.21% of what
   * we derived, either the provider chose an unusual residual or the amount
   * financed is not what we think it is.
   *
   * Reported from a real quote. The price was entered without on-road costs,
   * so the derived amount financed came out $2,004 short, and the rate solved
   * at 11.84% instead of 10.46% — a point and a half of error in the headline
   * figure, with nothing on the page suggesting anything was wrong.
   *
   * Only where the amount financed was DERIVED. If somebody typed it off the
   * quote there is nothing to second-guess.
   */
  if (
    financedWasDerived &&
    amountFinanced != null &&
    residualExGst != null &&
    residualPctOfFinanced != null
  ) {
    const years = String(Math.round(quote.termMonths / 12));
    const atoPct = config.lease.residualMinPct[years];
    if (atoPct != null && residualPctOfFinanced > atoPct + 0.25) {
      const impliedFinanced = residualExGst / (atoPct / 100);
      const missing = impliedFinanced - amountFinanced;
      if (missing > Math.max(500, amountFinanced * 0.01)) {
        findings.push({
          key: "financed-may-be-short",
          severity: "warn",
          category: "Adds up?",
          title: `The residual is ${pct(residualPctOfFinanced)} of what we think is financed, not the usual ${pct(atoPct)}`,
          detail: `We worked the amount financed out as ${money(amountFinanced)} from the price — nobody typed it. Against that, the residual you entered is ${pct(residualPctOfFinanced)}. Providers almost always use the ATO minimum, which is ${pct(atoPct)} over ${years} years, and at that percentage the amount financed would be ${money(impliedFinanced)} — about ${money(missing)} more. On-road costs financed in with the car are the usual explanation, and they are not in the price you entered. It matters: the interest rate is solved against this figure, so ${money(missing)} of it moves the rate.`,
          question: `Does the amount financed include the stamp duty, registration and CTP — and what is it exactly?`,
        });
      }
    }
  }

  if (rateAfterDeferralPct != null && rate != null && rate - rateAfterDeferralPct > 0.05) {
    findings.push({
      key: "deferral-explains-part-of-the-rate",
      severity: "ok",
      category: "Rate",
      title: `The ${deferred}-month deferral accounts for ${pct(rate - rateAfterDeferralPct)} of that rate`,
      detail: `Nothing is repaid for the first ${deferred} month${deferred === 1 ? "" : "s"}, so interest accrues on the whole balance before a single payment lands — and solving the payment as though repayment started on day one attributes that to the rate. Taking it out, the money itself is at ${pct(rateAfterDeferralPct)} rather than ${pct(rate)}${quote.deferralExtendsTerm ? ", on a lease running the deferral's length longer" : ", on a lease still ending on its original date"}. Both are real: ${pct(rate)} is what the payment costs you, ${pct(rateAfterDeferralPct)} is what the financier is charging. Worth confirming which structure it is, because the other one moves this figure.`,
      question: `Your quote defers ${deferred} months. Does the lease still end on its original date, or does it run ${deferred} months longer?`,
    });
  }

  if (employerShareGuess) {
    const { pct: sharePct, annual, taxSaved } = employerShareGuess;
    const years = quote.termMonths / 12;
    // Half is the common arrangement, so a fit near it is worth saying out
    // loud; further away, the same mechanism is still the likeliest
    // explanation but the percentage is more of a guess.
    const nearHalf = Math.abs(sharePct - 50) < 3;
    findings.push({
      key: "employer-share-of-saving",
      severity: "warn",
      category: "Adds up?",
      title: `${money(annual)} a year of your deduction isn't paying for the car`,
      detail: `The inclusions you listed come to ${money(annualPackageTotal)} a year, but ${money(annualStatedDeduction!)} is coming out of your pay — a difference of ${money(annual)}. On a ${money(quote.salary!)} salary this packaging relieves about ${money(taxSaved)} of tax a year, and the difference is ${pct(sharePct)} of exactly that${nearHalf ? " — half, which is the usual arrangement" : ""}. That pattern is an employer keeping a share of the saving: common in public health, ambulance services and universities, where the packaging is run as a scheme and part of the benefit goes back to the employer as a second pre-tax deduction. It is a term of your employment, not something the financier sets or profits from — and over ${years} years it is ${money(annual * years)} of the benefit that does not reach you. Providers quote what you keep, which is accurate, without saying it is a share.`,
      costOverTerm: annual * years,
      question: `My pre-tax deduction is ${money(annualStatedDeduction!)} a year but the itemised inclusions come to ${money(annualPackageTotal)}. Is the difference my employer's share of the tax saving, and what percentage is it?`,
    });
  }

  if (reconciliationGap != null && Math.abs(reconciliationGap) > 50 && !employerShareGuess) {
    // Said in the quote's own period, because that is the figure they typed
    // and the one printed on the document beside them.
    const perCycle = (quote.statedPreTax ?? 0) + (quote.statedPostTax ?? 0);
    const deductionBasis =
      quote.statedPostTax != null && quote.statedPostTax > 0
        ? `You entered ${cents(quote.statedPreTax ?? 0)} pre-tax and ${cents(quote.statedPostTax)} post-tax a ${FREQ_NOUN[f]} — ${cents(perCycle)} together, which is ${money(annualStatedDeduction!)} across ${CYCLES_PER_YEAR[f]} pays a year.`
        : `You entered ${cents(perCycle)} a ${FREQ_NOUN[f]} coming out of your pay, which is ${money(annualStatedDeduction!)} across ${CYCLES_PER_YEAR[f]} pays a year.`;
    const expectedLca =
      amountFinanced != null ? luxuryCarAdjustment(amountFinanced, config) : 0;
    const looksLikeLca =
      quote.lines.luxuryCarAdjustment == null &&
      expectedLca > 0 &&
      Math.abs(reconciliationGap - expectedLca) < expectedLca * 0.35;
    findings.push({
      key: "reconciliation",
      severity: "warn",
      category: "Adds up?",
      title: `The stated deduction is ${money(Math.abs(reconciliationGap))} a year ${reconciliationGap > 0 ? "more" : "less"} than the listed items`,
      /*
       * Where BOTH figures came from, not just what they are.
       *
       * A reader told the two disagree has to be able to check which one is
       * wrong, and until now neither side showed its working: the deduction is
       * whatever they typed as pre-tax and post-tax, added together and put on
       * a yearly footing, and none of that was said anywhere.
       */
      /*
       * Three things it can say, and the last two are not the same.
       *
       * "Nothing explains the difference" is a claim about the quote. On a
       * SHARED quote it was a claim about ourselves: the salary is stripped
       * from a share link by design, and without it the employer-share test
       * above cannot run — so the commonest explanation went unmentioned and
       * the reader was told nothing accounted for a gap we would have named
       * had we been looking at it ourselves.
       */
      detail: `${deductionBasis} The lines you listed add up to ${money(annualPackageTotal)} a year. ${
        looksLikeLca
          ? `The ${money(Math.abs(reconciliationGap))} gap is close to the luxury car adjustment this vehicle would attract — about ${money(expectedLca)} a year, because the financed amount is above the ${money(config.gst.carLimit)} car limit — but the quote doesn't name it.`
          : reconciliationGap > 0 && quote.salary == null
            ? `A deduction larger than the inclusions is most often an employer keeping a share of the tax saving — usual in public health, ambulance services and universities, where part of the benefit goes back to the employer as a second pre-tax line. Telling whether that is what this is takes the salary, and a shared quote doesn't carry one. On your own figures we would check it.`
            : "Nothing on the quote explains the difference."
      }`,
      question: "Your itemised inclusions don't add up to the salary deduction — what is the difference?",
    });
  }

  // Drive-away price and amount financed are the pair people most often mix up,
  // partly because some quotes also show an FBT "base value" that looks like a
  // third candidate. Only flag what is unambiguously wrong: a lease cannot be
  // written over more than the car costs, and the two figures are never equal
  // (the GST credit always separates them).
  if (driveAway != null && quote.amountFinanced != null) {
    const gap = driveAway - quote.amountFinanced;
    if (gap < 0) {
      findings.push({
        key: "financed-above-price",
        severity: "critical",
        category: "Check",
        title: "The amount financed is more than the car costs",
        detail: `You've entered ${money(quote.amountFinanced)} financed against a ${money(driveAway)} drive-away price. The lease is written over the price LESS the GST the financier claims back, so it is always the smaller of the two — these look swapped.`,
      });
    } else if (gap === 0) {
      findings.push({
        key: "financed-equals-price",
        severity: "warn",
        category: "Check",
        title: "The amount financed is exactly the drive-away price",
        detail: `The financier claims the GST back on the car, so the lease is normally written over about ${money(driveAway - gstCredit)} — around ${money(gstCredit)} less. Check you haven't entered the same figure twice.`,
      });
    }
  }

  // Every quote is priced on a full FBT year and says so in its fine print.
  // The FBT year ends 31 March, so a car delivered in November attracts about
  // five months of fringe benefit, not twelve — and the contribution that
  // cancels it shrinks in proportion. The provider adjusts it later; the
  // quote never shows it.
  if (quote.firstHeldDate) {
    const factor = fbtProRataFactor(quote.firstHeldDate);
    if (factor < 0.999) {
      const held = new Date(`${quote.firstHeldDate}T00:00:00Z`);
      const fy = fbtYearFor(held);
      const days = daysAvailableInFirstFbtYear(held);
      const fullYearEcm = annualLines.postTaxContribution ?? 0;
      // An ECM quote states the contribution; an exempt EV has none, but its
      // reportable benefit is pro-rated the same way.
      const statedEcm =
        quote.statedPostTax != null ? annualise(quote.statedPostTax, f) : fullYearEcm;
      const firstYear = statedEcm * factor;
      findings.push({
        key: "part-year-fbt",
        severity: statedEcm > 0 ? "warn" : "ok",
        category: "First year",
        title: `Your first FBT year is ${days} days, not a full one`,
        detail:
          statedEcm > 0
            ? `The FBT year ends 31 March, so a car first held on ${quote.firstHeldDate} is only a fringe benefit for ${days} of the ${fy.days} days in FBT year ${fy.label}. The post-tax contribution is pro-rated to match: about ${money(firstYear)} in the first year against the ${money(statedEcm)} this quote is priced on — a difference of ${money(statedEcm - firstYear)}. Quotes assume a full year, so expect the deduction to be trued up once the car is delivered.`
            : `The FBT year ends 31 March, so this car is a fringe benefit for ${days} of the ${fy.days} days in FBT year ${fy.label}. Nothing to pay either way on an exempt vehicle, but the reportable amount on your first payment summary is pro-rated to match.`,
        question:
          statedEcm > 0
            ? "This quote assumes a full FBT year — what will my actual deductions be for the first year, given the expected delivery date?"
            : undefined,
      });
    }
  }

  // The GST credit cap — a check that usually passes, and worth saying so.
  if (quote.vehiclePrice && quote.vehiclePrice > config.gst.carLimit && amountFinanced != null) {
    const impliedCredit = (driveAway ?? quote.vehiclePrice) - amountFinanced;
    const expected = gstCredit;
    if (Math.abs(impliedCredit - expected) < 25) {
      findings.push({
        key: "gst-credit",
        severity: "ok",
        category: "GST",
        title: `The GST credit is capped correctly at ${money(expected)}`,
        detail: `One eleventh of the ${money(config.gst.carLimit)} car limit. Above that limit the GST isn't recoverable, so this is the most that can come off the price.`,
      });
    }
  }

  // Order by what each finding costs, worst first; "ok" findings sink.
  const rank: Record<FindingSeverity, number> = { critical: 0, warn: 1, ok: 2 };
  findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || (b.costOverTerm ?? 0) - (a.costOverTerm ?? 0),
  );

  return {
    impliedRatePct: rate,
    rateBlockedBy,
    amountFinanced,
    financedWasDerived,
    residualExGst,
    residualPctOfFinanced,
    monthlyFinancePayment: monthlyFinance,
    totalInterest,
    interestAtBenchmark,
    financeMargin,
    annualLines,
    annualPackageTotal,
    annualStatedDeduction,
    reconciliationGap,
    statedRatePct,
    paymentAtStatedRate,
    statedRateGap,
    reconciliation,
    ratePaidOnBorrowingPct,
    rateAfterDeferralPct,
    findings,
    questions: findings.map((x) => x.question).filter((q): q is string => Boolean(q)),
  };
}

// ── Comparing quotes ────────────────────────────────────────────────────────
//
// Laying quotes side by side is where the value concentrates — but it is also
// where it is easiest to mislead. Providers rarely quote the same car at the
// same price, and a total cost compared across two different vehicles says
// almost nothing. So the comparison distinguishes measures that survive a
// difference in the car (the interest rate, fees, the running-cost budget) from
// those that do not (total package cost), and refuses to name a cheapest
// overall when the vehicles aren't comparable.

export interface ComparedQuote {
  quote: Quote;
  decode: QuoteDecode;
  /** Every deduction across the whole term, at the quote's own figures. */
  totalPackageOverTerm: number;
  /** Annual running-cost budget: everything except finance, fees and the
   *  luxury car adjustment. Comparable even when the cars differ a little. */
  annualRunningBudget: number;
}

export interface QuoteComparison {
  quotes: ComparedQuote[];
  /** Index of the best quote on each measure, or null when it can't be judged. */
  bestRate: number | null;
  /** Lowest interest paid — NOT the same as the lowest rate, since the quotes
   *  may finance different amounts. */
  bestInterest: number | null;
  bestRunningBudget: number | null;
  /** Only set when the vehicles are comparable — otherwise a cost total lies. */
  bestTotalCost: number | null;
  /** Spread between the highest and lowest implied rate, in percentage points.
   *  Presented by the UI as its headline — deliberately NOT repeated in `notes`. */
  rateSpreadPp: number | null;
  /** What the spread is worth on the largest financed amount in the set. */
  rateSpreadValue: number | null;
  vehiclesComparable: boolean;
  /** Reasons a naive reading of the table would mislead. Comparability only —
   *  never a restatement of a figure the table already shows. */
  notes: string[];
}

/** Vehicle prices within this much of each other are treated as the same car
 *  for comparison purposes — a few hundred dollars of on-roads shouldn't
 *  disqualify an otherwise like-for-like comparison. */
const PRICE_TOLERANCE_PCT = 5;

const RUNNING_KEYS = ["energy", "maintenance", "tyres", "registration", "insurance", "roadside"];

export function compareQuotes(quotes: Quote[], config: EngineConfig): QuoteComparison {
  const compared: ComparedQuote[] = quotes.map((q) => {
    const decode = decodeQuote(q, config);
    const years = q.termMonths / 12;
    return {
      quote: q,
      decode,
      totalPackageOverTerm: decode.annualPackageTotal * years,
      annualRunningBudget: RUNNING_KEYS.reduce(
        (sum, k) => sum + (decode.annualLines[k] ?? 0),
        0,
      ),
    };
  });

  const notes: string[] = [];

  // Are these quotes for the same car?
  const prices = compared
    .map((c) => c.quote.vehiclePrice)
    .filter((p): p is number => typeof p === "number" && p > 0);
  let vehiclesComparable = true;
  if (prices.length >= 2) {
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    vehiclesComparable = (hi - lo) / lo <= PRICE_TOLERANCE_PCT / 100;
    if (!vehiclesComparable) {
      notes.push(
        `These quotes are for vehicles priced ${money(lo)} to ${money(hi)}, so a total-cost comparison would be misleading. The interest rate, the fees and the running-cost budgets are still directly comparable — and the rate is the number a provider controls.`,
      );
    }
  } else if (prices.length < compared.length) {
    vehiclesComparable = false;
    notes.push(
      "Not every quote has a vehicle price, so totals can't be compared like for like. The interest rates still can.",
    );
  }

  // Terms have to match for a whole-of-term total to mean anything.
  const terms = new Set(compared.map((c) => c.quote.termMonths));
  if (terms.size > 1) {
    vehiclesComparable = false;
    notes.push(
      `The quotes run over different terms (${[...terms].map((t) => `${t / 12} years`).join(", ")}). A longer term lowers the payment and raises the total — compare the rate, not the total.`,
    );
  }

  const bestBy = <T>(
    pick: (c: ComparedQuote) => number | null | undefined,
    lowerIsBetter = true,
  ): number | null => {
    let bestIdx: number | null = null;
    let bestVal = Infinity;
    compared.forEach((c, i) => {
      const v = pick(c);
      if (v == null || !Number.isFinite(v)) return;
      const score = lowerIsBetter ? v : -v;
      if (score < bestVal) {
        bestVal = score;
        bestIdx = i;
      }
    });
    return bestIdx;
  };

  const rates = compared
    .map((c) => c.decode.impliedRatePct)
    .filter((r): r is number => r != null);
  const rateSpreadPp = rates.length >= 2 ? Math.max(...rates) - Math.min(...rates) : null;

  // What the spread is worth: the same lease at the best rate versus the worst,
  // on the largest financed amount in the set.
  let rateSpreadValue: number | null = null;
  if (rateSpreadPp != null && rateSpreadPp > 0) {
    const ref = compared
      .filter((c) => c.decode.amountFinanced != null && c.decode.residualExGst != null)
      .sort((a, b) => (b.decode.amountFinanced ?? 0) - (a.decode.amountFinanced ?? 0))[0];
    if (ref) {
      const financed = ref.decode.amountFinanced!;
      const residual = ref.decode.residualExGst!;
      const months = ref.quote.termMonths;
      const cheap = annuityPayment(financed, residual, Math.min(...rates), months);
      const dear = annuityPayment(financed, residual, Math.max(...rates), months);
      rateSpreadValue = (dear - cheap) * months;
    }
  }

  return {
    quotes: compared,
    bestRate: bestBy((c) => c.decode.impliedRatePct),
    bestInterest: bestBy((c) => c.decode.totalInterest),
    bestRunningBudget: bestBy((c) => (c.annualRunningBudget > 0 ? c.annualRunningBudget : null)),
    bestTotalCost: vehiclesComparable ? bestBy((c) => c.totalPackageOverTerm) : null,
    rateSpreadPp,
    rateSpreadValue,
    vehiclesComparable,
    notes,
  };
}

// ── Handing a quote to the calculator ───────────────────────────────────────
//
// Someone who has just decoded a quote has a second question — "so is this
// lease worth it for me at all?" — and they have already typed everything
// needed to answer it. Making them enter it again would be indefensible.
//
// The mapping is worth more than convenience. The calculator's defaults are
// generic; a quote supplies the person's ACTUAL interest rate, residual and
// running-cost budgets, so the model runs on the deal in front of them rather
// than on a representative one.

/** Turn a decoded quote into calculator inputs. Anything the quote doesn't say
 *  falls back to the engine's defaults, so the result is always complete. */
export function quoteToLeaseInputs(
  quote: Quote,
  decode: QuoteDecode,
  config: EngineConfig,
): LeaseInputs {
  const base = defaultInputs(config);
  const years = Math.max(1, Math.round(quote.termMonths / 12));

  // Only override a running cost the quote actually itemised — a zero we
  // invented would tell the user this car needs no tyres.
  const overrides: Partial<AnnualRunningCosts> = {};
  const map: [keyof AnnualRunningCosts, string][] = [
    ["fuel", "energy"],
    ["servicing", "maintenance"],
    ["tyres", "tyres"],
    ["registration", "registration"],
    ["insurance", "insurance"],
    ["roadside", "roadside"],
  ];
  for (const [target, source] of map) {
    const v = decode.annualLines[source];
    if (typeof v === "number") overrides[target] = v;
  }

  // These land in editable number fields, so they get the precision a person
  // would actually type. The solver's full precision is meaningless here —
  // nobody negotiates a rate of 10.49820794350002%.
  const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

  return {
    ...base,
    salary: quote.salary ?? base.salary,
    vehiclePrice: quote.vehiclePrice ?? base.vehiclePrice,
    onRoadCosts: quote.onRoadCosts,
    fuelType: quote.fuelType,
    condition: quote.condition,
    firstRegisteredDate: quote.firstRegisteredDate,
    firstRetailPrice: quote.firstRetailPrice,
    purchasedFrom: quote.purchasedFrom,
    // A quote is priced for a lease starting when the car is delivered, so
    // that is the date its FBT treatment is fixed by.
    commencementDate: quote.firstHeldDate,
    termYears: years,
    annualKm: quote.annualKm ?? base.annualKm,
    state: quote.state,
    vehicleId: quote.vehicleId,
    consumptionPer100km: quote.consumptionPer100km,
    // The whole point: model their deal at their rate, not at our default.
    interestRatePct:
      decode.impliedRatePct != null ? round(decode.impliedRatePct, 2) : base.interestRatePct,
    residualPct:
      decode.residualPctOfFinanced != null ? round(decode.residualPctOfFinanced, 2) : undefined,
    includeRunningCosts: Object.keys(overrides).length > 0,
    runningCostOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    adminFeeAnnual: decode.annualLines.managementFee ?? base.adminFeeAnnual,
    // A quote showing a post-tax deduction is using the employee contribution
    // method; one showing none is either exempt or has the employer paying.
    fbtMethod: "ecm",
  };
}
