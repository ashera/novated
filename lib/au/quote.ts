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
import { fbtProRataFactor, fbtYearFor, daysAvailableInFirstFbtYear } from "./fbtYear";
import {
  annuityPayment,
  impliedRate,
  luxuryCarAdjustment,
  buildRunningCosts,
  defaultInputs,
  type AnnualRunningCosts,
  type FuelType,
  type LeaseInputs,
} from "./novated";

/** The pay cycle a quote's figures are expressed in. Providers publish exactly
 *  one of these and never label it twice, so the reader has to tell us which —
 *  and getting it wrong scales every figure by 2x or more. */
export type QuoteFrequency = "weekly" | "fortnightly" | "monthly";

/** Pays per year for each cycle. */
export const CYCLES_PER_YEAR: Record<QuoteFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
};

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
  vehiclePrice?: number; // drive-away, inc GST
  fuelType: FuelType;
  /** Catalogue vehicle, when the user picked one. Never sets the price. */
  vehicleId?: string;
  /** This model's consumption, when known from the catalogue. */
  consumptionPer100km?: number;

  // The finance
  amountFinanced?: number;
  residualIncGst?: number;
  termMonths: number;

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
  findings: Finding[];
  questions: string[];
}

const GST = 1.1;

/** Annualise a figure published at the quote's frequency. */
function annualise(v: number, f: QuoteFrequency): number {
  return v * CYCLES_PER_YEAR[f];
}

const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
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
  const creditable = Math.min(quote.vehiclePrice ?? 0, config.gst.carLimit);
  const gstCredit = creditable - creditable / (1 + config.gst.rate);
  let amountFinanced = quote.amountFinanced ?? null;
  let financedWasDerived = false;
  if (amountFinanced == null && quote.vehiclePrice != null) {
    amountFinanced = quote.vehiclePrice - gstCredit;
    financedWasDerived = true;
  }

  const residualExGst = quote.residualIncGst != null ? quote.residualIncGst / GST : null;
  const residualPctOfFinanced =
    residualExGst != null && amountFinanced ? (residualExGst / amountFinanced) * 100 : null;

  // ── The rate ─────────────────────────────────────────────────────────────
  const monthlyFinance =
    quote.lines.finance != null ? (annualise(quote.lines.finance, f)) / 12 : null;

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

  const annualStatedDeduction =
    quote.statedPreTax != null || quote.statedPostTax != null
      ? annualise((quote.statedPreTax ?? 0) + (quote.statedPostTax ?? 0), f)
      : null;
  const reconciliationGap =
    annualStatedDeduction != null ? annualStatedDeduction - annualPackageTotal : null;

  // ── Findings ─────────────────────────────────────────────────────────────

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
      detail:
        over > MATERIAL_PP
          ? `The quote doesn't state a rate. Solved from the finance payment, it works out at ${pct(rate)} — ${pct(over)} above a comparable secured car loan at ${pct(config.benchmarks.loanRatePct)}, costing ${money(financeMargin ?? 0)} more over the term.`
          : `Solved from the finance payment. That is at or below a comparable secured car loan at ${pct(config.benchmarks.loanRatePct)} — a good rate.`,
      costOverTerm: financeMargin != null && financeMargin > 0 ? financeMargin : undefined,
      question:
        over > MATERIAL_PP
          ? "What interest rate is the finance written at, which financier is it with, and can you match a lower rate?"
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
  if (reconciliationGap != null && Math.abs(reconciliationGap) > 50) {
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
      detail: looksLikeLca
        ? `The listed lines total ${money(annualPackageTotal)} but the deduction is ${money(annualStatedDeduction!)}. The gap is close to the luxury car adjustment this vehicle would attract (about ${money(expectedLca)} a year, because the financed amount is above the ${money(config.gst.carLimit)} car limit) — but the quote doesn't name it.`
        : `The listed lines total ${money(annualPackageTotal)} but the deduction is ${money(annualStatedDeduction!)}. Nothing on the quote explains the difference.`,
      question: "Your itemised inclusions don't add up to the salary deduction — what is the difference?",
    });
  }

  // Drive-away price and amount financed are the pair people most often mix up,
  // partly because some quotes also show an FBT "base value" that looks like a
  // third candidate. Only flag what is unambiguously wrong: a lease cannot be
  // written over more than the car costs, and the two figures are never equal
  // (the GST credit always separates them).
  if (quote.vehiclePrice != null && quote.amountFinanced != null) {
    const gap = quote.vehiclePrice - quote.amountFinanced;
    if (gap < 0) {
      findings.push({
        key: "financed-above-price",
        severity: "critical",
        category: "Check",
        title: "The amount financed is more than the car costs",
        detail: `You've entered ${money(quote.amountFinanced)} financed against a ${money(quote.vehiclePrice)} drive-away price. The lease is written over the price LESS the GST the financier claims back, so it is always the smaller of the two — these look swapped.`,
      });
    } else if (gap === 0) {
      findings.push({
        key: "financed-equals-price",
        severity: "warn",
        category: "Check",
        title: "The amount financed is exactly the drive-away price",
        detail: `The financier claims the GST back on the car, so the lease is normally written over about ${money(quote.vehiclePrice - gstCredit)} — around ${money(gstCredit)} less. Check you haven't entered the same figure twice.`,
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
    const impliedCredit = quote.vehiclePrice - amountFinanced;
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
    fuelType: quote.fuelType,
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
