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
