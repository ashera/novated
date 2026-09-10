"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { LeaseScenario } from "@/lib/au/types";

export interface SavedPlan {
  id: string;
  name: string;
  data: LeaseScenario;
  updated_at: string;
  share_token: string | null; // set → a public read-only link exists; null → not shared
  notes?: string | null; // owner's private free-text notes (never included in share links)
}

export interface ActionResult {
  ok?: boolean;
  error?: string;
  id?: string; // set by savePlan → the new row's id
}

export async function listPlans(): Promise<SavedPlan[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const r = await query<SavedPlan>(
    "select id, name, data, updated_at, share_token, notes from plans where user_id = $1 order by updated_at desc",
    [user.id],
  );
  return r.rows;
}

/** Create (or return the existing) public read-only share link for a scenario.
 *  The token is a capability: anyone with the link can view the scenario in a
 *  logged-out, preloaded dashboard. Owner-scoped; idempotent (reuses the token). */
export async function createShareLink(id: string): Promise<{ token?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const existing = await query<{ share_token: string | null }>(
    "select share_token from plans where id = $1 and user_id = $2",
    [id, user.id],
  );
  if (existing.rows.length === 0) return { error: "Scenario not found." };
  const current = existing.rows[0].share_token;
  if (current) return { token: current }; // already shared — keep the same link
  const token = randomBytes(24).toString("base64url"); // ~32 URL-safe chars, unguessable
  await query("update plans set share_token = $1 where id = $2 and user_id = $3", [token, id, user.id]);
  revalidatePath("/");
  return { token };
}

/** Revoke the share link — the public URL stops working immediately. */
export async function revokeShareLink(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  await query("update plans set share_token = null where id = $1 and user_id = $2", [id, user.id]);
  revalidatePath("/");
  return { ok: true };
}

// ── Active scenario (the named plan continuous auto-save targets) ─────────────
// Phase 1 of moving off the throwaway draft: these back the "one active named
// scenario per user" model. Inert until the auto-save rewire (Phase 2) uses them.

/** The user's ACTIVE scenario (the named plan auto-save writes to), or null when
 *  none is set yet (a brand-new or not-yet-migrated user). */
export async function getActivePlan(): Promise<SavedPlan | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const r = await query<SavedPlan>(
    `select p.id, p.name, p.data, p.updated_at, p.share_token, p.notes
       from users u join plans p on p.id = u.active_plan_id
      where u.id = $1`,
    [user.id],
  );
  return r.rows[0] ?? null;
}

/** Point the user's active scenario at one of their own plans (owner-scoped). */
export async function setActivePlan(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const r = await query(
    `update users set active_plan_id = p.id
       from plans p
      where users.id = $1 and p.id = $2 and p.user_id = $1`,
    [user.id, id],
  );
  if (!r.rowCount) return { error: "Scenario not found." };
  return { ok: true, id };
}

/** Create a new named scenario and make it the active one (auto-save target).
 *  Used for signup ("My first lease") and "New scenario" (a copy of the current). */
export async function createScenario(name: string, data: LeaseScenario): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const trimmed = name.trim() || "Untitled scenario";
  const r = await query<{ id: string }>(
    "insert into plans (user_id, name, data) values ($1, $2, $3) returning id",
    [user.id, trimmed, JSON.stringify(data)],
  );
  const id = r.rows[0]?.id;
  if (id) await query("update users set active_plan_id = $1 where id = $2", [id, user.id]);
  revalidatePath("/");
  return { ok: true, id };
}

/** Resolve the user's active scenario, migrating on first call (lazy, per-user):
 *   1. already have one → return it;
 *   2. else adopt their most-recent saved plan as active;
 *   3. else (brand-new, no work) → null; the active scenario is created when they
 *      first configure a plan or on signup.
 *  Returns the active plan, or null. Signed-out → null (guests use localStorage).
 *  (Legacy plan_drafts were promoted to named scenarios by the Phase-2 lazy path and
 *  the Phase-4 deploy backfill; the table is gone, so there's nothing to migrate here.) */
export async function ensureActiveScenario(): Promise<SavedPlan | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const active = await getActivePlan();
  if (active) return active;

  const plans = await listPlans();
  if (plans.length > 0) {
    await query("update users set active_plan_id = $1 where id = $2", [plans[0].id, user.id]);
    return getActivePlan();
  }
  return null;
}

/** Auto-save target for a signed-in user: their active scenario if they have one,
 *  otherwise create "My first lease" from the given data and make it active.
 *  Called on the first auto-save after a fresh signup (promotes the guest's work). */
export async function getOrCreateActiveScenario(data: LeaseScenario): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const active = await getActivePlan();
  if (active) return { ok: true, id: active.id };
  return createScenario("My first lease", data);
}

export async function savePlan(
  name: string,
  data: LeaseScenario,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in to save plans." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your plan a name." };

  const r = await query<{ id: string }>(
    "insert into plans (user_id, name, data) values ($1, $2, $3) returning id",
    [user.id, trimmed, JSON.stringify(data)],
  );
  revalidatePath("/");
  return { ok: true, id: r.rows[0]?.id };
}

/** Update an existing saved scenario in place (owner-scoped) — for "Save changes"
 *  when the active scenario is already a saved plan. */
export async function updatePlan(
  id: string,
  name: string,
  data: LeaseScenario,
  // Background auto-save passes false: it writes the SAME active scenario every ~1.5s
  // and doesn't need the page re-rendered. Revalidating on every autosave re-sends
  // fresh server props to PlannerApp, which busts its memos and RE-ARMS the autosave
  // — an infinite save→revalidate→save loop (a POST every couple of seconds). Explicit
  // saves (rename, save-as) still revalidate so the switcher/list picks up the change.
  revalidate = true,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in to save plans." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your plan a name." };
  const r = await query(
    "update plans set name = $1, data = $2, updated_at = now() where id = $3 and user_id = $4",
    [trimmed, JSON.stringify(data), id, user.id],
  );
  if (!r.rowCount) return { error: "Scenario not found." };
  if (revalidate) revalidatePath("/");
  return { ok: true, id };
}

/** Rename a scenario in place (owner-scoped). Doesn't touch `data` or `updated_at`
 *  — the name isn't plan content, so it mustn't shadow fresher local edits on load. */
export async function renameScenario(id: string, name: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your scenario a name." };
  const r = await query(
    "update plans set name = $1 where id = $2 and user_id = $3",
    [trimmed, id, user.id],
  );
  if (!r.rowCount) return { error: "Scenario not found." };
  revalidatePath("/");
  return { ok: true, id };
}

/** Save the owner's private free-text notes for a scenario. Owner-scoped; does NOT
 *  touch updated_at (notes aren't plan content, so they mustn't reorder scenarios or
 *  shadow fresher local edits) and does NOT revalidate (background save from the
 *  notes modal). Notes are never returned by the public share query. */
export async function updateScenarioNotes(id: string, notes: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const r = await query(
    "update plans set notes = $1 where id = $2 and user_id = $3",
    [notes, id, user.id],
  );
  if (!r.rowCount) return { error: "Scenario not found." };
  return { ok: true, id };
}

/** Delete a scenario (owner-scoped). If it was the active one, fall back to the
 *  most-recent remaining scenario (the FK's ON DELETE SET NULL already cleared the
 *  pointer). Returns `id` = the new active scenario, or undefined when none remain. */
export async function deletePlan(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const wasActive =
    (await query<{ active_plan_id: string | null }>(
      "select active_plan_id from users where id = $1",
      [user.id],
    )).rows[0]?.active_plan_id === id;
  await query("delete from plans where id = $1 and user_id = $2", [id, user.id]);
  let nextActive: string | undefined;
  if (wasActive) {
    const r = await query<{ id: string }>(
      "select id from plans where user_id = $1 order by updated_at desc limit 1",
      [user.id],
    );
    nextActive = r.rows[0]?.id;
    if (nextActive) await query("update users set active_plan_id = $1 where id = $2", [nextActive, user.id]);
  }
  revalidatePath("/");
  return { ok: true, id: nextActive };
}
