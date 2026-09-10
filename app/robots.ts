import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Private surfaces kept out of every crawler: the admin backoffice, per-user
// reports and accounts, and shared-scenario capability links.
const DISALLOW = ["/admin", "/report", "/account", "/s/"];

// AI/LLM crawlers we EXPLICITLY welcome, so LeaseWiz can be retrieved and cited by
// generative engines (GEO). The "*" rule already permits them, but naming them makes
// the intent unambiguous and survives any future tightening of the wildcard.
const AI_BOTS = [
  "GPTBot", // OpenAI training
  "OAI-SearchBot", // ChatGPT search
  "ChatGPT-User", // ChatGPT live browsing
  "ClaudeBot", // Anthropic
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot", // Perplexity index
  "Perplexity-User",
  "Google-Extended", // Gemini / Vertex AI training
  "Applebot-Extended", // Apple Intelligence
  "CCBot", // Common Crawl (feeds many models)
  "cohere-ai",
  "Meta-ExternalAgent",
];

/**
 * True when we're serving from a temporary host rather than the real site.
 *
 * A preview deploy must never be indexed. It would compete with the real domain
 * for the same content, and every page on it carries a canonical pointing at
 * whatever NEXT_PUBLIC_SITE_URL says — so a crawler either indexes a throwaway
 * address or follows a canonical to a domain that may not exist yet.
 *
 * Deliberately keyed off the configured site URL rather than a separate flag:
 * not yet having a real domain IS the signal that this isn't the live site, so
 * indexing switches itself on the moment one is pointed at the app. There is no
 * toggle to forget.
 */
export function isPreviewHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return true; // an unparseable site URL is not a site we should be indexing
  }
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".railway.app") ||
    hostname.endsWith(".up.railway.app") ||
    hostname.endsWith(".vercel.app") ||
    hostname.endsWith(".onrender.com")
  );
}

// Crawlers may index the marketing/entry/knowledge pages but not the private app
// tools — unless we're on a preview host, in which case nothing is indexable.
export default function robots(): MetadataRoute.Robots {
  if (isPreviewHost(SITE_URL)) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
