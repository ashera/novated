"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser, getAdmin } from "@/lib/auth";
import { scheduleFeedbackFlush } from "@/lib/feedbackNotifier";

export interface FeedbackResult {
  ok?: boolean;
  error?: string;
}

const SENTIMENTS = ["love", "ok", "frustrated"];

/** Public: store a piece of feedback. Attaches the signed-in user if there is
 *  one; otherwise it's anonymous with an optional reply-to email. */
export async function submitFeedback(input: {
  message: string;
  email?: string;
  sentiment?: string;
  path?: string;
}): Promise<FeedbackResult> {
  const message = (input.message || "").trim();
  if (message.length < 2) return { error: "Please add a little more detail." };
  if (message.length > 4000) return { error: "Please keep it under 4000 characters." };

  const email = (input.email || "").trim().slice(0, 200) || null;
  const sentiment = SENTIMENTS.includes(input.sentiment || "") ? input.sentiment : null;
  const path = (input.path || "").slice(0, 300) || null;

  const user = await getCurrentUser();
  const ua = ((await headers()).get("user-agent") || "").slice(0, 400) || null;

  await query(
    `insert into feedback (user_id, email, sentiment, message, path, user_agent)
     values ($1, $2, $3, $4, $5, $6)`,
    [user?.id ?? null, email, sentiment, message.slice(0, 4000), path, ua],
  );

  // Notify the team, batched: arm the debounced digest (opt-in via
  // FEEDBACK_NOTIFY_TO / ADMIN_EMAIL). Never blocks or fails the submission.
  scheduleFeedbackFlush();

  revalidatePath("/admin/feedback");
  return { ok: true };
}

/** Admin: mark a piece of feedback triaged (or un-triage it). */
export async function setFeedbackHandled(id: string, handled: boolean): Promise<FeedbackResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query("update feedback set handled = $1 where id = $2", [handled, id]);
  revalidatePath("/admin/feedback");
  return { ok: true };
}

/** Admin: permanently delete a piece of feedback. */
export async function deleteFeedback(id: string): Promise<FeedbackResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  await query("delete from feedback where id = $1", [id]);
  revalidatePath("/admin/feedback");
  return { ok: true };
}
