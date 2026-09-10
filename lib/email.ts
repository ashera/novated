import "server-only";

// Transactional email via Resend's REST API (no SDK dependency). Falls back to
// logging when RESEND_API_KEY isn't set, so flows are testable in dev / before
// the provider is configured. Never throws — callers shouldn't fail on email.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "LeaseWiz <no-reply@leasewiz.com.au>";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string; // where a "Reply" should go (e.g. the user who left feedback)
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean }> {
  if (!RESEND_API_KEY) {
    // Dev / unconfigured: surface the content (e.g. the reset link) in the logs.
    console.log(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text ?? msg.html}`);
    return { ok: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend responded", res.status, await res.text().catch(() => ""));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] send failed", err);
    return { ok: false };
  }
}
