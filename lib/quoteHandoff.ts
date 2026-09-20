// Passing a decoded quote to the calculator.
//
// Deliberately a one-shot browser handoff rather than a URL parameter or a
// server round-trip. The payload is a whole set of lease inputs — too big for a
// tidy URL — and it is derived from a document the user hasn't necessarily
// saved anywhere, so there may be no id to link to. It also works identically
// for a guest and a signed-in user, which the alternatives do not.
//
// It is consumed once and deleted: landing on the calculator a week later
// should not silently resurrect a quote the user has forgotten about.

import type { LeaseInputs } from "./au/novated";
import type { Lease, QuoteSpec, VehicleSpec } from "./au/lease";

const KEY = "leasewiz-handoff";

export interface QuoteHandoff {
  inputs: LeaseInputs;
  /** What to call it on screen — the provider's name, where they gave one. */
  label: string;
  /** The rate we solved, so the calculator can say where its rate came from. */
  impliedRatePct: number | null;
  /** Which of the lease's quotes this came from, when it is a saved one.
   *  Stored on the scenario so the attribution outlives the handoff — which
   *  is consumed on read and gone by the next page load. */
  quoteId?: string;
}

export function stashHandoff(h: QuoteHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    /* storage blocked — the calculator just opens on its defaults */
  }
}

/** Read and remove the handoff. Returns null when there isn't one, or when
 *  what's there isn't usable. */
export function takeHandoff(): QuoteHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as QuoteHandoff;
    if (!parsed?.inputs || typeof parsed.inputs.salary !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── A quote somebody shared, on its way to becoming the reader's lease ──────

/**
 * Why this is its own payload rather than the one above.
 *
 * The handoff above answers "model these numbers", and its whole point is that
 * it carries a solved scenario — which is why `takeHandoff` refuses anything
 * without a salary in it. A shared quote is the opposite case: the salary is
 * the one thing it must NOT carry, because it is the sender's. Widening the
 * first payload to allow that would remove the check that makes it safe.
 *
 * Same discipline, though, and for the same reasons: session storage, one
 * shot, deleted on read. Someone who followed a share link, wandered off and
 * came back a week later should not find a stranger's quote waiting in their
 * workspace.
 */
const SHARED_KEY = "leasewiz-shared-quote";

export interface SharedQuoteHandoff {
  vehicle: VehicleSpec;
  /** Already stripped of the sender's salary, server-side. */
  quote: QuoteSpec;
  /** What to call the lease it becomes — the car, or the provider. */
  leaseName: string;
}

export function stashSharedQuote(h: SharedQuoteHandoff): void {
  try {
    sessionStorage.setItem(SHARED_KEY, JSON.stringify(h));
  } catch {
    /* storage blocked — the reader lands on an ordinary empty lease */
  }
}

/** Read and remove it. Null when there is none, or when what is there could
 *  not build a lease — a quote with no term cannot be amortised, and half a
 *  lease is worse than none. */
export function takeSharedQuote(): SharedQuoteHandoff | null {
  try {
    const raw = sessionStorage.getItem(SHARED_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SHARED_KEY);
    const parsed = JSON.parse(raw) as SharedQuoteHandoff;
    if (!parsed?.quote || !parsed.vehicle) return null;
    if (typeof parsed.quote.termMonths !== "number" || parsed.quote.termMonths <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── A whole lease somebody shared, on its way to becoming the reader's ──────

/**
 * Same discipline as the two above: session storage, one shot, gone on read.
 *
 * Its own key rather than a wider version of the shared-quote payload,
 * because they carry different things and the checks that make each safe are
 * different. A quote needs a term to be worth anything; a lease needs a car.
 */
const SHARED_LEASE_KEY = "leasewiz-shared-lease";

export function stashSharedLease(lease: Lease): void {
  try {
    sessionStorage.setItem(SHARED_LEASE_KEY, JSON.stringify(lease));
  } catch {
    /* storage blocked — the reader lands on an ordinary empty lease */
  }
}

/** Read and remove it. Null where there is nothing usable: a copy with no
 *  car is not a starting point, it is an empty form with extra steps. */
export function takeSharedLease(): Lease | null {
  try {
    const raw = sessionStorage.getItem(SHARED_LEASE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SHARED_LEASE_KEY);
    const parsed = JSON.parse(raw) as Lease;
    if (!parsed?.vehicle || !Array.isArray(parsed.quotes)) return null;
    return parsed;
  } catch {
    return null;
  }
}
