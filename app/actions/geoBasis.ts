"use server";

import { query } from "@/lib/db";
import { getAdmin } from "@/lib/auth";
import { lookupGeoDetail } from "@/lib/geo";
import { countryName } from "@/lib/countryName";

export interface LocationBasis {
  ok: boolean;
  error?: string;
  country: string | null;
  countryName: string | null;
  method: string; // human-readable determination method
  ip: string | null;
  ipRetained: boolean;
  region: string | null;
  city: string | null;
  timezone: string | null;
  coordinates: string | null; // "lat, lon"
  accuracyKm: number | null;
  locale: string | null; // Accept-Language, a corroborating signal
  storedMatchesLive: boolean | null; // does a fresh GeoLite lookup still agree?
  note: string | null;
}

function methodLabel(geoSource: string | null, hasIp: boolean): string {
  if (geoSource === "geoip") return "IP geolocation — MaxMind GeoLite (offline database)";
  if (geoSource?.startsWith("header:")) {
    const h = geoSource.slice("header:".length);
    return `Proxy geo header (${h === "cf-ipcountry" ? "Cloudflare " : h === "x-vercel-ip-country" ? "Vercel " : ""}${h})`;
  }
  // Older rows captured before geo_source existed: infer from whether we have an IP.
  return hasIp ? "IP geolocation — MaxMind GeoLite (offline database)" : "Not determined";
}

/** Admin: explain how a visitor's or an account's country was determined. Re-runs
 *  the GeoLite lookup on the stored IP (visitors) so the popover shows the live
 *  evidence — timezone, coordinates, accuracy radius — behind the flag. */
export async function explainLocation(kind: "visitor" | "user", id: string): Promise<LocationBasis> {
  const empty: LocationBasis = {
    ok: false,
    country: null,
    countryName: null,
    method: "Not determined",
    ip: null,
    ipRetained: false,
    region: null,
    city: null,
    timezone: null,
    coordinates: null,
    accuracyKm: null,
    locale: null,
    storedMatchesLive: null,
    note: null,
  };

  const admin = await getAdmin();
  if (!admin) return { ...empty, error: "Not authorised." };

  try {
    if (kind === "visitor") {
      const r = await query<{
        country: string | null;
        region: string | null;
        city: string | null;
        ip: string | null;
        locale: string | null;
        geo_source: string | null;
      }>(
        "select country, region, city, ip, locale, geo_source from visitors where id = $1",
        [id],
      );
      const row = r.rows[0];
      if (!row) return { ...empty, error: "Visitor not found." };

      const detail = lookupGeoDetail(row.ip);
      return {
        ok: true,
        country: row.country,
        countryName: countryName(row.country),
        method: methodLabel(row.geo_source, !!row.ip),
        ip: row.ip,
        ipRetained: true,
        region: row.region,
        city: row.city,
        timezone: detail?.timezone ?? null,
        coordinates: detail?.coordinates ? `${detail.coordinates[0]}, ${detail.coordinates[1]}` : null,
        accuracyKm: detail?.accuracyKm ?? null,
        locale: row.locale,
        storedMatchesLive: detail ? detail.country === row.country : null,
        note: !row.country
          ? "No country could be determined (private/unknown IP or no geo data)."
          : null,
      };
    }

    // kind === "user": we resolve country from the sign-in IP but deliberately do
    // NOT retain the IP for accounts, so there's nothing to re-check against.
    const r = await query<{ country: string | null }>("select country from users where id = $1", [id]);
    const row = r.rows[0];
    if (!row) return { ...empty, error: "User not found." };
    return {
      ...empty,
      ok: true,
      country: row.country,
      countryName: countryName(row.country),
      method: row.country
        ? "IP geolocation — MaxMind GeoLite (offline), from the IP at last sign-in"
        : "Not determined",
      ipRetained: false,
      note: row.country
        ? "The IP address is not retained for accounts — only the resolved country. It's set/refreshed on each sign-in."
        : "No country yet — set on the account's next sign-in.",
    };
  } catch {
    return { ...empty, error: "Couldn't load the location basis." };
  }
}
