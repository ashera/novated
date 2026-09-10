// The shape of a saved scenario — what lands in the `plans` table as JSON, what
// a share link resolves to, and what the report renders. Kept deliberately thin:
// it holds the user's INPUTS only, never computed results, so an engine change
// or a reference-data update re-runs every saved scenario at today's rules.

import type { LeaseInputs } from "./novated";
import { DEFAULT_CONFIG } from "./config";
import { defaultInputs } from "./novated";

export interface LeaseScenario {
  /** Bumped when the stored shape changes; `migrateScenario` handles the rest. */
  version: 1;
  /** Display name, mirrored into plans.name so it can be listed without parsing. */
  name: string;
  inputs: LeaseInputs;
  /** Free text the user keeps against the scenario. Never included in a share
   *  link — see app/actions/plans.ts. */
  notes?: string;
  updatedAt?: string;
}

export const DEFAULT_SCENARIO: LeaseScenario = {
  version: 1,
  name: "My first lease",
  inputs: defaultInputs(DEFAULT_CONFIG),
};

/** Bring a stored scenario up to the current shape. Anything unrecognised falls
 *  back to the default, so a corrupt or ancient row still opens. */
export function migrateScenario(raw: unknown): LeaseScenario {
  if (!raw || typeof raw !== "object") return DEFAULT_SCENARIO;
  const s = raw as Partial<LeaseScenario>;
  if (!s.inputs || typeof s.inputs !== "object") return DEFAULT_SCENARIO;
  return {
    version: 1,
    name: s.name?.trim() || DEFAULT_SCENARIO.name,
    inputs: { ...DEFAULT_SCENARIO.inputs, ...s.inputs },
    notes: s.notes,
    updatedAt: s.updatedAt,
  };
}
