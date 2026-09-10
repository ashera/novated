import "server-only";
import { query } from "./db";

export interface CountryCount {
  country: string; // 2-letter ISO
  users: number;
  visitors: number;
}

/** Per-country tallies of signed-up accounts and anonymous visitors, for the admin
 *  map. Only rows with a resolved country are counted. */
export async function getLocationCounts(): Promise<CountryCount[]> {
  const [u, v] = await Promise.all([
    query<{ country: string; n: number }>(
      "select country, count(*)::int as n from users where country is not null group by country",
    ),
    query<{ country: string; n: number }>(
      "select country, count(*)::int as n from visitors where country is not null and not coalesce(is_bot, false) group by country",
    ),
  ]);

  const map = new Map<string, CountryCount>();
  const bump = (country: string, key: "users" | "visitors", n: number) => {
    const row = map.get(country) ?? { country, users: 0, visitors: 0 };
    row[key] += n;
    map.set(country, row);
  };
  for (const r of u.rows) bump(r.country, "users", r.n);
  for (const r of v.rows) bump(r.country, "visitors", r.n);

  return [...map.values()].sort((a, b) => b.users + b.visitors - (a.users + a.visitors));
}

export interface LocationPoint {
  lat: number;
  lon: number;
  city: string | null;
  region: string | null;
  country: string | null;
  users: number;
  visitors: number;
}

/** City-level points (accounts + visitors) with resolved coordinates, aggregated so
 *  one dot represents a city. Keyed on coordinates rounded to ~1km. */
export async function getLocationPoints(): Promise<LocationPoint[]> {
  const [u, v] = await Promise.all([
    query<{ lat: number; lon: number; city: string | null; region: string | null; country: string | null }>(
      // Accounts store only country + coordinates (no city/region), so those are null.
      "select lat, lon, null::text as city, null::text as region, country from users where lat is not null and lon is not null",
    ),
    query<{ lat: number; lon: number; city: string | null; region: string | null; country: string | null }>(
      "select lat, lon, city, region, country from visitors where lat is not null and lon is not null and not coalesce(is_bot, false)",
    ),
  ]);

  const map = new Map<string, LocationPoint>();
  const add = (
    row: { lat: number; lon: number; city: string | null; region: string | null; country: string | null },
    key: "users" | "visitors",
  ) => {
    const k = `${row.lat.toFixed(2)},${row.lon.toFixed(2)}`;
    const p =
      map.get(k) ??
      { lat: row.lat, lon: row.lon, city: row.city, region: row.region, country: row.country, users: 0, visitors: 0 };
    p[key] += 1;
    // Prefer a non-null label if this row has one and the stored point doesn't.
    if (!p.city && row.city) p.city = row.city;
    if (!p.country && row.country) p.country = row.country;
    map.set(k, p);
  };
  for (const r of u.rows) add(r, "users");
  for (const r of v.rows) add(r, "visitors");

  return [...map.values()].sort((a, b) => b.users + b.visitors - (a.users + a.visitors));
}
