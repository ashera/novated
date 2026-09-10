"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { getAdmin } from "@/lib/auth";
import {
  getVersion,
  nextFinancialYear,
  type ParamMeta,
} from "@/lib/refdata";
import { PARAM_DESCRIPTORS, getByPath, setByPath } from "@/lib/au/params";
import type { EngineConfig } from "@/lib/au/config";

export interface AdminResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

const DESCRIPTOR_BY_KEY = new Map(PARAM_DESCRIPTORS.map((d) => [d.key, d]));

/** Fetch one saved plan's data by id (admin only) — lets an admin load any user's
 *  scenario into their own dashboard for support/inspection. */
export async function adminGetPlanData(
  planId: string,
): Promise<{ ok?: boolean; name?: string; data?: unknown; error?: string }> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const r = await query<{ name: string; data: unknown }>(
    "select name, data from plans where id = $1",
    [planId],
  );
  const row = r.rows[0];
  if (!row) return { error: "Plan not found." };
  return { ok: true, name: row.name, data: row.data };
}

/** Get (or mint) a read-only share token for any user's saved scenario (admin only)
 *  — so support can hand the scenario to Claude via GET /api/s/<token>. Idempotent:
 *  reuses an existing token. The token is a revocable capability (owner or admin can
 *  clear it); it exposes nothing the /s/<token> page doesn't. */
export async function adminShareLink(planId: string): Promise<{ ok?: boolean; token?: string; error?: string }> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const existing = await query<{ share_token: string | null }>(
    "select share_token from plans where id = $1",
    [planId],
  );
  if (!existing.rows[0]) return { error: "Plan not found." };
  const current = existing.rows[0].share_token;
  if (current) return { ok: true, token: current };
  const token = randomBytes(24).toString("base64url");
  await query("update plans set share_token = $1 where id = $2", [token, planId]);
  return { ok: true, token };
}

/** Delete any user's saved scenario by id (admin only). */
export async function adminDeletePlan(planId: string): Promise<AdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const r = await query("delete from plans where id = $1", [planId]);
  if (!r.rowCount) return { error: "Plan not found." };
  revalidatePath("/admin/users"); // refresh the user list's plan counts
  return { ok: true };
}

function revalidate() {
  revalidatePath("/admin");
  revalidatePath("/admin/review");
  revalidatePath("/"); // active config feeds the calculator (+ admin review badge)
}

/** Edit a single parameter value on a version, recording an audit entry. */
export async function updateParam(
  versionId: string,
  paramKey: string,
  newValue: number,
): Promise<AdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (!Number.isFinite(newValue)) return { error: "Value must be a number." };

  const descriptor = DESCRIPTOR_BY_KEY.get(paramKey);
  if (!descriptor) return { error: "Unknown parameter." };

  const version = await getVersion(versionId);
  if (!version) return { error: "Version not found." };

  const oldValue = getByPath(version.data, descriptor.path);
  if (oldValue === newValue) return { ok: true };

  const nextData = setByPath<EngineConfig>(version.data, descriptor.path, newValue);
  await query("update ref_data_versions set data = $1, updated_at = now() where id = $2", [
    JSON.stringify(nextData),
    versionId,
  ]);
  await query(
    `insert into ref_data_audit (version_id, financial_year, param_key, action, old_value, new_value, changed_by, changed_by_email)
     values ($1,$2,$3,'edit',$4,$5,$6,$7)`,
    [
      versionId,
      version.financial_year,
      paramKey,
      String(oldValue),
      String(newValue),
      admin.id,
      admin.email,
    ],
  );
  revalidate();
  return { ok: true };
}

/** Mark a parameter as verified now, by the current admin. */
export async function verifyParam(
  versionId: string,
  paramKey: string,
  note?: string,
): Promise<AdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const version = await getVersion(versionId);
  if (!version) return { error: "Version not found." };

  const meta = { ...version.meta };
  const existing: ParamMeta = meta[paramKey] ?? {
    source: "",
    lastVerifiedAt: null,
    verifiedBy: null,
    note: "",
    needsVerification: false,
  };
  const nowIso = new Date().toISOString();
  meta[paramKey] = {
    ...existing,
    lastVerifiedAt: nowIso,
    verifiedBy: admin.email,
    needsVerification: false,
    note: note?.trim() || existing.note,
  };

  await query("update ref_data_versions set meta = $1, updated_at = now() where id = $2", [
    JSON.stringify(meta),
    versionId,
  ]);
  await query(
    `insert into ref_data_audit (version_id, financial_year, param_key, action, note, changed_by, changed_by_email)
     values ($1,$2,$3,'verify',$4,$5,$6)`,
    [versionId, version.financial_year, paramKey, note?.trim() || null, admin.id, admin.email],
  );
  revalidate();
  return { ok: true };
}

/** Clone the active version into a new draft for the next financial year. */
export async function createNextVersion(): Promise<AdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const active = await query<{
    financial_year: string;
    data: EngineConfig;
    meta: Record<string, ParamMeta>;
  }>("select financial_year, data, meta from ref_data_versions where is_active limit 1");
  const base = active.rows[0];
  if (!base) return { error: "No active version to clone." };

  const fy = nextFinancialYear(base.financial_year);
  const exists = await query("select 1 from ref_data_versions where financial_year = $1", [fy]);
  if (exists.rows.length) return { error: `FY${fy} already exists.` };

  // Carry values forward, but reset verification so every figure is re-checked.
  const meta: Record<string, ParamMeta> = {};
  for (const [key, m] of Object.entries(base.meta)) {
    meta[key] = { ...m, lastVerifiedAt: null, verifiedBy: null, needsVerification: true };
  }
  const data = { ...base.data, financialYear: fy };

  const inserted = await query<{ id: string }>(
    `insert into ref_data_versions (financial_year, data, meta, is_active, status, notes, created_by)
     values ($1,$2,$3,false,'draft',$4,$5) returning id`,
    [fy, JSON.stringify(data), JSON.stringify(meta), `Cloned from FY${base.financial_year}.`, admin.id],
  );
  await query(
    `insert into ref_data_audit (version_id, financial_year, action, note, changed_by, changed_by_email)
     values ($1,$2,'create',$3,$4,$5)`,
    [inserted.rows[0].id, fy, `Cloned from FY${base.financial_year}`, admin.id, admin.email],
  );
  revalidate();
  return { ok: true, id: inserted.rows[0].id };
}

/** Make a version the single active one the engine uses. */
export async function activateVersion(versionId: string): Promise<AdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const version = await getVersion(versionId);
  if (!version) return { error: "Version not found." };
  if (version.is_active) return { ok: true };

  await withTransaction(async (q) => {
    await q("update ref_data_versions set is_active = false, status = 'archived' where is_active");
    await q(
      "update ref_data_versions set is_active = true, status = 'active', updated_at = now() where id = $1",
      [versionId],
    );
    await q(
      `insert into ref_data_audit (version_id, financial_year, action, note, changed_by, changed_by_email)
       values ($1,$2,'activate','Set as active version',$3,$4)`,
      [versionId, version.financial_year, admin.id, admin.email],
    );
  });
  revalidate();
  return { ok: true };
}
