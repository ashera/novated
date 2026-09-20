"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { stashSharedLease } from "@/lib/quoteHandoff";
import type { Lease } from "@/lib/au/lease";

/**
 * What the left column is for on a lease somebody sent you.
 *
 * On your own lease that column holds the quotes card. On a shared one it
 * cannot: the page shows the sender's lease while the store behind it is
 * yours, so every control there would edit a different lease from the one on
 * screen — silently, and invisibly. Leaving it empty was the safe answer and
 * it wasted the most valuable moment this site gets: somebody is reading a
 * real lease, on real figures, because a person they know sent it to them.
 *
 * So the column explains what they are looking at and offers the one thing
 * that turns a dead end into a beginning — the same car and the same quotes,
 * in a workspace where the controls work.
 *
 * It is careful about whose figures are whose, because that is the whole
 * reason the copy is worth making. The cost on the page is the sender's; the
 * reader's will differ, and the panel says so before they draw a conclusion
 * from somebody else's salary.
 */
export default function SharedLeaseStart({ lease }: { lease: Lease }) {
  const router = useRouter();
  const quotes = lease.quotes.length;

  const start = () => {
    stashSharedLease(lease);
    router.push("/");
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-accent-border bg-accent-subtle p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Shared with you</p>
        <h2 className="mt-1.5 text-base font-semibold text-ink">
          These are somebody else&apos;s figures
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-subtle">
          Every amount on this page is worked out against the salary of the person who shared it.
          The car and the quotes would be the same for you; what it costs would not — your tax
          bracket, any study loan and whether the electric vehicle exemption applies all move the
          answer.
        </p>
        <button
          type="button"
          onClick={start}
          className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Work it out on my salary
        </button>
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
          Takes the car{quotes > 0 ? ` and ${quotes === 1 ? "the quote" : `all ${quotes} quotes`}` : ""} into
          a workspace of your own, where you can edit them and add more. Their salary does not come
          with it, and nothing you do there reaches them.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-panel p-4 text-sm leading-relaxed text-subtle">
        <p>
          Holding a quote of your own instead?{" "}
          <Link href="/decode" className="font-semibold text-accent hover:underline">
            Decode it
          </Link>{" "}
          — it finds the interest rate a quote does not print.
        </p>
      </section>
    </div>
  );
}
