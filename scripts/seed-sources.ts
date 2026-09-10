// Seed only the reference-data sources (idempotent). For a full schema +
// seed run use `npm run db:migrate`.
import { Client } from "pg";
import { seedSources } from "../lib/migrations";
import { sslFor } from "../lib/db";

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:password@localhost:5432/novated";

async function main() {
  const c = new Client({ connectionString: url, ssl: sslFor(url) });
  await c.connect();
  try {
    await seedSources(c);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
