import "server-only";
import { query } from "./db";
import { sendEmail } from "./email";
import { feedbackNotificationEmail, feedbackDigestEmail, type FeedbackItem } from "./feedbackEmail";

// Debounced batch notifier: after feedback arrives we wait a "quiet" window and
// send one email covering everything still un-notified — so a burst collapses
// into a single digest instead of flooding the inbox. Capped by a max wait so
// the first note in a long trickle still goes out promptly. Windows are
// overridable via env (handy for tests).
const QUIET_MS = Number(process.env.FEEDBACK_DIGEST_QUIET_MS) || 3 * 60 * 1000;
const MAX_MS = Number(process.env.FEEDBACK_DIGEST_MAX_MS) || 15 * 60 * 1000;

// Survive HMR reloads in dev so we don't leak timers.
const g = globalThis as unknown as {
  __fbNotify?: { timer: ReturnType<typeof setTimeout> | null; firstAt: number | null; flushing: boolean };
};
const state = (g.__fbNotify ??= { timer: null, firstAt: null, flushing: false });

function recipient(): string | null {
  return process.env.FEEDBACK_NOTIFY_TO || process.env.ADMIN_EMAIL || null;
}

/** Arm (or re-arm) the debounce timer. Called after each stored feedback. */
export function scheduleFeedbackFlush(): void {
  if (!recipient()) return; // notifications off — nothing to schedule
  const now = Date.now();
  if (state.firstAt == null) state.firstAt = now;
  // Wait QUIET_MS after the latest note, but never past firstAt + MAX_MS.
  const delay = Math.max(0, Math.min(now + QUIET_MS, state.firstAt + MAX_MS) - now);
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => void runFlush(), delay);
  // Don't keep the process alive just for this timer.
  (state.timer as { unref?: () => void }).unref?.();
}

async function runFlush(): Promise<void> {
  if (state.flushing) return;
  state.flushing = true;
  state.timer = null;
  state.firstAt = null;
  try {
    await flushFeedbackNotifications();
  } catch (err) {
    console.error("[feedback] digest flush failed", err);
  } finally {
    state.flushing = false;
  }
}

/** Send a digest of all un-notified feedback and mark it notified. Exposed for
 *  tests / manual flush; safe to call anytime (no-op when nothing is pending). */
export async function flushFeedbackNotifications(): Promise<number> {
  const to = recipient();
  if (!to) return 0;

  const { rows } = await query<{
    id: string;
    user_email: string | null;
    email: string | null;
    sentiment: string | null;
    message: string;
    path: string | null;
  }>(
    `select f.id, u.email as user_email, f.email, f.sentiment, f.message, f.path
       from feedback f
       left join users u on u.id = f.user_id
      where f.notified_at is null
      order by f.created_at asc`,
  );
  if (!rows.length) return 0;

  const items: FeedbackItem[] = rows.map((r) => ({
    message: r.message,
    from: r.user_email ? `${r.user_email} (account)` : r.email ? `${r.email} (guest)` : "Anonymous",
    sentiment: r.sentiment,
    path: r.path,
  }));

  const single = items.length === 1;
  const mail = single ? feedbackNotificationEmail(items[0]) : feedbackDigestEmail(items);
  // Only set reply-to for a single note (a digest has many possible senders).
  const replyTo = single ? rows[0].user_email || rows[0].email || undefined : undefined;

  const res = await sendEmail({ to, replyTo, ...mail });
  if (res.ok) {
    await query("update feedback set notified_at = now() where id = any($1::uuid[])", [rows.map((r) => r.id)]);
  }
  return rows.length;
}
