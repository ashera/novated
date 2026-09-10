import { describe, it, expect } from "vitest";
import { classifyBot } from "../lib/botDetect";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("classifyBot", () => {
  it("treats a normal desktop/mobile browser as human", () => {
    expect(classifyBot(CHROME).isBot).toBe(false);
    expect(classifyBot(SAFARI_IOS).isBot).toBe(false);
  });

  it("flags navigator.webdriver regardless of UA", () => {
    const v = classifyBot(CHROME, { webdriver: true });
    expect(v.isBot).toBe(true);
    expect(v.reason).toBe("navigator.webdriver");
  });

  it("flags headless browsers by UA", () => {
    expect(classifyBot("Mozilla/5.0 ... HeadlessChrome/120.0 ...").isBot).toBe(true);
  });

  it("flags known crawlers and AI bots", () => {
    for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "GPTBot/1.0", "ClaudeBot", "facebookexternalhit/1.1"]) {
      expect(classifyBot(ua).isBot, ua).toBe(true);
    }
  });

  it("flags http tools and a missing UA", () => {
    expect(classifyBot("curl/8.4.0").isBot).toBe(true);
    expect(classifyBot("python-requests/2.31").isBot).toBe(true);
    expect(classifyBot("").isBot).toBe(true);
    expect(classifyBot(null).reason).toBe("no user agent");
  });
});
