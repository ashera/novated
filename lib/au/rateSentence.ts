import { fmtCurrency, fmtCurrencyCents } from "@/lib/au/format";
import type { Quote, QuoteDecode } from "@/lib/au/quote";

/**
 * The sentence a user reads back to their provider.
 *
 * Four figures off their own quote, the rate those figures imply, and one
 * question. It lives here rather than in the component because it is the piece
 * of copy most likely to go stale: it asks a question, and the page now has a
 * place to record the answer. Once the answer is in, the question has to
 * change — and that is a rule worth asserting in a test rather than trusting a
 * component nobody renders in CI.
 *
 * It says "payment", not "rental". The document it is quoting back will say
 * rental, and the glossary teaches the word, but this sentence is spoken in the
 * user's voice — and it names the field they typed the figure into, which is
 * "Finance payment". A provider loses nothing by hearing it called that.
 *
 * Returns null where the figures the rate rests on aren't all there.
 */
export function rateSentence(quote: Quote, decode: QuoteDecode, noun: string): string | null {
  const rate = decode.impliedRatePct;
  const financed = decode.amountFinanced;
  const payment = quote.lines.finance;
  if (rate == null || financed == null || payment == null) return null;

  const facts =
    `Your quote finances ${fmtCurrency(financed)} over ${quote.termMonths} months, ` +
    `with a finance payment of ${fmtCurrencyCents(payment)} per ${noun} and a residual of ` +
    `${fmtCurrency(quote.residualIncGst ?? 0)} including GST. Those four figures imply an ` +
    `interest rate of about ${rate.toFixed(2)}% a year. `;

  return facts + rateAsk(quote, decode, noun);
}

/**
 * The half of the sentence that depends on whether they have answered yet.
 *
 * Before: what is the rate, and what else is in the payment. After: the fees
 * they named, what those leave the money itself costing, and whether any of it
 * moves. Never both — asking a question somebody has already answered is how
 * you get ignored.
 */
export function rateAsk(quote: Quote, decode: QuoteDecode, noun: string): string {
  const r = decode.reconciliation;
  if (r == null) {
    return (
      `Could you confirm the rate on the finance, and tell me whether anything ` +
      `other than interest is included in that payment?`
    );
  }

  const financed = quote.explainedFeesFinanced ?? 0;
  const perPayment = quote.explainedFeesPerPayment ?? 0;
  const named = [
    financed > 0 ? `${fmtCurrency(financed)} added to what I borrow` : null,
    perPayment > 0 ? `${fmtCurrencyCents(perPayment)} a ${noun} inside the payment` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const opener = `You've told me the payment includes ${named}`;

  if (r.reconciles) {
    const lands =
      decode.ratePaidOnBorrowingPct != null
        ? ` and puts the finance itself at ${decode.ratePaidOnBorrowingPct.toFixed(2)}%`
        : "";
    return `${opener}, which accounts for the difference${lands}. Is any of that negotiable?`;
  }

  if (r.unexplainedOverTerm > 0) {
    return (
      `${opener}. That still leaves about ${fmtCurrency(r.unexplainedOverTerm)} over the ` +
      `term unaccounted for — what makes up the difference?`
    );
  }

  return (
    `${opener}, which would cost more than the quote actually charges. Could you confirm ` +
    `which of those is right?`
  );
}
