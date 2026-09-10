// Local dev testing ONLY: mint a session for a dedicated test user so automated
// browser tests (Playwright) can exercise authenticated flows.
//
//   node --env-file=.env.local scripts/dev-login.mjs [--admin] [--email <addr>]
//
// Prints `SESSION=<token>`; set that as the httpOnly `session` cookie on
// localhost:3000 to be signed in. Hard-refuses any non-local DATABASE_URL, so it
// can never create a session against a deployed database.
import pg from "pg";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const url = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/novated";

// Safety: only ever run against a local database.
const host = (() => {
  try { return new URL(url).hostname; } catch { return ""; }
})();
if (!["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  console.error(`REFUSING: DATABASE_URL host "${host}" is not local. This helper is dev-only.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const isAdmin = args.includes("--admin");
const emailArg = args[args.indexOf("--email") + 1];
const email = args.includes("--email") && emailArg ? emailArg : "test-bot@leasewiz.local";
const password = "test-bot-password"; // so form-login works too, if ever needed

async function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(pw, salt, 64);
  return `${salt}:${buf.toString("hex")}`;
}

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const pwHash = await hashPassword(password);
  // Upsert the test user; keep is_admin in sync with the flag.
  const up = await c.query(
    `insert into users (email, password_hash, is_admin)
       values ($1, $2, $3)
     on conflict (email) do update set is_admin = excluded.is_admin
     returning id`,
    [email, pwHash, isAdmin],
  );
  const userId = up.rows[0].id;
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await c.query("insert into sessions (user_id, token, expires_at) values ($1, $2, $3)", [userId, token, expires]);
  console.error(`user ${email} (${isAdmin ? "admin" : "non-admin"}) id=${userId}`);
  console.log(`SESSION=${token}`);
} finally {
  await c.end();
}
