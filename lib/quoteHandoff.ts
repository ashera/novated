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

const KEY = "leasewiz-handoff";

export interface QuoteHandoff {
  inputs: LeaseInputs;
  /** What to call it on screen — the provider's name, where they gave one. */
  label: string;
  /** The rate we solved, so the calculator can say where its rate came from. */
  impliedRatePct: number | null;
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
