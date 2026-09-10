import "server-only";
import { query } from "./db";

// Hand-rolled Google OAuth 2.0 (authorization-code flow). No external library:
// we build the consent URL, exchange the code server-to-server, read the signed
// ID token that Google returns over TLS, and hand the user off to the app's own
// session system (createSession in lib/auth.ts). The client secret never leaves
// the server.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const GOOGLE_STATE_COOKIE = "g_oauth_state";
export const GOOGLE_LINK_COOKIE = "g_oauth_link"; // set when connecting Google to an already-logged-in account
export const CALLBACK_PATH = "/api/auth/google/callback";

/** The live origin (scheme + host) of the incoming request, honouring the proxy
 *  headers Railway sets. Used to build a redirect URI that matches the host the
 *  user actually hit — localhost in dev, the real domain in prod — so it lines
 *  up with a URI registered on the OAuth client without env juggling. */
export function requestOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Whether Google sign-in is configured (both credentials present). Lets the UI
 *  hide the button and the routes fail gracefully when it isn't set up. */
export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The Google consent-screen URL to redirect the user to. `redirectUri` must
 *  exactly match one registered on the OAuth client (built from the live origin
 *  so it works on both localhost and prod). */
export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string; // Google's stable per-user id
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/** Read the JWT payload of the ID token. The token comes straight from Google's
 *  token endpoint over TLS in response to our secret-authenticated exchange, so
 *  it's trusted — we decode the claims rather than re-verify the signature. */
function decodeIdToken(idToken: string): GoogleProfile {
  const payload = idToken.split(".")[1];
  if (!payload) throw new Error("malformed id_token");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return {
    sub: String(claims.sub),
    email: String(claims.email ?? "").toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: claims.name ? String(claims.name) : null,
    picture: claims.picture ? String(claims.picture) : null,
  };
}

/** Exchange the authorization code for tokens and return the user's profile. */
export async function exchangeCodeForProfile(code: string, redirectUri: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("no id_token in token response");
  return decodeIdToken(data.id_token);
}

/**
 * Resolve the app user for a Google profile: match by google_sub (returning
 * Google user), else by verified email (link Google to the existing account —
 * one person, one account), else create a new password-less account. Google
 * emails are verified, so auto-linking by email is safe.
 */
export async function findOrCreateGoogleUser(
  p: GoogleProfile,
): Promise<{ id: string; suspended: boolean }> {
  const bySub = await query<{ id: string; suspended: boolean }>(
    "select id, suspended from users where google_sub = $1",
    [p.sub],
  );
  if (bySub.rows[0]) return bySub.rows[0];

  const byEmail = await query<{ id: string; suspended: boolean }>(
    "select id, suspended from users where lower(email) = lower($1)",
    [p.email],
  );
  if (byEmail.rows[0]) {
    await query(
      `update users
          set google_sub = coalesce(google_sub, $1),
              name = coalesce(name, $2),
              avatar_url = coalesce(avatar_url, $3)
        where id = $4`,
      [p.sub, p.name, p.picture, byEmail.rows[0].id],
    );
    return byEmail.rows[0];
  }

  const created = await query<{ id: string; suspended: boolean }>(
    `insert into users (email, google_sub, name, avatar_url)
     values ($1, $2, $3, $4)
     returning id, suspended`,
    [p.email, p.sub, p.name, p.picture],
  );
  return created.rows[0];
}

/**
 * Connect a Google identity to an already-logged-in account (from the account
 * page). Refuses if that Google account is already linked to a DIFFERENT user.
 */
export async function linkGoogleToUser(
  userId: string,
  p: GoogleProfile,
): Promise<{ ok: true } | { ok: false; error: "in_use" }> {
  const taken = await query<{ id: string }>(
    "select id from users where google_sub = $1 and id <> $2",
    [p.sub, userId],
  );
  if (taken.rows[0]) return { ok: false, error: "in_use" };
  await query(
    `update users
        set google_sub = $1,
            name = coalesce(name, $2),
            avatar_url = coalesce(avatar_url, $3)
      where id = $4`,
    [p.sub, p.name, p.picture, userId],
  );
  return { ok: true };
}
