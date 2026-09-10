// One-off / manual: fill `visitors.country/region/city` for rows captured before
// IP→geo resolution existed. Idempotent — safe to re-run. This same backfill also
// runs automatically on every deploy (see scripts/migrate.ts), so you rarely need
// this directly; it's here for ad-hoc runs.
// Usage: npx tsx scripts/backfill-geo.ts   (uses DATABASE_URL, else local dev DB)
import { Client } from "pg";
import { sslFor } from "../lib/db";
import { backfillVisitorGeo } from "../lib/backfillGeo";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/novated";

async function main() {
  const c = new Client({ connectionString: url, ssl: sslFor(url) });
  await c.connect();
  try {
    const { updated, scanned } = await backfillVisitorGeo(c);
    console.log(`Backfilled ${updated} of ${scanned} visitor row(s) with a resolvable IP.`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
