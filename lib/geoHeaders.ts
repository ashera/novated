/**
 * Which header actually carries the visitor, once a CDN is in front.
 *
 * Kept pure — it takes a header getter rather than calling `headers()` — so it
 * can be tested, and so the server-only wrapper in ./geo is the only thing
 * that has to know about Next's request context.
 *
 * The reason this exists: putting Cloudflare in front of the app changed who
 * connects to it. Railway writes `x-forwarded-for` from whoever opens the
 * socket, and that is now always a Cloudflare edge node, so
 * `x-forwarded-for.split(",")[0]` stopped being the visitor and started being
 * a datacentre. Every visitor row written since carries a Cloudflare address —
 * 104.22.x, 162.158.x, 172.64–172.71.x — and the flag in the header reported
 * wherever that anycast block geolocates, changing between requests as
 * Cloudflare routed them differently. Australian visitors were shown as being
 * in Paris, then Singapore, then Hong Kong.
 *
 * The visitor's own address moved to `cf-connecting-ip`, which is why that is
 * read first.
 *
 * A note on trust: these headers are only as good as the proxy in front. The
 * app's origin is still reachable directly, so a client hitting it could set
 * any of them. Nothing here gates access or authorisation — it fills a flag
 * and an analytics row — so the trade is worth it. Do not promote any of it to
 * something that decides what a request is allowed to do.
 */

export type HeaderGet = (name: string) => string | null | undefined;

/** First entry of a comma-separated header, trimmed. */
function first(v: string | null | undefined): string | null {
  if (!v) return null;
  const head = v.split(",")[0]?.trim();
  return head ? head : null;
}

/**
 * The visitor's IP address.
 *
 * In order of how much the source knows about who is actually calling:
 * Cloudflare's own record of the connecting client, then the Enterprise and
 * Akamai spelling of the same thing, then the forwarded-for chain, then the
 * single-value fallback some proxies set instead.
 */
export function clientIp(get: HeaderGet): string | null {
  return (
    first(get("cf-connecting-ip")) ||
    first(get("true-client-ip")) ||
    first(get("x-forwarded-for")) ||
    first(get("x-real-ip")) ||
    null
  );
}

export interface CountryFromHeaders {
  country: string | null;
  /** How it was determined, recorded so an admin can see the basis. */
  source: "header:cf-ipcountry" | "header:x-vercel-ip-country" | "geoip" | null;
}

/**
 * The country, preferring the CDN's own verdict over a database lookup.
 *
 * Cloudflare resolves the country at the edge from the connecting address
 * before any of this runs, so where it has said one there is nothing a local
 * database can add. `XX` and `T1` are its own placeholders — unknown, and Tor —
 * and mean "no answer" rather than a country.
 */
export function countryFromHeaders(
  get: HeaderGet,
  lookup: (ip: string | null) => string | null,
): CountryFromHeaders {
  const cf = first(get("cf-ipcountry"));
  if (cf && cf !== "XX" && cf !== "T1") {
    return { country: cf.toUpperCase(), source: "header:cf-ipcountry" };
  }
  const vercel = first(get("x-vercel-ip-country"));
  if (vercel) return { country: vercel.toUpperCase(), source: "header:x-vercel-ip-country" };

  const fromIp = lookup(clientIp(get));
  return fromIp ? { country: fromIp, source: "geoip" } : { country: null, source: null };
}
