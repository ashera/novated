/**
 * How long a browser should refuse to speak plain http to this host.
 *
 * Deliberately short to begin with. HSTS is a promise the browser remembers
 * and will not let anyone click through: if a certificate ever fails while a
 * long max-age is cached, the site is simply unreachable for everyone who has
 * visited, for the rest of that period. So it gets earned — an hour, then a
 * day once a renewal has been watched through, then a year.
 *
 * No `includeSubDomains`: served from www it would only reach subdomains OF
 * www, which do not exist. The apex is answered by the registrar's forwarding
 * service and cannot be covered from here — that needs the apex pointed at
 * this app, which GoDaddy's DNS cannot do.
 *
 * No `preload` either. Submitting to the preload list is close to permanent
 * and is not a decision to make on the way past.
 */
const HSTS_MAX_AGE = 60 * 60;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Vehicle artwork is uploaded through a server action; the 1MB default is
    // below a reasonable studio image.
    serverActions: { bodySizeLimit: "4mb" },
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
