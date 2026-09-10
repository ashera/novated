import { SITE_URL, SITE_NAME } from "./site";

// Pure builder for the "new feedback" admin notification — no DB or mailer, so
// it's easy to unit-test. Kept out of the "use server" action module (which may
// only export async functions).
const SENTIMENT_LABELS: Record<string, string> = {
  love: "😍 Love it",
  ok: "🙂 It's OK",
  frustrated: "😕 Frustrating",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function feedbackNotificationEmail(f: {
  message: string;
  from: string; // account email, guest reply-to, or "Anonymous"
  sentiment: string | null;
  path: string | null;
}) {
  const mood = f.sentiment ? SENTIMENT_LABELS[f.sentiment] ?? "" : "";
  const subject = `💬 New ${SITE_NAME} feedback${mood ? ` (${mood})` : ""}`;
  const link = `${SITE_URL}/admin/feedback`;
  const rows = [
    ["From", f.from],
    mood ? ["Mood", mood] : null,
    f.path ? ["Page", f.path] : null,
  ].filter(Boolean) as [string, string][];

  const text = [
    `New feedback on ${SITE_NAME}:`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    f.message,
    "",
    `View all: ${link}`,
  ].join("\n");

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
  <p style="color:#6b7280;font-size:13px;margin:0 0 12px">New feedback on ${SITE_NAME}</p>
  <table style="font-size:14px;color:#111;border-collapse:collapse;margin-bottom:12px">
    ${rows.map(([k, v]) => `<tr><td style="color:#6b7280;padding:2px 12px 2px 0">${k}</td><td>${escapeHtml(v)}</td></tr>`).join("")}
  </table>
  <blockquote style="margin:0;padding:12px 16px;background:#f3f4f6;border-left:3px solid #10b981;border-radius:6px;white-space:pre-wrap;font-size:15px;color:#111">${escapeHtml(f.message)}</blockquote>
  <p style="margin:16px 0 0"><a href="${link}" style="color:#10b981">View all feedback →</a></p>
</div>`;

  return { subject, text, html };
}

export interface FeedbackItem {
  message: string;
  from: string;
  sentiment: string | null;
  path: string | null;
}

/** Digest of several feedback notes collected in one batch window. */
export function feedbackDigestEmail(items: FeedbackItem[]) {
  const n = items.length;
  const subject = `💬 ${n} new ${SITE_NAME} feedback notes`;
  const link = `${SITE_URL}/admin/feedback`;

  const meta = (f: FeedbackItem) =>
    [f.sentiment ? SENTIMENT_LABELS[f.sentiment] ?? "" : "", f.from, f.path]
      .filter(Boolean)
      .join(" · ");

  const text = [
    `${n} new feedback notes on ${SITE_NAME}:`,
    "",
    ...items.map((f, i) => `${i + 1}. ${meta(f)}\n${f.message}\n`),
    `View all: ${link}`,
  ].join("\n");

  const card = (f: FeedbackItem) => `
  <div style="margin:0 0 12px;padding:12px 16px;background:#f3f4f6;border-left:3px solid #10b981;border-radius:6px">
    <div style="color:#6b7280;font-size:12px;margin-bottom:6px">${escapeHtml(meta(f))}</div>
    <div style="white-space:pre-wrap;font-size:15px;color:#111">${escapeHtml(f.message)}</div>
  </div>`;

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
  <p style="color:#6b7280;font-size:13px;margin:0 0 12px">${n} new feedback notes on ${SITE_NAME}</p>
  ${items.map(card).join("")}
  <p style="margin:16px 0 0"><a href="${link}" style="color:#10b981">View all feedback →</a></p>
</div>`;

  return { subject, text, html };
}
