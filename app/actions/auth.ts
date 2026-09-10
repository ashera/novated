"use server";

import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  verifyPassword,
  issueResetToken,
  hashResetToken,
} from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { SITE_URL, SITE_NAME } from "@/lib/site";

export interface AuthState {
  error?: string;
  sent?: boolean; // password-reset email dispatched
}

function normalizeEmail(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim().toLowerCase();
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password are required." };
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const existing = await query("select id from users where email = $1", [email]);
  if (existing.rows.length) return { error: "That email is already registered." };

  const hash = await hashPassword(password);
  const inserted = await query<{ id: string }>(
    "insert into users (email, password_hash) values ($1, $2) returning id",
    [email, hash],
  );
  await createSession(inserted.rows[0].id);
  redirect("/");
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const r = await query<{ id: string; password_hash: string; suspended: boolean }>(
    "select id, password_hash, suspended from users where email = $1",
    [email],
  );
  const user = r.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Incorrect email or password." };
  }
  if (user.suspended) {
    return { error: "This account has been suspended. Please contact support." };
  }
  await createSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}

/** Disconnect Google from the current account. Refused if the account has no
 *  password, since that would leave the user with no way to sign in. */
export async function disconnectGoogle(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const r = await query<{ has_password: boolean }>(
    "select password_hash is not null as has_password from users where id = $1",
    [user.id],
  );
  if (!r.rows[0]?.has_password) {
    redirect("/account?error=no_password");
  }
  await query("update users set google_sub = null where id = $1", [user.id]);
  redirect("/account?disconnected=1");
}

/** Start a reset: email a one-time link if the address is registered. Always
 *  returns the same result so it can't be used to enumerate accounts. */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(formData.get("email"));
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };

  const r = await query<{ id: string }>("select id from users where email = $1", [email]);
  const user = r.rows[0];
  if (user) {
    const token = await issueResetToken(user.id);
    const link = `${SITE_URL}/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: `Reset your ${SITE_NAME} password`,
      text: `Reset your ${SITE_NAME} password using this link (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `<p>Reset your ${SITE_NAME} password using the link below (valid for 1 hour):</p>
<p><a href="${link}">${link}</a></p>
<p style="color:#6b7280;font-size:13px">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    });
  }
  return { sent: true };
}

/** Complete a reset: validate the one-time token, set the new password, revoke
 *  every existing session, and sign the user in on this device. */
export async function resetPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!token) return { error: "This reset link is invalid. Request a new one." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const r = await query<{ id: string; user_id: string }>(
    "select id, user_id from password_resets where token_hash = $1 and used_at is null and expires_at > now()",
    [hashResetToken(token)],
  );
  const row = r.rows[0];
  if (!row) return { error: "This reset link is invalid or has expired — request a new one." };

  const hash = await hashPassword(password);
  await query("update users set password_hash = $1 where id = $2", [hash, row.user_id]);
  await query("update password_resets set used_at = now() where id = $1", [row.id]);
  // Security: revoke all existing sessions, then sign in on this device.
  await query("delete from sessions where user_id = $1", [row.user_id]);
  await createSession(row.user_id);
  redirect("/");
}
