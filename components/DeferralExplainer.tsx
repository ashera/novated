"use client";

import Explainer from "./Explainer";
import { fmtCurrencyCents } from "@/lib/au/format";
import type { Quote, QuoteDecode } from "@/lib/au/quote";

/**
 * Why one payment produces two interest rates.
 *
 * The deferral finding states both figures and says which is which, and that
 * is still not enough: "solving the payment as though repayment started on day
 * one" is a sentence about arithmetic nobody has seen. People asked what it
 * meant, twice.
 *
 * So this shows the two calculations side by side with the reader's own
 * numbers in them. The whole point is visible in the shapes rather than the
 * prose — one schedule has a gap at the start and fewer payments, the other
 * does not, and everything else about them is identical. Once the two
 * timelines are on screen the phrase explains itself.
 *
 * It also answers the question that follows, which is "so which one is the
 * real rate": both, for different questions, and the panel says which to use
 * against a car loan and which to use when asking the financier about their
 * margin.
 *
 * Rendered only where there is a deferral and both rates solved. Everything
 * here is derived from the decode rather than recomputed, so it cannot drift
 * from the finding it sits under.
 */

function Row({
  when,
  what,
  amount,
  tone = "plain",
}: {
  when: string;
  what: string;
  amount?: string;
  tone?: "plain" | "gap" | "total";
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-l-2 py-1.5 pl-3 ${
        tone === "gap"
          ? "border-warning bg-warning-subtle"
          : tone === "total"
            ? "border-accent"
            : "border-line"
      }`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{when}</span>
      <span className="flex-1 text-xs text-ink">{what}</span>
      {amount && (
        <span className="text-xs font-semibold tabular-nums text-ink">{amount}</span>
      )}
    </div>
  );
}

export default function DeferralExplainer({
  quote,
  decode,
}: {
  quote: Quote;
  decode: QuoteDecode;
}) {
  const deferred = quote.deferredMonths ?? 0;
  const financed = decode.amountFinanced;
  const residual = decode.residualExGst;
  const monthly = decode.monthlyFinancePayment;
  const allIn = decode.impliedRatePct;
  const onMoney = decode.rateAfterDeferralPct;

  if (!deferred || financed == null || residual == null || monthly == null) return null;
  if (allIn == null || onMoney == null) return null;

  /* The debt at the moment repayments start, at the rate the financier is
     actually charging. This is the figure the whole explanation turns on and
     it appears on no document. */
  const grown = financed * Math.pow(1 + onMoney / 100 / 12, deferred);
  const accrued = grown - financed;

  /* Payments actually made. Where the end date holds they come out of the
     count; where the term shifts they do not, and the lease simply finishes
     later. */
  const shifts = quote.deferralExtendsTerm === true;
  const payments = shifts ? quote.termMonths : quote.termMonths - deferred;

  /* What the same money would cost with no deferral at all, at the same rate.
     The difference is the price of the gap, in a number rather than a phrase. */
  const i = onMoney / 100 / 12;
  const n = quote.termMonths;
  const factor = (1 - Math.pow(1 + i, -n)) / i;
  const plain = (financed - residual * Math.pow(1 + i, -n)) / factor;

  const mth = (n: number) => `month${n === 1 ? "" : "s"}`;

  return (
    <Explainer title="Why the same payment has two rates" label="Show me the numbers">
      <p>
        Your quote defers the first {deferred} {mth(deferred)}. Nothing comes out of your pay, but
        the financier has already paid for the car — so the debt is growing before a single
        payment lands. That one gap is the whole reason two rates come out of one payment.
      </p>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          What actually happens — this solves to {onMoney.toFixed(2)}%
        </p>
        <div className="space-y-1">
          {/* Cents throughout this panel, against the house style of whole
              dollars for computed figures.

              Two reasons, and they are specific to what this is. The first
              three lines are an addition the reader is invited to check, and
              rounded, 26,918 + 447 reads as 27,365 against a 27,366 below it.
              And the same payout appears in both schedules — shown one way
              here and another there, it stops looking like the same number,
              which is exactly the thing the two timelines exist to prove. */}
          <Row
            when="Day 1"
            what="The financier pays for the car"
            amount={fmtCurrencyCents(financed)}
          />
          <Row
            when={`${mth(deferred)} 1–${deferred}`}
            what="Nothing is repaid, and interest runs anyway"
            amount={"+" + fmtCurrencyCents(accrued)}
            tone="gap"
          />
          <Row
            when={`Month ${deferred}`}
            what="What you now owe"
            amount={fmtCurrencyCents(grown)}
          />
          <Row
            when="Then"
            what={`${payments} payments of ${fmtCurrencyCents(monthly)} a month`}
          />
          <Row
            when={`Month ${quote.termMonths + (shifts ? deferred : 0)}`}
            what="The residual falls due"
            amount={fmtCurrencyCents(residual)}
            tone="total"
          />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          What the all-in figure assumes — this solves to {allIn.toFixed(2)}%
        </p>
        <div className="space-y-1">
          <Row when="Day 1" what="The financier pays for the car" amount={fmtCurrencyCents(financed)} />
          <Row
            when="Then"
            what={`${quote.termMonths} payments of ${fmtCurrencyCents(monthly)} a month, starting straight away`}
          />
          <Row
            when={`Month ${quote.termMonths}`}
            what="The residual falls due"
            amount={fmtCurrencyCents(residual)}
            tone="total"
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Same money, same payment, same car. The only difference is that this version doesn&apos;t
          know about the gap — so it blames the size of the payment on the interest rate.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-panel-2 p-3">
        <p className="text-xs font-semibold text-ink">Why the payment is bigger than a plain loan</p>
        <div className="mt-2 space-y-1 text-xs tabular-nums text-subtle">
          <p className="flex justify-between gap-3">
            <span>
              The same loan at {onMoney.toFixed(2)}%, no deferral
            </span>
            <span className="font-semibold text-ink">{fmtCurrencyCents(plain)} a month</span>
          </p>
          <p className="flex justify-between gap-3">
            <span>This lease charges</span>
            <span className="font-semibold text-ink">{fmtCurrencyCents(monthly)} a month</span>
          </p>
          <p className="flex justify-between gap-3 border-t border-line pt-1">
            <span>The difference</span>
            <span className="font-semibold text-ink">
              {fmtCurrencyCents(Math.max(0, monthly - plain))} a month
            </span>
          </p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          None of that difference is a higher rate. It is there because{" "}
          {fmtCurrencyCents(accrued)} of interest was added to the debt before repayments started
          {shifts ? "." : `, and there are ${payments} payments to clear it rather than ${quote.termMonths}.`}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-ink">So which is the real rate?</p>
        <p className="mt-1.5 text-xs leading-relaxed text-subtle">
          Both, for different questions.{" "}
          <strong className="text-ink">{allIn.toFixed(2)}%</strong> is what the payment costs you,
          and it is the one to compare against a car loan, because a loan wouldn&apos;t defer
          anything. <strong className="text-ink">{onMoney.toFixed(2)}%</strong> is what the
          financier is charging on the money, and it is the one to quote back at them when you ask
          why the rate is what it is.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          The gap between them is the price of the deferral. It is not free just because nothing
          came out of your pay for {deferred} {mth(deferred)}.
        </p>
      </div>
    </Explainer>
  );
}
