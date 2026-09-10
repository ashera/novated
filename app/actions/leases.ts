"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { migrateLease, type Lease } from "@/lib/au/lease";

export interface SavedLease {
  id: string;
  name: string;
  lease: Lease;
  updated_at: string;
  share_token: string | null;
}

export interface LeaseResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

/** A user shopping for a car might reasonably compare a handful; far more than
 *  that is someone filling a database rather than choosing a car. */
const MAX_PER_USER = 20;

interface LeaseRow {
  id: string;
  name: string;
  vehicle: unknown;
  scenario: unknown;
  notes: string | null;
  updated_at: string;
  share_token: string | null;
}

/** Reassemble a lease and its quotes from the two tables. */
async function hydrate(rows: LeaseRow[]): Promise<SavedLease[]> {
  if (rows.length === 0) return [];
  const q = await query<{ lease_id: string; data: unknown }>(
    "select lease_id, data from lease_quotes where lease_id = any($1::uuid[]) order by created_at",
    [rows.map((r) => r.id)],
  );
  const byLease = new Map<string, unknown[]>();
  for (const row of q.rows) {
    const list = byLease.get(row.lease_id) ?? [];
    list.push(row.data);
    byLease.set(row.lease_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    updated_at: r.updated_at,
    share_token: r.share_token,
    lease: migrateLease({
      version: 1,
      name: r.name,
      vehicle: r.vehicle,
      scenario: r.scenario,
      notes: r.notes,
      quotes: byLease.get(r.id) ?? [],
    }),
  }));
}

const SELECT = "id, name, vehicle, scenario, notes, updated_at, share_token";

export async function listLeases(): Promise<SavedLease[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const r = await query<LeaseRow>(
    `select ${SELECT} from leases where user_id = $1 order by updated_at desc`,
    [user.id],
  );
  return hydrate(r.rows);
}

/** The lease both tools are currently working on. */
export async function getActiveLease(): Promise<SavedLease | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const r = await query<LeaseRow>(
    `select ${SELECT.split(", ").map((c) => `l.${c}`).join(", ")}
       from users u join leases l on l.id = u.active_lease_id
      where u.id = $1`,
    [user.id],
  );
  const [hydrated] = await hydrate(r.rows);
  if (hydrated) return hydrated;
  // Fall back to the most recent, so a deleted active lease doesn't strand them.
  const recent = await query<LeaseRow>(
    `select ${SELECT} from leases where user_id = $1 order by updated_at desc limit 1`,
    [user.id],
  );
  const [fallback] = await hydrate(recent.rows);
  if (fallback) await setActiveLease(fallback.id);
  return fallback ?? null;
}

export async function setActiveLease(id: string): Promise<LeaseResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const r = await query(
    `update users set active_lease_id = l.id from leases l
      where users.id = $1 and l.id = $2 and l.user_id = $1`,
    [user.id, id],
  );
  if (!r.rowCount) return { error: "Lease not found." };
  return { ok: true, id };
}

/**
 * Write a lease and its quotes together.
 *
 * In one transaction, and the quotes are replaced wholesale rather than
 * diffed: a lease carries a handful of them, and "delete then insert" cannot
 * leave a half-updated set behind the way a partial diff can.
 */
export async function saveLease(id: string | null, lease: Lease): Promise<LeaseResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in to save." };
  const name = lease.name.trim().slice(0, 120) || "My lease";

  if (!id) {
    const count = await query<{ n: number }>(
      "select count(*)::int as n from leases where user_id = $1",
      [user.id],
    );
    if ((count.rows[0]?.n ?? 0) >= MAX_PER_USER) {
      return { error: `You can keep up to ${MAX_PER_USER} leases. Delete one to add another.` };
    }
  }

  const newId = await withTransaction(async (q) => {
    let leaseId = id;
    if (leaseId) {
      const r = (await q(
        `update leases set name=$1, vehicle=$2, scenario=$3, notes=$4, updated_at=now()
          where id=$5 and user_id=$6 returning id`,
        [name, JSON.stringify(lease.vehicle), JSON.stringify(lease.scenario), lease.notes ?? null, leaseId, user.id],
      )) as { rows: { id: string }[] };
      if (!r.rows.length) throw new Error("Lease not found.");
    } else {
      const r = (await q(
        `insert into leases (user_id, name, vehicle, scenario, notes)
         values ($1,$2,$3,$4,$5) returning id`,
        [user.id, name, JSON.stringify(lease.vehicle), JSON.stringify(lease.scenario), lease.notes ?? null],
      )) as { rows: { id: string }[] };
      leaseId = r.rows[0].id;
    }

    await q("delete from lease_quotes where lease_id = $1", [leaseId]);
    for (const spec of lease.quotes) {
      await q("insert into lease_quotes (lease_id, label, data) values ($1,$2,$3)", [
        leaseId,
        spec.label,
        JSON.stringify(spec),
      ]);
    }
    return leaseId!;
  });

  await query("update users set active_lease_id = $1 where id = $2", [newId, user.id]);
  revalidatePath("/");
  revalidatePath("/decode");
  revalidatePath("/compare");
  return { ok: true, id: newId };
}

export async function deleteLease(id: string): Promise<LeaseResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  await query("delete from leases where id = $1 and user_id = $2", [id, user.id]);
  revalidatePath("/");
  revalidatePath("/compare");
  return { ok: true };
}

/** Move a guest's browser-held leases onto their new account, once. */
export async function adoptLocalLeases(leases: Lease[]): Promise<{ adopted: number }> {
  const user = await getCurrentUser();
  if (!user) return { adopted: 0 };
  if (!Array.isArray(leases) || leases.length === 0) return { adopted: 0 };

  const count = await query<{ n: number }>(
    "select count(*)::int as n from leases where user_id = $1",
    [user.id],
  );
  const room = MAX_PER_USER - (count.rows[0]?.n ?? 0);
  if (room <= 0) return { adopted: 0 };

  let adopted = 0;
  for (const raw of leases.slice(0, room)) {
    const res = await saveLease(null, migrateLease(raw));
    if (res.ok) adopted++;
  }
  return { adopted };
}

/** Public read-only share link for a lease. Idempotent. */
export async function createLeaseShareLink(id: string): Promise<{ token?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const existing = await query<{ share_token: string | null }>(
    "select share_token from leases where id = $1 and user_id = $2",
    [id, user.id],
  );
  if (!existing.rows.length) return { error: "Lease not found." };
  const current = existing.rows[0].share_token;
  if (current) return { token: current };
  const token = randomBytes(24).toString("base64url");
  await query("update leases set share_token = $1 where id = $2 and user_id = $3", [token, id, user.id]);
  return { token };
}

/** Revoke the share link — the public URL stops working immediately. */
export async function revokeLeaseShareLink(id: string): Promise<LeaseResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  await query("update leases set share_token = null where id = $1 and user_id = $2", [id, user.id]);
  return { ok: true };
}
