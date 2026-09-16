// Whether a figure somebody typed can be true at all.
//
// Separate from the findings decodeQuote produces, and answering a different
// question. A finding is analysis: this rate is high, that budget is padded,
// here is what to ask them. These are arithmetic: the number in this box
// cannot be what the quote says, so nothing computed from it means anything.
//
// The difference matters at the keyboard. A finding is worth reading once the
// quote is in; a figure that cannot be true is worth knowing before typing the
// next one, because everything downstream of it is now wrong and the reader
// has no way to tell. The commonest cause is not a typo but a frequency: the
// finance line read off a monthly quote and entered under "weekly" is four
// times too big, and every figure the page derives from it is confidently
// absurd.
//
// impliedRate already knows most of this — it returns null for a payment that
// cannot repay the principal and for one too large for any rate — but null
// cannot say which, and "we could not work out the rate" is a poor thing to
// tell somebody who has just made a one-character mistake.

import type { EngineConfig } from "./config";
import { annuityPayment, impliedRate } from "./novated";
import { CYCLES_PER_YEAR, financeBasis, type Quote } from "./quote";

/** How wrong a figure is. `error` cannot be true; `warn` is unusual but possible. */
export type CheckLevel = "error" | "warn";

export interface FieldCheck {
  level: CheckLevel;
  /** Said to the person who typed it, in the second person. */
  message: string;
}

/** The fields worth checking — the ones a wrong value makes nonsense of. */
export type CheckedField =
  | "finance"
  | "amountFinanced"
  | "residualIncGst"
  | "managementFee"
  | "vehiclePrice";

export type QuoteFieldChecks = Partial<Record<CheckedField, FieldCheck>>;

/** A rate nobody is being charged, whatever the quote implies. */
const IMPLAUSIBLE_RATE_PCT = 25;

const money = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

/** The quote's own cycle, as a number of payments a year. */
function perYear(q: Quote): number {
  return CYCLES_PER_YEAR[q.frequency];
}

/** A figure entered at the quote's frequency, as a monthly amount. */
function monthly(value: number, q: Quote): number {
  return (value * perYear(q)) / 12;
}

/**
 * The finance line, which is the one that has to add up.
 *
 * Three separate ways for it to be impossible, and they want different
 * sentences. Too small to repay the principal is the case worth naming
 * precisely — the shortfall is computable, and seeing "still owing $18,400 at
 * the end" is what makes somebody look at the frequency selector.
 */
function checkFinance(q: Quote, config: EngineConfig): FieldCheck | undefined {
  // The same three figures the decoder solves the rate from, resolved the same
  // way. Judging the payment against what was typed rather than against what
  // is actually computed would let this contradict the finding beneath it —
  // and the amount financed is usually not typed at all, because the form
  // invites leaving it blank and derives it from the drive-away price.
  const { amountFinanced: financed, residualExGst, monthlyFinance: m } = financeBasis(q, config);
  const months = q.termMonths;
  if (m == null || financed == null || !months) return undefined;
  if (m <= 0 || financed <= 0) return undefined;
  // Without a residual there is nothing to judge the payment against. Assuming
  // zero was worse than saying nothing: it asked the payment to repay the
  // whole principal, so a correct figure typed before the residual — which is
  // the order the form is in — was called impossible.
  if (residualExGst == null) return undefined;

  const balloon = residualExGst;
  if (balloon > financed) return undefined; // the residual's own check covers it

  const principalOnly = (financed - balloon) / months;

  /*
   * With a stated rate, three knowns pin the fourth.
   *
   * Without one, a payment that cannot be right leaves four candidates — the
   * amount financed, the residual, the term or the payment — and the decoder
   * can only say so. Given the rate the quote claims, the payment it must
   * produce is arithmetic, so the disagreement can be pointed at instead of
   * described. Checked before the impossibility tests, because "this is not
   * the payment your own stated rate produces" is a more useful sentence than
   * "this cannot be true" even when both apply.
   */
  if (q.statedRatePct != null && q.statedRatePct > 0) {
    /*
     * Fees the provider has since disclosed count towards this.
     *
     * Without them the check went on calling a payment wrong after the reader
     * had entered the reason it wasn't — the box on the left explained the
     * gap and the message under the box still denied it. A capitalised fee is
     * borrowed and amortised; a per-payment charge is flat. Same split as the
     * reconciliation, because it is the same question asked in a smaller
     * space.
     */
    const feesFinanced = Math.max(0, q.explainedFeesFinanced ?? 0);
    const feesPerPayment = Math.max(0, q.explainedFeesPerPayment ?? 0);
    const explained = feesFinanced > 0 || feesPerPayment > 0;

    const expected =
      annuityPayment(financed + feesFinanced, balloon, q.statedRatePct, months) +
      monthly(feesPerPayment, q);
    const outBy = Math.abs(m - expected);

    /*
     * How close counts as right depends on what is being checked.
     *
     * Against a bare stated rate, a couple of per cent is convention: a
     * rounded rate, monthly against annual compounding, a payment set to whole
     * dollars. Against an itemised explanation it is not — they have said
     * exactly what is in there, so it should add up, and the same dollar a
     * month the reconciliation uses applies here. Two tolerances for one
     * question had the field saying it balanced while the finding said it did
     * not.
     */
    const tolerance = explained ? 1 : Math.max(5, expected * 0.02);
    if (outBy > tolerance) {
      const perCycle = (v: number) => (v * 12) / perYear(q);
      return {
        level: outBy > expected * 0.25 ? "error" : "warn",
        message: explained
          ? `At the ${q.statedRatePct}% this quote states, with what they have told you is in it, the finance would be ${money(perCycle(expected))} — you have entered ${money(perCycle(m))}. Something is still unaccounted for.`
          : `At the ${q.statedRatePct}% this quote states, the finance would be ${money(perCycle(expected))} — you have entered ${money(perCycle(m))}. One of the two is wrong, or something is financed inside the payment that isn't in the rate.`,
      };
    }
  }

  if (m < principalOnly - 1e-6) {
    const shortfall = (principalOnly - m) * months;
    return {
      level: "error",
      message: `Too low to repay the ${money(financed)} financed — even at 0% interest this leaves about ${money(shortfall)} unpaid at the end. Check the figure, and check whether the quote is weekly, fortnightly or monthly.`,
    };
  }

  if (m > annuityPayment(financed, balloon, 60, months)) {
    return {
      level: "error",
      message: `Too high for this to be finance on ${money(financed)} — no rate explains it. Check whether this is the whole deduction rather than the finance line, and whether the frequency is right.`,
    };
  }

  const rate = impliedRate(financed, balloon, m, months);
  if (rate != null && rate > IMPLAUSIBLE_RATE_PCT) {
    return {
      level: "warn",
      message: `This works out at ${rate.toFixed(1)}% — far above anything a financier charges. Worth re-reading the figure and the frequency before trusting the rest.`,
    };
  }
  return undefined;
}

/**
 * The residual, against the floor the ATO sets for the term.
 *
 * Below it is not a matter of opinion: a lease written under the minimum is
 * not a lease the Commissioner accepts, so a figure under it is a
 * transcription error rather than a keen deal.
 *
 * Every figure in these messages is GST-INCLUSIVE, because that is the number
 * in the box. The test itself runs ex-GST, since the ATO's percentage is a
 * percentage of the amount financed and the amount financed has the GST credit
 * taken out — but a message that does its arithmetic in one currency and
 * prints it beside a figure typed in another reads as a contradiction. It told
 * somebody who had entered $24,100 that they were below a minimum of $23,691.
 * The verdict was right; the sentence was comparing the ex-GST floor with the
 * inc-GST figure they could see, and no reader can be expected to spot that.
 */
function checkResidual(q: Quote, config: EngineConfig): FieldCheck | undefined {
  const { amountFinanced: financed, residualExGst } = financeBasis(q, config);
  const residual = residualExGst;
  if (residual == null || residual < 0) return undefined;
  // Back into the units of the field, for anything that gets printed.
  const asQuoted = (exGst: number) => money(exGst * (1 + config.gst.rate));

  if (financed && residual > financed) {
    return {
      level: "error",
      message: `More than the ${money(financed)} financed, which with GST is ${asQuoted(financed)} — a residual is what is left owing, so it cannot exceed what was borrowed.`,
    };
  }
  if (!financed || !q.termMonths) return undefined;

  const years = Math.round(q.termMonths / 12);
  const minPct = config.lease.residualMinPct[String(years)];
  if (minPct == null) return undefined;

  const floor = financed * (minPct / 100);
  if (residual > 0 && residual < floor * 0.95) {
    return {
      level: "error",
      message: `Below the ATO minimum for a ${years}-year lease, which is ${minPct}% of the ${money(financed)} financed — ${asQuoted(floor)} once GST is added, and this box is GST-inclusive. A lower residual is not something a provider can offer.`,
    };
  }
  return undefined;
}

/** What is financed, against what the car costs. */
function checkAmountFinanced(q: Quote): FieldCheck | undefined {
  // Deliberately the typed value, not the derived one: this check is about
  // what somebody put in the box, and a figure the page worked out itself
  // cannot be their mistake.
  const financed = q.amountFinanced;
  const price = q.vehiclePrice;
  if (!financed || !price) return undefined;

  const driveAway = price + (q.onRoadCosts ?? 0);
  // Fees and insurances are sometimes financed too, so allow real headroom
  // before calling it wrong.
  if (financed > driveAway * 1.25) {
    return {
      level: "warn",
      message: `Higher than the ${money(driveAway)} the car and its on-road costs come to. Some quotes finance fees as well, but a gap this size is usually the drive-away price entered twice.`,
    };
  }
  if (financed < price * 0.5) {
    return {
      level: "warn",
      message: `Less than half the ${money(price)} price. The financier claims the GST back, so expect roughly ${money(price / 1.1)} — well under that usually means a deposit, or the wrong line.`,
    };
  }
  return undefined;
}

/** The management fee, which is quoted annually about as often as per pay. */
function checkManagementFee(q: Quote, config: EngineConfig): FieldCheck | undefined {
  const fee = q.lines.managementFee;
  if (!fee || fee <= 0) return undefined;
  const annual = fee * perYear(q);
  const { low, high } = config.benchmarks.managementFeeAnnual;

  if (annual > high * 4) {
    return {
      level: "warn",
      message: `That is ${money(annual)} a year. Published pricing runs about ${money(low)} to ${money(high)} — this is usually an annual figure entered as a per-pay one.`,
    };
  }
  return undefined;
}

/** A price that cannot be a car. */
function checkVehiclePrice(q: Quote): FieldCheck | undefined {
  const price = q.vehiclePrice;
  if (price == null || price <= 0) return undefined;
  if (price < 5_000) {
    return {
      level: "warn",
      message: `${money(price)} is low for a car being novated — check this is the price and not a deposit or a monthly figure.`,
    };
  }
  return undefined;
}

/**
 * Every check, for one quote.
 *
 * Pure and total: any field it cannot judge yet — because something it needs
 * has not been typed — is simply absent. Half a quote must not light up red
 * while somebody is still filling it in.
 */
export function quoteFieldChecks(q: Quote, config: EngineConfig): QuoteFieldChecks {
  const out: QuoteFieldChecks = {};
  const add = (k: CheckedField, c: FieldCheck | undefined) => {
    if (c) out[k] = c;
  };
  add("finance", checkFinance(q, config));
  add("residualIncGst", checkResidual(q, config));
  add("amountFinanced", checkAmountFinanced(q));
  add("managementFee", checkManagementFee(q, config));
  add("vehiclePrice", checkVehiclePrice(q));
  return out;
}

/** True where anything is impossible rather than merely unusual. */
export function hasBlockingCheck(checks: QuoteFieldChecks): boolean {
  return Object.values(checks).some((c) => c.level === "error");
}
