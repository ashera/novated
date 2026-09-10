// Heuristic bot classification for anonymous visitors. Pure + isomorphic (no
// server-only, no deps) so it's usable from the tracking action, the admin, and the
// deploy-time backfill script. Note: our tracking fires from client-side JS, so
// non-JS bots (curl, most crawlers, link unfurlers) never reach here at all — this
// catches the JS-capable ones: headless automation and JS-rendering crawlers.

// Self-identifying bots / automation / tools, matched case-insensitively in the UA.
const BOT_UA = new RegExp(
  [
    "bot", "crawl", "spider", "slurp", // generic
    "headless", "phantomjs", "puppeteer", "playwright", "selenium", "webdriver", // automation
    "python-requests", "python-urllib", "aiohttp", "httpx", "go-http-client", "okhttp",
    "java/", "libwww", "curl", "wget", "scrapy", // http libraries / tools
    "googlebot", "bingbot", "yandex", "baiduspider", "duckduckbot", "ahrefs", "semrush",
    "mj12bot", "dotbot", "petalbot", "applebot", "amazonbot", "bytespider", // search / SEO
    "gptbot", "chatgpt", "claudebot", "claude-web", "anthropic", "ccbot", "google-extended",
    "perplexity", "cohere", "diffbot", // AI crawlers
    "facebookexternalhit", "facebot", "twitterbot", "slackbot", "discordbot", "telegrambot",
    "whatsapp", "linkedinbot", "embedly", "pinterest", "redditbot", // link unfurlers
    "lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptimerobot", "statuscake", "monitor", // tooling
  ].join("|"),
  "i",
);

export interface BotVerdict {
  isBot: boolean;
  reason: string | null;
}

/** Classify a visitor as a likely bot from its user-agent and (if known) the
 *  client-reported navigator.webdriver flag. */
export function classifyBot(
  userAgent: string | null | undefined,
  opts: { webdriver?: boolean } = {},
): BotVerdict {
  if (opts.webdriver) return { isBot: true, reason: "navigator.webdriver" };
  const ua = (userAgent || "").trim();
  if (!ua) return { isBot: true, reason: "no user agent" };
  const m = ua.match(BOT_UA);
  if (m) return { isBot: true, reason: `ua: ${m[0].toLowerCase()}` };
  return { isBot: false, reason: null };
}
