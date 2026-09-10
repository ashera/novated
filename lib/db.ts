import { Pool, type QueryResultRow } from "pg";
import type { ConnectionOptions } from "tls";

/**
 * TLS settings for a connection string. Local dev and Railway's private
 * network (`*.railway.internal`) run unencrypted; any other host (e.g. a
 * Railway public proxy URL, or another managed provider) gets TLS with
 * relaxed cert verification, which is what those providers expect.
 */
export function sslFor(url: string | undefined): ConnectionOptions | false {
  if (!url) return false;
  if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) return false;
  if (/\.railway\.internal[:/]/.test(url)) return false;
  return { rejectUnauthorized: false };
}

// Reuse a single pool across HMR reloads in development.
const globalForPg = globalThis as unknown as { __pgPool?: Pool };

export const pool =
  globalForPg.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslFor(process.env.DATABASE_URL),
  });

if (process.env.NODE_ENV !== "production") globalForPg.__pgPool = pool;

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params as unknown[]);
}

type Querier = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

/** Run a set of statements in a single transaction. */
export async function withTransaction<T>(
  fn: (q: Querier) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn((text, params) => client.query(text, params as unknown[]));
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
