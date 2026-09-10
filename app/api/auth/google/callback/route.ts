import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, getCurrentUser } from "@/lib/auth";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_LINK_COOKIE,
  CALLBACK_PATH,
  exchangeCodeForProfile,
  findOrCreateGoogleUser,
  linkGoogleToUser,
  requestOrigin,
} from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

// Google redirects the user back here with a `code` and our `state`. Validate
// state, exchange the code for the profile, find-or-create the user (auto-linking
// by verified email), open a session, and land them on the calculator.
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error"); // e.g. user cancelled

  const store = await cookies();
  const expectedState = store.get(GOOGLE_STATE_COOKIE)?.value;
  const isLink = store.get(GOOGLE_LINK_COOKIE)?.value === "1";
  store.delete(GOOGLE_STATE_COOKIE); // one-time use
  store.delete(GOOGLE_LINK_COOKIE);

  // Connect-to-existing-account failures go back to the account page.
  const linkFail = (reason: string) =>
    NextResponse.redirect(`${origin}/account?error=${encodeURIComponent(reason)}`);

  if (oauthError) return isLink ? linkFail("google_cancelled") : fail("google_cancelled");
  if (!code || !state || !expectedState || state !== expectedState) {
    return isLink ? linkFail("google_state") : fail("google_state"); // CSRF / stale round-trip
  }

  try {
    const profile = await exchangeCodeForProfile(code, `${origin}${CALLBACK_PATH}`);
    if (!profile.email || !profile.emailVerified) {
      return isLink ? linkFail("google_email_unverified") : fail("google_email_unverified");
    }

    // Link mode: attach this Google identity to the currently logged-in account.
    if (isLink) {
      const current = await getCurrentUser();
      if (!current) return fail("login_required");
      const res = await linkGoogleToUser(current.id, profile);
      return NextResponse.redirect(`${origin}/account?${res.ok ? "linked=1" : "error=google_in_use"}`);
    }

    // Sign-in mode: find-or-create, then open a session.
    const user = await findOrCreateGoogleUser(profile);
    if (user.suspended) return fail("suspended");
    await createSession(user.id);
    return NextResponse.redirect(`${origin}/`);
  } catch (e) {
    console.error("Google OAuth callback failed:", e);
    return isLink ? linkFail("google_failed") : fail("google_failed");
  }
}
