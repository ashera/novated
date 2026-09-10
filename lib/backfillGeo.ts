// Fill visitors.country/region/city for rows captured before IP→geo resolution
// existed (they have an ip but no country). Idempotent — only touches null-country
// rows with a resolvable IP. Shared by scripts/migrate.ts (runs every deploy) and
// scripts/backfill-geo.ts (manual). Uses ./geoLookup directly (no "server-only") so
// it's safe in a plain Node script.
import type { Client } from "pg";
import { lookupGeoDetail } from "./geoLookup";
import { classifyBot } from "./botDetect";

export async function backfillVisitorGeo(c: Client): Promise<{ updated: number; scanned: number }> {
  // Rows still missing either a country or coordinates, but with an IP to resolve.
  const rows = await c.query<{ id: string; ip: string }>(
    "select id, ip from visitors where ip is not null and (country is null or lat is null)",
  );
  let updated = 0;
  for (const r of rows.rows) {
    const geo = lookupGeoDetail(r.ip);
    if (!geo?.country) continue;
    await c.query(
      `update visitors
          set country = coalesce(country, $2),
              region = coalesce(region, $3),
              city = coalesce(city, $4),
              geo_source = coalesce(geo_source, 'geoip'),
              lat = coalesce(lat, $5),
              lon = coalesce(lon, $6)
        where id = $1`,
      [r.id, geo.country, geo.region, geo.city, geo.coordinates?.[0] ?? null, geo.coordinates?.[1] ?? null],
    );
    updated++;
  }
  return { updated, scanned: rows.rows.length };
}

/** Classify visitor rows not yet flagged as bot/human, from their stored UA (the
 *  webdriver signal is only known at capture, so backfill is UA-only). Idempotent —
 *  only touches rows where is_bot is null. */
export async function backfillVisitorBots(c: Client): Promise<{ updated: number }> {
  const rows = await c.query<{ id: string; user_agent: string | null }>(
    "select id, user_agent from visitors where is_bot is null",
  );
  let updated = 0;
  for (const r of rows.rows) {
    const { isBot, reason } = classifyBot(r.user_agent);
    await c.query("update visitors set is_bot = $2, bot_reason = coalesce(bot_reason, $3) where id = $1", [
      r.id,
      isBot,
      reason,
    ]);
    updated++;
  }
  return { updated };
}
