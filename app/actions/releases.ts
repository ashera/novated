"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export interface ReleaseInput {
  id?: string; // set → update; absent → insert
  version: string;
  build: number | null;
  commit_hash: string | null;
  released_at: string; // YYYY-MM-DD
  title: string | null;
  notes: string[]; // bullet strings
  published: boolean;
}

interface Result {
  ok?: boolean;
  error?: string;
  id?: string;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in required." as const };
  if (!user.is_admin) return { error: "Admin only." as const };
  return { user };
}

/** Create or update a release (admin only). */
export async function saveRelease(input: ReleaseInput): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };

  const version = input.version.trim();
  if (!version) return { error: "Version is required." };
  const released = input.released_at || new Date().toISOString().slice(0, 10);
  const notes = (input.notes ?? []).map((n) => n.trim()).filter(Boolean);
  const commit = input.commit_hash?.trim() || null;
  const title = input.title?.trim() || null;

  if (input.id) {
    const r = await query(
      `update releases set version=$1, build=$2, commit_hash=$3, released_at=$4, title=$5, notes=$6, published=$7, updated_at=now()
       where id=$8`,
      [version, input.build, commit, released, title, JSON.stringify(notes), input.published, input.id],
    );
    if (!r.rowCount) return { error: "Release not found." };
    revalidatePath("/releases");
    revalidatePath("/admin/releases");
    return { ok: true, id: input.id };
  }

  const r = await query<{ id: string }>(
    `insert into releases (version, build, commit_hash, released_at, title, notes, published)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [version, input.build, commit, released, title, JSON.stringify(notes), input.published],
  );
  revalidatePath("/releases");
  revalidatePath("/admin/releases");
  return { ok: true, id: r.rows[0]?.id };
}

export async function deleteRelease(id: string): Promise<Result> {
  const gate = await requireAdmin();
  if ("error" in gate) return { error: gate.error };
  await query("delete from releases where id=$1", [id]);
  revalidatePath("/releases");
  revalidatePath("/admin/releases");
  return { ok: true };
}
