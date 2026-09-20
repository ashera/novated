"use client";

import { fmtCurrency } from "@/lib/au/format";
import {
  effectivePayCycle,
  PAY_CYCLE_NOUN,
  type LeaseResult,
} from "@/lib/au/novated";
import type { EngineConfig } from "@/lib/au/config";

/**
 * The answer, before the page has finished asking the questions.
 *
 * The calculator is laid out as a conversation — describe the car, describe
 * the arrangement, then read the results — and on a phone that means the
 * whole inputs column sits between somebody and any number at all. Every one
 * of those inputs already has a sensible default, so there is a real answer
 * available long before anyone is asked to confirm anything.
 *
 * A taster rather than a reordering. It duplicates an OUTPUT, which is derived
 * and therefore cannot drift, where moving the inputs or adding a second short
 * form would have meant two places to keep right. Nothing is removed and the
 * page keeps its order; there is just a number early enough to be worth
 * scrolling for.
 *
 * The figure is the one that matters and the one every provider's calculator
 * buries: what actually leaves your pay. Not the tax saved — a headline built
 * from the saving is how the rest of the industry makes a lease look free, and
 * this site exists to argue the opposite. It points down rather than
 * explaining itself, because the explanation is the rest of the page.
 *
 * The rate is named with it, and named with its source.
 *
 * A cost per fortnight is meaningless without the rate it was worked out at —
 * a point of interest on a $60,000 lease is thousands — and this card is the
 * first and often only figure somebody reads. But a bare "7.0%" would be
 * worse than none: on a page nobody has typed a quote into, that number is
 * OUR assumption, and printing it beside a confident dollar figure is exactly
 * the move this site exists to object to. So it says which of the three it
 * is: solved from a real quote, typed by the reader, or ours until they have
 * one.
 */
export default function CostTaster({
  result,
  config,
  rateFromQuote,
}: {
  result: LeaseResult;
  config: EngineConfig;
  /** The provider whose quote the rate was solved from, where the figures are
   *  modelled on one. Absent means nobody has brought a quote yet. */
  rateFromQuote?: string;
}) {
  const noun = PAY_CYCLE_NOUN[effectivePayCycle(result.inputs.payCycle, config)];
  const perCycle = result.perPayCycle.takeHomeReduction;
  const covered = result.inputs.includeRunningCosts;

  const rate = result.inputs.interestRatePct;
  /* Ours only if nobody has moved it. Somebody who typed the same number as
     our default gets told it is theirs, which is true and the safer way round
     — the claim we must never make is that an assumption is a fact. */
  const isOurs = !rateFromQuote && rate === config.lease.defaultInterestRatePct;
  const source = rateFromQuote
    ? `the rate on ${rateFromQuote}'s quote`
    : isOurs
      ? "our assumption, until you put a real quote in"
      : "the rate you entered";

  return (
    <a
      href="#the-numbers"
      className="mb-6 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 rounded-xl border border-accent-border bg-accent-subtle px-4 py-3 transition hover:border-accent sm:px-5"
    >
      <p className="text-sm text-ink">
        On these figures it costs you{" "}
        <strong className="whitespace-nowrap text-base font-semibold">
          {fmtCurrency(perCycle)} a {noun}
        </strong>{" "}
        out of your take-home pay
        {covered
          ? " — and that covers the car, its running costs and the fees."
          : " — the car and the fees, with running costs still yours to pay."}
      </p>
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-accent">
        See how it&apos;s made up ↓
      </span>
      <p className="w-full text-xs leading-snug text-subtle">
        Finance at{" "}
        <strong className="tabular-nums text-ink">{rate.toFixed(2)}%</strong> — {source}.
      </p>
    </a>
  );
}
