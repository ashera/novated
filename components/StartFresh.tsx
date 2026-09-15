"use client";

import { useState } from "react";
import { clearLocalData } from "@/lib/localData";
import { track } from "@/lib/analytics";

/**
 * Throw away what this browser is holding.
 *
 * A guest's leases live in local storage and nowhere else. That is state a
 * person cannot see and could not clear without developer tools — and "start
 * again from nothing" is a reasonable thing to want from a calculator,
 * particularly one people use to model several cars.
 *
 * Two steps, because it is not reversible. Not window.confirm: it is styled by
 * the browser, it reads as an error, and it cannot say the one thing that
 * actually matters here — that anything saved to an account is untouched, so
 * somebody signed in is clearing a copy rather than their work. That sentence
 * is the whole reason this is safe to offer, so it has to be on screen at the
 * moment of the decision rather than in a tooltip.
 *
 * A full document load afterwards rather than a router push: every hook that
 * reads storage does so on mount, and a client-side navigation would leave the
 * old lease sitting in React state with nothing behind it.
 */
export default function StartFresh() {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="hover:text-ink"
      >
        Start fresh
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <span className="text-muted">
        Clear every lease and quote stored in this browser? Anything saved to an account stays.
      </span>
      <button
        type="button"
        onClick={() => {
          track("Local data cleared");
          clearLocalData();
          window.location.href = "/";
        }}
        className="font-semibold text-danger-text hover:underline"
      >
        Clear it
      </button>
      <span aria-hidden>·</span>
      <button type="button" onClick={() => setAsking(false)} className="hover:text-ink">
        Cancel
      </button>
    </span>
  );
}
