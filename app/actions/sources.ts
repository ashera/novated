"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";
import { getSource } from "@/lib/refdata";

export interface SourceForm {
  name: string;
  organisation: string;
  url: string;
  update_frequency: string;
  review_interval_days: number | null;
  description: string;
  notes: string;
}

export interface SourceActionResult {
  ok?: boolean;
  error?: string;
}

function revalidate() {
  revalidatePath("/admin/sources");
  revalidatePath("/admin"); // param table shows the source name/link
  revalidatePath("/admin/review"); // digest shows stale sources
  revalidatePath("/"); // admin review badge
}

/** Edit a source's attributes, recording an audit entry. */
export async function updateSource(
  key: string,
  form: SourceForm,
): Promise<SourceActionResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (!form.name.trim()) return { error: "Source needs a name." };

  const existing = await getSource(key);
  if (!existing) return { error: "Source not found." };

  const interval =
    form.review_interval_days == null ||
    !Number.isFinite(form.review_interval_days)
      ? null
      : Math.max(0, Math.round(form.review_interval_days));

  await query(
    `update sources
        set name = $1, organisation = $2, url = $3, update_frequency = $4,
            review_interval_days = $5, description = $6, notes = $7, updated_at = now()
      where key = $8`,
    [
      form.name.trim(),
      form.organisation.trim() || null,
      form.url.trim() || null,
      form.update_frequency.trim() || null,
      interval,
      form.description.trim() || null,
      form.notes.trim() || null,
      key,
    ],
  );
  await query(
    `insert into ref_data_audit (source_key, action, note, changed_by, changed_by_email)
     values ($1, 'source_edit', 'Edited source attributes', $2, $3)`,
    [key, admin.id, admin.email],
  );
  revalidate();
  return { ok: true };
}

/** Stamp "last updated from source" as today (we've refreshed our data from it). */
export async function markSourceUpdated(
  key: string,
): Promise<SourceActionResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const existing = await getSource(key);
  if (!existing) return { error: "Source not found." };

  await query(
    "update sources set last_updated_from = current_date, updated_at = now() where key = $1",
    [key],
  );
  await query(
    `insert into ref_data_audit (source_key, action, note, changed_by, changed_by_email)
     values ($1, 'source_update', 'Marked data refreshed from source', $2, $3)`,
    [key, admin.id, admin.email],
  );
  revalidate();
  return { ok: true };
}
