"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Quote } from "@/lib/au/quote";

export interface SavedQuote {
  id: string;
  label: string;
  data: Quote;
  updated_at: string;
}

export interface QuoteResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

/** A user is unlikely to hold more than a handful of quotes, and an unbounded
 *  list is a way to fill someone else's database. */
const MAX_PER_USER = 25;

export async function listQuotes(): Promise<SavedQuote[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const r = await query<SavedQuote>(
    "select id, label, data, updated_at from quotes where user_id = $1 order by updated_at desc",
    [user.id],
  );
  return r.rows;
}

export async function saveQuote(label: string, data: Quote): Promise<QuoteResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in to keep a quote." };
  const trimmed = label.trim().slice(0, 120) || "Untitled quote";

  const count = await query<{ n: number }>(
    "select count(*)::int as n from quotes where user_id = $1",
    [user.id],
  );
  if ((count.rows[0]?.n ?? 0) >= MAX_PER_USER) {
    return { error: `You can keep up to ${MAX_PER_USER} quotes. Delete one to add another.` };
  }

  const r = await query<{ id: string }>(
    "insert into quotes (user_id, label, data) values ($1, $2, $3) returning id",
    [user.id, trimmed, JSON.stringify(data)],
  );
  revalidatePath("/compare");
  return { ok: true, id: r.rows[0]?.id };
}

export async function updateQuote(id: string, label: string, data: Quote): Promise<QuoteResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  const trimmed = label.trim().slice(0, 120) || "Untitled quote";
  const r = await query(
    "update quotes set label = $1, data = $2, updated_at = now() where id = $3 and user_id = $4",
    [trimmed, JSON.stringify(data), id, user.id],
  );
  if (!r.rowCount) return { error: "Quote not found." };
  revalidatePath("/compare");
  return { ok: true, id };
}

export async function deleteQuote(id: string): Promise<QuoteResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };
  await query("delete from quotes where id = $1 and user_id = $2", [id, user.id]);
  revalidatePath("/compare");
  return { ok: true };
}

/**
 * Move quotes a guest kept in their browser into their new account, once. Called
 * from the client after sign-in when local storage still holds some.
 *
 * Deliberately additive and capped: it never deletes what is already on the
 * account, and it stops at the per-user limit rather than failing the lot.
 * Returns how many landed, so the client only clears local storage on success.
 */
export async function adoptLocalQuotes(quotes: { label: string; data: Quote }[]): Promise<{
  adopted: number;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { adopted: 0, error: "You need to be signed in." };
  if (!Array.isArray(quotes) || quotes.length === 0) return { adopted: 0 };

  const count = await query<{ n: number }>(
    "select count(*)::int as n from quotes where user_id = $1",
    [user.id],
  );
  let room = MAX_PER_USER - (count.rows[0]?.n ?? 0);
  if (room <= 0) return { adopted: 0 };

  let adopted = 0;
  for (const q of quotes.slice(0, room)) {
    if (!q?.data || typeof q.data !== "object") continue;
    await query("insert into quotes (user_id, label, data) values ($1, $2, $3)", [
      user.id,
      (q.label ?? "").trim().slice(0, 120) || "Untitled quote",
      JSON.stringify(q.data),
    ]);
    adopted++;
  }
  revalidatePath("/compare");
  return { adopted };
}
