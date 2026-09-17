import "server-only";

// Server-only wrapper around the pure geo lookup (which is kept script-importable in
// ./geoLookup). App code imports from here so geoip-lite never leaks into a client
// bundle; scripts import ./geoLookup directly.
export {
  lookupGeo,
  countryFromIp,
  lookupGeoDetail,
  type GeoResult,
  type GeoDetail,
} from "./geoLookup";
export { clientIp, countryFromHeaders, type HeaderGet } from "./geoHeaders";

import { headers } from "next/headers";
import { countryFromIp, lookupGeoDetail } from "./geoLookup";
import { clientIp, countryFromHeaders } from "./geoHeaders";

/**
 * Where this request came from, read the same way everywhere.
 *
 * The four lines this replaces were copy-pasted into five files — the header
 * flag, the calculator, the decoder, the comparison page and the session
 * writer — and every one of them read `x-forwarded-for` first. When Cloudflare
 * went in front of the app that became the address of a datacentre, and only
 * the tracking action had been taught otherwise. One fact, six copies, one
 * updated: the same shape as the loan rate, the amount financed and the
 * residual GST before it.
 */
export async function requestGeo(): Promise<{
  ip: string | null;
  country: string | null;
  source: ReturnType<typeof countryFromHeaders>["source"];
  detail: ReturnType<typeof lookupGeoDetail>;
}> {
  try {
    const h = await headers();
    const get = (name: string) => h.get(name);
    const ip = clientIp(get);
    const { country, source } = countryFromHeaders(get, countryFromIp);
    return { ip, country, source, detail: lookupGeoDetail(ip) };
  } catch {
    // Called outside a request context, or headers unavailable. A missing flag
    // is not worth failing a page render over.
    return { ip: null, country: null, source: null, detail: null };
  }
}
