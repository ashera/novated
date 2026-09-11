"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser, getAdmin } from "@/lib/auth";
import {
  providerSlug,
  validateProviderName,
  type Provider,
  type ProviderStatus,
} from "@/lib/au/providers";

/**
 * The provider directory.
 *
 * One public write — suggesting a provider — and the moderation around it.
 * The public path is deliberately narrow: a name and nothing else, landing as
 * "pending", never shown to anyone but the person who typed it until an admin
 * approves it. That is what stops an open write becoming a way to put text in
 * front of other users.
 */

export interface ProviderRow extends Provider {
  notes: string | null;
  suggested_count: number;
  created_at: string;
  updated_at: string;
  suggested_by: string | null;
}

export interface ProviderResult {
  ok?: boolean;
  error?: string;
  provider?: Provider;
}

/** A ceiling on the unmoderated queue. Not rate limiting — just a stop on the
 *  table growing without bound if someone decides to be tedious. */
const MAX_PENDING = 500;

/** Public: what the picker offers. Approved only. */
export async function listApprovedProviders(): Promise<Provider[]> {
  try {
    const r = await query<Provider>(
      "select id, name, slug, status, website from providers where status = 'approved' order by name",
    );
    return r.rows;
  } catch {
    // The picker degrades to a plain text box rather than breaking the page.
    return [];
  }
}

/**
 * Public: suggest a provider we don't list.
 *
 * Returns the existing row when the name is already known under any status,
 * so a resubmission is never a duplicate and a rejected name cannot be
 * resurrected by typing it again.
 */
export async function suggestProvider(rawName: string): Promise<ProviderResult> {
  const checked = validateProviderName(rawName);
  if (!checked.ok) return { error: checked.error };

  const existing = await query<Provider>(
    "select id, name, slug, status, website from providers where slug = $1",
    [checked.slug],
  );
  if (existing.rows[0]) {
    await query(
      "update providers set suggested_count = suggested_count + 1, updated_at = now() where id = $1",
      [existing.rows[0].id],
    );
    return { ok: true, provider: existing.rows[0] };
  }

  const pending = await query<{ n: number }>(
    "select count(*)::int as n from providers where status = 'pending'",
  );
  if ((pending.rows[0]?.n ?? 0) >= MAX_PENDING) {
    return { error: "We can't take new providers right now. Your quote still works — carry on." };
  }

  const user = await getCurrentUser();
  const r = await query<Provider>(
    `insert into providers (name, slug, status, created_by)
     values ($1, $2, 'pending', $3)
     returning id, name, slug, status, website`,
    [checked.name, checked.slug, user?.id ?? null],
  );
  revalidatePath("/admin/providers");
  return { ok: true, provider: r.rows[0] };
}

// ── Moderation ──────────────────────────────────────────────────────────────

/** Admin: the whole directory, including what is waiting and what was turned
 *  down. */
export async function listProviders(): Promise<ProviderRow[]> {
  const admin = await getAdmin();
  if (!admin) return [];
  const r = await query<ProviderRow>(
    `select p.id, p.name, p.slug, p.status, p.website, p.notes,
            p.suggested_count, p.created_at, p.updated_at,
            u.email as suggested_by
       from providers p
       left join users u on u.id = p.created_by
      order by
        case p.status when 'pending' then 0 when 'approved' then 1 else 2 end,
        p.suggested_count desc, p.name`,
  );
  return r.rows;
}

const STATUSES: ProviderStatus[] = ["approved", "pending", "rejected"];

export async function setProviderStatus(
  id: string,
  status: ProviderStatus,
): Promise<ProviderResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (!STATUSES.includes(status)) return { error: "Unknown status." };
  const r = await query("update providers set status = $1, updated_at = now() where id = $2", [
    status,
    id,
  ]);
  if (!r.rowCount) return { error: "Unknown provider." };
  revalidatePath("/admin/providers");
  return { ok: true };
}

/** Admin: fix a name, its website or the internal note. Renaming re-keys the
 *  slug, which is how a misspelling stops being its own company. */
export async function updateProvider(
  id: string,
  input: { name: string; website?: string; notes?: string },
): Promise<ProviderResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };

  const checked = validateProviderName(input.name);
  if (!checked.ok) return { error: checked.error };

  const clash = await query<{ id: string; name: string }>(
    "select id, name from providers where slug = $1 and id <> $2",
    [checked.slug, id],
  );
  if (clash.rows[0]) {
    return { error: `That's the same as "${clash.rows[0].name}". Reject this one instead.` };
  }

  const website = (input.website ?? "").trim().slice(0, 300) || null;
  if (website && !/^https?:\/\/\S+$/.test(website)) {
    return { error: "A website needs to start with http:// or https://" };
  }

  const r = await query(
    `update providers set name = $1, slug = $2, website = $3, notes = $4, updated_at = now()
      where id = $5`,
    [checked.name, checked.slug, website, (input.notes ?? "").trim().slice(0, 500) || null, id],
  );
  if (!r.rowCount) return { error: "Unknown provider." };
  revalidatePath("/admin/providers");
  return { ok: true };
}

/**
 * Admin: fold a duplicate into the provider it should have been.
 *
 * Quote labels are free text, not a foreign key, so nothing needs repointing
 * — this is about the directory only. The duplicate's suggestion count moves
 * across so the survivor reflects how often the company has really been
 * named, and the duplicate is deleted rather than rejected: a rejected row
 * would keep its slug and block the real name from ever being re-keyed to it.
 */
export async function mergeProvider(fromId: string, intoId: string): Promise<ProviderResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (fromId === intoId) return { error: "That's the same provider." };

  const rows = await query<{ id: string; suggested_count: number }>(
    "select id, suggested_count from providers where id = any($1::uuid[])",
    [[fromId, intoId]],
  );
  if (rows.rowCount !== 2) return { error: "One of those no longer exists." };
  const from = rows.rows.find((r) => r.id === fromId)!;

  await query(
    "update providers set suggested_count = suggested_count + $1, updated_at = now() where id = $2",
    [from.suggested_count, intoId],
  );
  await query("delete from providers where id = $1", [fromId]);
  revalidatePath("/admin/providers");
  return { ok: true };
}

export async function deleteProvider(id: string): Promise<ProviderResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query("delete from providers where id = $1", [id]);
  revalidatePath("/admin/providers");
  return { ok: true };
}

/** Admin: add one directly, already approved. */
export async function addProvider(name: string): Promise<ProviderResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const checked = validateProviderName(name);
  if (!checked.ok) return { error: checked.error };

  const clash = await query<{ name: string }>("select name from providers where slug = $1", [
    checked.slug,
  ]);
  if (clash.rows[0]) return { error: `"${clash.rows[0].name}" is already in the directory.` };

  await query(
    `insert into providers (name, slug, status, suggested_count) values ($1, $2, 'approved', 0)`,
    [checked.name, providerSlug(checked.name)],
  );
  revalidatePath("/admin/providers");
  return { ok: true };
}
