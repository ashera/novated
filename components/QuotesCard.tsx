"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  activateQuote,
  lockQuote,
  newQuoteSpec,
  quoteIsNamed,
  quoteLabel,
  quoteStatus,
  removeQuote,
  unlockQuote,
  type QuoteSpec,
  type QuoteStatus,
} from "@/lib/au/lease";
import type { EngineConfig } from "@/lib/au/config";
import { fmtDate } from "@/lib/au/format";
import type { UseLease } from "./useLease";
import SampleQuote from "./SampleQuote";

/**
 * Every quote gathered against this lease.
 *
 * Its own card, below the car. The quotes are what accumulate as the journey
 * goes on — one from each provider — so they need room to grow and a heading
 * of their own.
 *
 * Empty, it is the only teaching surface on the page for the part of a
 * novated lease that happens off it. Most people arriving here have never
 * asked a leasing provider for anything and do not know that the provider is
 * a separate business from the dealer, that a quote arrives as one number
 * with no rate in it, or that asking three of them is normal. An empty card
 * saying "none yet" tells someone who already knows all that where to click,
 * and tells everyone else nothing. So the steps come first and the button
 * comes after them — you should know what you are adding before you are
 * asked to add it.
 *
 * The card has two shapes. While the user is still deciding, it is a flat list
 * with one quote marked ACTIVE — whose rate, budgets and fees the figures
 * below are modelled on. Once they settle on one it becomes a decision and its
 * runners-up: the chosen quote alone at the top, then everything it was chosen
 * over, dimmed, under "other quotes considered". The losers are kept rather
 * than hidden, because "why did I pick that one" is a question people ask
 * themselves months later.
 */

const STATUS_STYLE: Record<QuoteStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-panel-3 text-muted" },
  "in-progress": { label: "In progress", className: "bg-warning-subtle text-warning-text" },
  complete: { label: "Complete", className: "bg-success-subtle text-success-text" },
};

/**
 * What a person actually has to do to get a quote, in order.
 *
 * Written for somebody who has never spoken to a leasing provider. The first
 * step is the one nobody mentions and the one that decides how many quotes
 * they can get at all; the third is the one that surprises people, because a
 * quote looks like a price and is really a bundle; and the fourth is the
 * reason this card exists at all.
 */
const STEPS: { title: string; body: string }[] = [
  {
    title: "Check what your employer allows.",
    body:
      "The payments come out of payroll, so your employer has to agree to the arrangement. Most have a provider they already work with, and some let you bring your own — worth asking, because it is the difference between one quote and several.",
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

const pillBase =
  "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white";
const btn =
  "rounded border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-ink transition hover:border-accent hover:text-accent";

export default function QuotesCard({
  store,
  config,
}: {
  store: UseLease;
  config: EngineConfig;
}) {
  const { lease } = store;
  const router = useRouter();
  const activeId = lease.scenario.fromQuoteId;
  const lockedId = lease.lockedQuoteId;
  const [confirming, setConfirming] = useState<string | null>(null);
  /**
   * Which quote is one more click from being deleted.
   *
   * Two steps on the row rather than a modal: a quote is a page of figures
   * somebody typed off a document, so it must not go on a stray click — but
   * it is also the thing they came here to tidy up, and a dialog for each one
   * makes clearing three quotes feel like an argument. The second click is
   * the confirmation, and anywhere else cancels it.
   */
  const [removing, setRemoving] = useState<string | null>(null);
  /** Showing what a provider's quote looks like, for somebody who has never
   *  been sent one. Offered from the steps, where the question arises. */
  const [showingSample, setShowingSample] = useState(false);

  /** Model this quote in the figures below, without a trip to the decoder.
   *  Only offered where the quote solves — see activateQuote. */
  const activate = (id: string) => store.update((l) => activateQuote(l, id, config));

  const addQuote = () => {
    // Unnamed on purpose — see the note in QuoteComparison.addQuote.
    const spec = newQuoteSpec("", lease.scenario.termYears * 12);
    store.update((l) => ({ ...l, quotes: [...l.quotes, spec] }));
    // Adding a quote means going and typing it in, so take them there.
    router.push(`/decode?quote=${encodeURIComponent(spec.id)}`);
  };

  /* Numbered because it genuinely is a sequence: you cannot ask for a quote
     before you know whether your employer allows one, and you cannot compare
     two until you have asked twice. Shared between the empty state, where it
     is the whole card, and a disclosure once there are quotes — somebody
     coming back a week later should not have to delete everything to read it
     again. */
  const steps = (
    <ol className="mt-2.5 max-w-3xl space-y-2.5 text-sm leading-relaxed text-subtle">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold tabular-nums text-accent">
            {i + 1}
          </span>
          <span>
            <strong className="font-semibold text-ink">{step.title}</strong> {step.body}
          </span>
        </li>
      ))}
    </ol>
  );

  const locked = lockedId ? (lease.quotes.find((q) => q.id === lockedId) ?? null) : null;
  const others = locked ? lease.quotes.filter((q) => q.id !== locked.id) : lease.quotes;
  const pending = confirming ? lease.quotes.find((q) => q.id === confirming) : null;

  const row = (q: QuoteSpec, dimmed: boolean) => {
    const status = quoteStatus(lease, q, config);
    const style = STATUS_STYLE[status];
    const active = q.id === activeId;
    const isLocked = q.id === lockedId;
    // A quote with nobody's name on it can't be settled on: "I chose Untitled
    // quote" is not a decision anyone can act on later. The engine refuses it
    // too, so this only saves the user a dead click.
    const named = quoteIsNamed(q);

    return (
      <li
        key={q.id}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${dimmed ? "opacity-60" : ""} ${
          active && !isLocked ? "-mx-2 rounded-md bg-accent-subtle px-2" : ""
        }`}
      >
        <Link
          href={`/decode?quote=${encodeURIComponent(q.id)}`}
          className={`text-sm font-medium hover:underline ${dimmed ? "text-subtle" : "text-accent"}`}
        >
          {quoteLabel(q)}
        </Link>

        {isLocked && (
          <span
            title="The quote you want to move forward with"
            className={`${pillBase} bg-success`}
          >
            Locked in
          </span>
        )}
        {active && !isLocked && (
          <span
            title="The figures below are modelled on this quote"
            className={`${pillBase} bg-accent`}
          >
            Active
          </span>
        )}

        {isLocked && (
          <button
            type="button"
            onClick={() => store.update(unlockQuote)}
            title="Go back to comparing"
            className={btn}
          >
            Unlock
          </button>
        )}

        {/* While one is locked the decision stands. Reconsidering means
            unlocking first, rather than another quote quietly taking over and
            silently undoing it. */}
        {!locked && active && (
          <button
            type="button"
            disabled={!named}
            onClick={() => setConfirming(q.id)}
            title={
              named
                ? "Move forward with this one and see what your payslip will look like"
                : "Say who quoted it first — a locked-in quote has to be one you can name"
            }
            className={`${btn} ${!named ? "cursor-not-allowed opacity-50 hover:border-line hover:text-ink" : ""}`}
          >
            Lock it in
          </button>
        )}
        {!named && (
          <Link
            href={`/decode?quote=${encodeURIComponent(q.id)}`}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-warning-text underline decoration-warning-text/40 underline-offset-2 transition hover:decoration-warning-text"
          >
            Say who quoted it
          </Link>
        )}
        {!locked && !active && status === "complete" && (
          <button
            type="button"
            onClick={() => activate(q.id)}
            title="Model the figures below on this quote"
            className={btn}
          >
            Use this one
          </button>
        )}

        <span className="text-xs text-muted">
          {q.createdAt ? `Processed ${fmtDate(q.createdAt)}` : "Not yet processed"}
        </span>

        {/* Never on the locked quote: that decision gets reconsidered by
            unlocking, not by deleting the evidence out from under it. */}
        {!isLocked &&
          (removing === q.id ? (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-[11px] text-danger-text">Remove this quote?</span>
              <button
                type="button"
                onClick={() => {
                  setRemoving(null);
                  store.update((l) => removeQuote(l, q.id));
                }}
                className="rounded border border-danger/50 bg-danger-subtle px-2 py-0.5 text-[11px] font-semibold text-danger-text transition hover:border-danger"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setRemoving(null)}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted transition hover:text-ink"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setRemoving(q.id)}
              title={`Remove ${quoteLabel(q)} from this lease`}
              aria-label={`Remove ${quoteLabel(q)}`}
              className="ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium text-muted transition hover:bg-danger-subtle hover:text-danger-text"
            >
              Remove
            </button>
          ))}

        <span
          className={`${isLocked ? "ml-auto" : ""} rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.className}`}
        >
          {style.label}
        </span>
      </li>
    );
  };

  return (
    <section className="mb-6 rounded-xl border border-line bg-panel px-4 py-3.5 shadow-[var(--shadow-card)] sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-base font-semibold text-ink">
          Analyse quotes/estimates from leasing providers
          {lease.quotes.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted">{lease.quotes.length}</span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {lease.quotes.length > 1 && (
            <Link href="/compare" className="text-xs font-medium text-accent hover:underline">
              Compare all
            </Link>
          )}
          {/* Held back while the card is empty: the button belongs after the
              explanation there, not above it. */}
          {lease.quotes.length > 0 && (
            <button
              type="button"
              onClick={addQuote}
              className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-soft"
            >
              + Add a quote
            </button>
          )}
        </div>
      </div>

      {lease.quotes.length === 0 && (
        <p className="mt-1.5 max-w-3xl text-sm text-subtle">
          A novated lease is arranged through a leasing provider, not the dealer. You ask them to
          price the car you want and they send back a quote — some call it an estimate — showing
          one amount coming out of each pay. This is where you take those apart.
        </p>
      )}

      {/* What the two buttons on each row actually do. They read as near
          synonyms — both sound like "pick this one" — and the difference
          between them is the difference between comparing and deciding, so
          it gets said rather than inferred. It also answers the question the
          row raises before it is asked: why some quotes have no button yet. */}
      {!locked && lease.quotes.length > 0 && (
        <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted">
          <strong className="font-semibold text-subtle">Use this one</strong> models the figures
          below on that quote — its rate, its budgets and its fees — so you can see what each
          provider really costs you. It appears once there is enough on a quote to work the rate
          out.{" "}
          <strong className="font-semibold text-subtle">Lock it in</strong> once you have chosen:
          the page stops comparing and becomes the payslip you can expect. Both can be undone.
        </p>
      )}

      {lease.quotes.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-accent hover:underline">
            <span className="group-open:hidden">How getting quotes works</span>
            <span className="hidden group-open:inline">Hide how getting quotes works</span>
          </summary>
          {steps}
          <button
            type="button"
            onClick={() => setShowingSample(true)}
            className="mt-2.5 rounded border border-line bg-panel-2 px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
          >
            See what a quote looks like
          </button>
        </details>
      )}

      {lease.quotes.length === 0 ? (
        <div className="mt-3 rounded-lg border border-line bg-panel-2 px-4 py-3.5">
          <h3 className="text-sm font-semibold text-ink">How getting quotes works</h3>
          {steps}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={addQuote}
              className="rounded bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-accent-soft"
            >
              + Add a quote
            </button>
            {/* The obvious next question from step 3, answered before they
                have to go and get a quote to find out. */}
            <button
              type="button"
              onClick={() => setShowingSample(true)}
              className="rounded border border-line bg-panel px-3.5 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
            >
              See what one looks like
            </button>
            <span className="text-xs text-muted">
              Got one in front of you? Adding it takes a couple of minutes.
            </span>
          </div>
        </div>
      ) : locked ? (
        <>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted">
            The quote you want to move forward with.{" "}
            {others.length > 0 && "Everything below the line is what it was chosen over. "}
            Unlock it to go back to comparing — nothing is sent anywhere either way.
          </p>
          <ul>{row(locked, false)}</ul>

          {others.length > 0 && (
            <>
              <hr className="border-line" />
              <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Other quotes considered
              </h3>
              <ul className="divide-y divide-line">{others.map((q) => row(q, true))}</ul>
            </>
          )}
        </>
      ) : (
        <ul className="mt-3 divide-y divide-line">{lease.quotes.map((q) => row(q, false))}</ul>
      )}

      {showingSample && <SampleQuote onClose={() => setShowingSample(false)} />}

      {pending && (
        <LockConfirm
          label={quoteLabel(pending)}
          othersCount={lease.quotes.length - 1}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            store.update((l) => lockQuote(l, pending.id));
            setConfirming(null);
          }}
        />
      )}
    </section>
  );
}

/**
 * What locking in actually means, before it happens.
 *
 * "Lock in" is borrowed from the language providers use about rates and
 * finance, so it has to say plainly that this one commits the user to nothing:
 * no message goes anywhere, and it is reversible. Without that line the word
 * does the opposite of what this site is for.
 */
function LockConfirm({
  label,
  othersCount,
  onCancel,
  onConfirm,
}: {
  label: string;
  othersCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  const bullet = (children: React.ReactNode) => (
    <li className="flex gap-2">
      <span aria-hidden className="text-accent">
        &bull;
      </span>
      <span>{children}</span>
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#091e42]/54 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Lock in ${label}`}
        className="relative z-10 w-full max-w-md rounded-xl border border-line bg-panel shadow-2xl"
      >
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="text-lg font-semibold text-ink">Lock in {label}?</h2>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm leading-relaxed text-subtle">
          <p>
            You&apos;ve compared what you have and decided this is the one that works best for
            you. That is all locking in records.
          </p>
          <ul className="space-y-1.5">
            {bullet(
              <>
                The figures on this page stay modelled on {label}, and we&apos;ll show you what
                your payslip will look like once it starts.
              </>,
            )}
            {othersCount > 0 &&
              bullet(
                <>
                  Your other {othersCount === 1 ? "quote moves" : `${othersCount} quotes move`} to
                  &ldquo;other quotes considered&rdquo;. Nothing is deleted.
                </>,
              )}
            {bullet(<>You can unlock at any time and go back to comparing.</>)}
          </ul>
          <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-muted">
            <strong className="text-subtle">This is a note to yourself.</strong> Nothing is sent
            to the provider, no application is made, and you are not committed to anything. The
            lease only becomes real when you and your employer sign their paperwork.
          </p>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-soft"
          >
            Lock it in
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
