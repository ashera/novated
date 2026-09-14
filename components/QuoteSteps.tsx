"use client";

import { useEffect } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics";

/**
 * What a person actually has to do to get a quote, in order.
 *
 * Written for somebody who has never spoken to a leasing provider. The first
 * step is the one nobody mentions and the one that decides how many quotes
 * they can get at all; the third is the one that surprises people, because a
 * quote looks like a price and is really a bundle; and the fourth is the
 * reason the quotes card exists.
 *
 * In a modal rather than folded into the card. As a disclosure it doubled the
 * card's height when opened, and the card sits in a sticky column — which put
 * its bottom third somewhere no amount of scrolling could reach. A modal keeps
 * the column the size it is meant to be, and this is reference material people
 * read once rather than something they need beside the figures.
 */

const STEPS: { title: string; body: string; href?: string; linkLabel?: string }[] = [
  {
    title: "Check what your employer allows.",
    body:
      "The payments come out of payroll, so your employer has to agree to the arrangement. Most have a provider they already work with, and some let you bring your own — worth asking, because it is the difference between one quote and several.",
    href: "/choose-your-provider",
    linkLabel: "Work out whether you can",
  },
  {
    title: "Ask for a quote on a specific car.",
    body:
      "Providers price a particular model at a particular price over a particular term. Give them all three and what comes back can be compared like for like.",
  },
  {
    title: "Expect one number, not a breakdown.",
    body:
      "A quote leads with what leaves each pay — the finance, the running-cost budgets, the fees and any FBT, rolled together. The interest rate behind it is almost never printed.",
  },
  {
    title: "Get more than one.",
    body:
      "On the same car, term and salary, providers differ by thousands over a lease. A single quote tells you what it costs, not whether it is any good.",
  },
  {
    title: "Type each one in here.",
    body:
      "We work out the rate behind it, measure every running-cost line against the market, and give you the questions worth sending back.",
  },
];

export default function QuoteSteps({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="fixed inset-0 bg-[#091e42]/54 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How getting quotes works"
        className="relative z-10 my-8 w-full max-w-2xl rounded-xl border border-line bg-panel shadow-2xl"
      >
        {/* No flex-wrap. The sample-quote modal is max-w-4xl and its header has
            room to spare; this one is max-w-2xl, and the standfirst pushed the
            Close button onto a line of its own under the text. The text block
            shrinks instead. */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">How getting quotes works</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Five steps, in order. You cannot ask for a quote before you know whether your
              employer allows one, and you cannot compare two until you have asked twice.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-line bg-panel-2 px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <ol className="space-y-4 text-sm leading-relaxed text-subtle">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold tabular-nums text-accent">
                  {i + 1}
                </span>
                <span>
                  <strong className="font-semibold text-ink">{step.title}</strong> {step.body}
                  {step.href && (
                    <>
                      {" "}
                      <Link
                        href={step.href}
                        className="font-semibold text-accent hover:underline"
                        onClick={() => track("BYO checker opened", { from: "quote-steps" })}
                      >
                        {step.linkLabel} →
                      </Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
