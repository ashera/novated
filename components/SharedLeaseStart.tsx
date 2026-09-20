"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [salary, setSalary] = useState("");

  /*
   * The salary is asked for HERE, not left to the next page.
   *
   * The button says "on my salary", and without asking, the copy opened on
   * our default — a third figure, neither the sender's nor the reader's,
   * shown with the same confidence as the one they had just read. A lease
   * shared at $150,000 landed at $133 a week against the $120 on the page
   * behind it, and nothing said why. Asking is one field, and it makes the
   * button true.
   */
  const start = () => {
    const n = parseFloat(salary.replace(/[^0-9.]/g, ""));
    stashSharedLease({ lease, salary: Number.isFinite(n) && n > 0 ? n : undefined });
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
        <label className="mt-4 block">
          <span className="text-sm font-medium text-ink">Your salary, before tax</span>
          <span className="mt-1 flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-2 focus-within:border-accent">
            <span className="text-xs text-muted">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
              placeholder="110,000"
              className="w-full bg-transparent text-sm font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/70"
            />
          </span>
        </label>

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
          {salary.trim() === "" && " Leave the box empty and it opens on our default, which you can change there."}
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
