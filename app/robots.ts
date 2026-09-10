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

// Crawlers may index the marketing/entry/knowledge pages but not the private app tools.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
