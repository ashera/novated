import type { MetadataRoute } from "next";
import { headers } from "next/headers";
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
 * True when the CONFIGURED site URL is a temporary host rather than a real one.
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

/**
 * Whether the request that asked for robots.txt should be told to index.
 *
 * Two conditions, and the second is the one that took a live domain to expose.
 * Checking only the configured site URL answers "do we have a real domain
 * yet" — which was the whole question while we didn't. The moment one is set,
 * that check passes for EVERY host the app answers on, including the platform
 * URL it is still reachable at and every future preview deploy. Each of those
 * then serves a cheerful "Allow: /" for a full copy of the site.
 *
 * So the real test is whether this request arrived at the canonical host. It
 * is also self-maintaining in a way the suffix list isn't: a host nobody
 * thought to add to the list still fails it, because the list of addresses
 * that are the real site has exactly one entry.
 *
 * Fails closed on anything it can't read. A day of not being indexed costs
 * nothing; a duplicate origin in the index costs weeks.
 */
export function shouldIndex(requestHost: string | null | undefined, siteUrl: string): boolean {
  if (isPreviewHost(siteUrl)) return false;
  let canonical: string;
  try {
    canonical = new URL(siteUrl).host.toLowerCase();
  } catch {
    return false;
  }
  const host = (requestHost ?? "").trim().toLowerCase();
  return host !== "" && host === canonical;
}

// Crawlers may index the marketing/entry/knowledge pages but not the private app
// tools — unless this isn't the canonical host, in which case nothing is.
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Behind Railway's proxy the original host arrives as x-forwarded-host; the
  // Host header is the fallback for a direct hit. Spoofing either can only
  // produce a stricter robots.txt in the spoofer's own response, never a
  // laxer one — asking as the canonical host is the same as asking the
  // canonical host.
  const h = await headers();
  if (!shouldIndex(h.get("x-forwarded-host") ?? h.get("host"), SITE_URL)) {
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
