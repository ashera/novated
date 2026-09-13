// One worked example, shared by every article.
//
// An article cannot use the reader's figures — there aren't any yet. It has to
// bring its own, and the choice matters more than it looks: a reader who moves
// between two articles and finds two different cars has to start over each
// time, and cannot tell which differences are the point and which are just the
// example changing underneath them.
//
// So there is exactly one, described in a sentence anyone can check themselves
// against, and every article states it before using it. Where an article needs
// a contrast — the same car in petrol, the same salary at a capped employer —
// it varies ONE thing from this base, so the difference is attributable.
//
// The figures are computed from it rather than typed, so an article is never
// out of date with the calculator it links to. That is the whole reason to
// build the library this way: a budget changes the rates, and every article
// republishes itself correctly on the next request.

import type { EngineConfig } from "./config";
import { defaultInputs, type LeaseInputs } from "./novated";

/** How the example is introduced, in the article's own words. */
export const EXAMPLE_SENTENCE =
  "a $55,000 electric car over five years, on a $110,000 salary, with running costs packaged";

export const EXAMPLE_PETROL_SENTENCE =
  "the same car and salary, but petrol rather than electric, so it pays FBT like any other car";

/**
 * The scenario every article works from.
 *
 * Deliberately the calculator's own defaults. Somebody who reads an article
 * and then opens the calculator sees the figures they have just read, which is
 * the handover the whole library exists to make — and it means the example can
 * never drift from what a first-time visitor is shown.
 */
export function exampleInputs(config: EngineConfig): LeaseInputs {
  return defaultInputs(config);
}

/** The same scenario in a car that gets no exemption. */
export function examplePetrolInputs(config: EngineConfig): LeaseInputs {
  return { ...defaultInputs(config), fuelType: "petrol" };
}
