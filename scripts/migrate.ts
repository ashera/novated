// Deploy-time database migration. Runs on every Railway deploy via the
// pre-deploy command in railway.json, and locally via `npm run db:migrate`.
// Idempotent: applies the schema and seeds reference data / sources.
import { Client } from "pg";
import { migrate } from "../lib/migrations";
import { backfillVisitorGeo, backfillVisitorBots } from "../lib/backfillGeo";
import { sslFor } from "../lib/db";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/novated";

async function main() {
  console.log("Running database migration…");
  const c = new Client({ connectionString: url, ssl: sslFor(url) });
  await c.connect();
  try {
    await migrate(c);
    // Backfill country for visitor rows captured before IP→geo existed. Best-effort:
    // a geo hiccup must never abort a deploy, so it's caught here (unlike migrate).
    try {
      const { updated, scanned } = await backfillVisitorGeo(c);
      console.log(`  visitor-geo: backfilled ${updated} of ${scanned} row(s) needing a country.`);
      const bots = await backfillVisitorBots(c);
      console.log(`  visitor-bots: classified ${bots.updated} previously-unlabelled row(s).`);
    } catch (e) {
      console.warn("  visitor-geo/bots: backfill skipped —", (e as Error).message);
    }
    const t = await c.query(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    );
    console.log("Migration complete. Tables:", t.rows.map((r) => r.tablename).join(", "));
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1); // non-zero aborts the Railway deploy — a bad migration never ships.
});
