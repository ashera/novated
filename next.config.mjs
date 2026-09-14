/**
 * How long a browser should refuse to speak plain http to this host.
 *
 * NOT the authoritative value any more. Cloudflare sets HSTS at the edge for
 * the whole zone and overwrites whatever the origin sends — verified: this
 * file said an hour and www was observed serving 2592000. Changing the number
 * below does not change what visitors get. That lives in the Cloudflare
 * dashboard, under SSL/TLS → Edge Certificates → HSTS.
 *
 * It is kept because the edge is not the only way in. A request straight to
 * the Railway hostname, or to this app with the proxy off, never passes
 * through Cloudflare and would otherwise carry no HSTS at all. So this is a
 * floor, matched to the edge value so the two cannot be read as disagreeing.
 *
 * Why the edge had to take it over: the apex is answered by a Cloudflare
 * Redirect Rule and never reaches this app, so it could not be covered from
 * here at any value — it was serving no HSTS whatsoever until the zone-level
 * setting was turned on. (An earlier note here blamed GoDaddy's DNS. That was
 * true once; DNS has since moved to Cloudflare.)
 *
 * No `includeSubDomains`: served from www it would only reach subdomains OF
 * www, which do not exist, and would read as though the apex were covered
 * when the apex is covered by something else entirely.
 *
 * No `preload`. Submitting to the preload list is close to permanent and is
 * not a decision to make on the way past — and it would have to be made at
 * Cloudflare regardless, since that is what serves the header.
 */
const HSTS_MAX_AGE = 60 * 60 * 24 * 30;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Vehicle artwork is uploaded through a server action; the 1MB default is
    // below a reasonable studio image. Raised again once uploads started being
    // re-encoded on arrival rather than refused — what a generator hands back
    // can be several megabytes of PNG, and it is shrunk to a fraction of that
    // before anything is stored.
    serverActions: { bodySizeLimit: "12mb" },
  },
  // geoip-lite reads its MaxMind data files from its own package dir at runtime;
  // let it load from node_modules instead of being bundled (webpack rewrites
  // __dirname and drops the .dat files, so bundling breaks the lookup).
  serverExternalPackages: ["geoip-lite"],
  async headers() {
    return [
      {
        // Every response, so it is picked up whichever page someone lands on.
        // Browsers ignore it over plain http, which is exactly right: it is
        // only ever a promise made on a connection already secured.
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: `max-age=${HSTS_MAX_AGE}` },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Common ways people will type the explainer's URL.
      { source: "/how-it-works.html", destination: "/how-it-works", permanent: true },
      { source: "/calculator", destination: "/", permanent: true },
      { source: "/novated-lease-calculator", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
