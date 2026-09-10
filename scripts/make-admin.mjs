import { Client } from "pg";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email>");
  process.exit(1);
}

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/novated";

const c = new Client({ connectionString: url });
await c.connect();
const r = await c.query(
  "update users set is_admin = true where email = $1 returning id, email, is_admin",
  [email],
);
if (r.rows.length === 0) {
  console.error(`No user found with email ${email}. Sign up in the app first, then re-run.`);
  await c.end();
  process.exit(1);
}
console.log(`Promoted to admin: ${r.rows[0].email}`);
await c.end();
