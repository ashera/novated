"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getAdmin, issueResetToken } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { SITE_URL, SITE_NAME } from "@/lib/site";

export interface UserAdminResult {
  ok?: boolean;
  error?: string;
  link?: string; // password-reset link (admin reset)
  emailed?: boolean; // whether the reset link was also emailed to the user
}

function revalidate(userId?: string) {
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/users/${userId}`);
}

/** Grant or revoke admin. Can't remove your own admin (avoids lock-out). */
export async function setUserAdmin(userId: string, isAdmin: boolean): Promise<UserAdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (userId === admin.id && !isAdmin) return { error: "You can't remove your own admin access." };
  await query("update users set is_admin = $1 where id = $2", [isAdmin, userId]);
  revalidate(userId);
  return { ok: true };
}

/** Suspend or reinstate an account. Suspending also revokes their sessions
 *  (immediate sign-out) and blocks future logins. Can't suspend yourself. */
export async function setUserSuspended(userId: string, suspended: boolean): Promise<UserAdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (userId === admin.id && suspended) return { error: "You can't suspend your own account." };
  await query("update users set suspended = $1 where id = $2", [suspended, userId]);
  if (suspended) await query("delete from sessions where user_id = $1", [userId]);
  revalidate(userId);
  return { ok: true };
}

/** Permanently delete a user and everything they own (plans, drafts, sessions
 *  cascade). Can't delete yourself. */
export async function deleteUser(userId: string): Promise<UserAdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  if (userId === admin.id) return { error: "You can't delete your own account." };
  await query("delete from users where id = $1", [userId]);
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Issue a password-reset link for a user. Emails it to them if the mailer is
 *  configured, and always returns the link so the admin can hand it over. */
export async function adminResetPassword(userId: string): Promise<UserAdminResult> {
  const admin = await getAdmin();
  if (!admin) return { error: "Not authorised." };
  const r = await query<{ email: string }>("select email from users where id = $1", [userId]);
  const email = r.rows[0]?.email;
  if (!email) return { error: "User not found." };

  const token = await issueResetToken(userId);
  const link = `${SITE_URL}/reset-password?token=${token}`;
  const emailed = !!process.env.RESEND_API_KEY;
  await sendEmail({
    to: email,
    subject: `Reset your ${SITE_NAME} password`,
    text: `An administrator started a password reset for your ${SITE_NAME} account. Set a new password using this link (valid for 1 hour):\n\n${link}\n\nIf you didn't expect this, you can ignore it.`,
    html: `<p>An administrator started a password reset for your ${SITE_NAME} account. Set a new password using the link below (valid for 1 hour):</p>
<p><a href="${link}">${link}</a></p>
<p style="color:#6b7280;font-size:13px">If you didn't expect this, you can safely ignore it.</p>`,
  });
  return { ok: true, link, emailed };
}
