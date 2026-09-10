import "server-only";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { cookies, headers } from "next/headers";
import { query } from "./db";
import { lookupGeoDetail } from "./geo";

const scryptAsync = promisify(scrypt);
const COOKIE = "session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TTL_MS = 60 * 60 * 1000; // password-reset links valid for one hour

// --- Password-reset tokens (only the sha256 hash is stored) ---
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issue a one-time reset token for a user (clearing any earlier one) and return
 *  the RAW token to embed in a link. Shared by self-service and admin resets. */
export async function issueResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await query("delete from password_resets where user_id = $1", [userId]);
  await query(
    "insert into password_resets (user_id, token_hash, expires_at) values ($1, $2, $3)",
    [userId, hashResetToken(token), expires],
  );
  return token;
}

export interface User {
  id: string;
  email: string;
  is_admin: boolean;
  name: string | null;
  avatar_url: string | null;
  country: string | null;
}

// --- Password hashing (scrypt, salt stored alongside the hash) ---
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const keyBuf = Buffer.from(key, "hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return keyBuf.length === buf.length && timingSafeEqual(keyBuf, buf);
}

// --- Sessions (DB-backed token in an httpOnly cookie) ---
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MS);
  await query(
    "insert into sessions (user_id, token, expires_at) values ($1, $2, $3)",
    [userId, token, expires],
  );
  // Best-effort country + city coordinates from the sign-in IP (keep the prior
  // values if we can't resolve this time — e.g. a private/unknown IP). We don't
  // store the raw IP for accounts.
  let country: string | null = null;
  let lat: number | null = null;
  let lon: number | null = null;
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip");
    const geo = lookupGeoDetail(ip);
    country = geo?.country ?? null;
    lat = geo?.coordinates?.[0] ?? null;
    lon = geo?.coordinates?.[1] ?? null;
  } catch {
    /* ignore */
  }
  await query(
    `update users set last_login_at = now(),
        country = coalesce($2, country),
        lat = coalesce($3, lat),
        lon = coalesce($4, lon)
      where id = $1`,
    [userId, country, lat, lon],
  );
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  // Conversion: if this browser was tracked as an anonymous visitor, flag that row
  // as signed-up and drop the visitor cookie so we stop tracking it. Best-effort —
  // never let analytics bookkeeping break sign-in.
  try {
    const visitorKey = store.get("lw_visitor")?.value;
    if (visitorKey) {
      await query(
        "update visitors set signed_up = true, converted_user_id = $2, last_seen_at = now() where visitor_key = $1",
        [visitorKey, userId],
      );
      store.delete("lw_visitor");
    }
  } catch {
    /* ignore */
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await query("delete from sessions where token = $1", [token]);
    store.delete(COOKIE);
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const r = await query<User>(
    `select u.id, u.email, u.is_admin, u.name, u.avatar_url, u.country
       from sessions s
       join users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now()
        and not coalesce(u.suspended, false)`,
    [token],
  );
  return r.rows[0] ?? null;
}

/** For server actions: returns the current user only if they are an admin, else null. */
export async function getAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  return user?.is_admin ? user : null;
}
