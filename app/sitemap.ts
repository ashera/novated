import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { BUILD_DATE } from "@/lib/version";

// Only genuinely public content pages belong here — the per-user surfaces
// (/report, /account, /admin, share links) stay out of the index, and so does
// /decode: the site has one entry point, the calculator, and the decoder is
// reached from it rather than landed on.
// tests/sitemap.test.ts enforces that no noindex route sneaks in.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/how-it-works`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/faq`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/choose-your-provider`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/glossary`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: BUILD_DATE, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/releases`, lastModified: BUILD_DATE, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/signup`, lastModified: BUILD_DATE, changeFrequency: "yearly", priority: 0.6 },
  ];
}
