import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_LINK_COOKIE,
  CALLBACK_PATH,
  googleConfigured,
  buildAuthUrl,
  requestOrigin,
} from "@/lib/googleAuth";

export const dynamic = "force-dynamic";

// Start of the Google flow: set a short-lived CSRF `state` cookie and bounce the
// user to Google's consent screen. `?link=1` marks a "connect Google to my
// existing account" round-trip (from the account page) rather than a sign-in.
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=google_unavailable`);
  }
  const link = new URL(req.url).searchParams.get("link") === "1";
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes to complete the round-trip
  };
  store.set(GOOGLE_STATE_COOKIE, state, cookieOpts);
  if (link) store.set(GOOGLE_LINK_COOKIE, "1", cookieOpts);
  return NextResponse.redirect(buildAuthUrl(state, `${origin}${CALLBACK_PATH}`));
}
