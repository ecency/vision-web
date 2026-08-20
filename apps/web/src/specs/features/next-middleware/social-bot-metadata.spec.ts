import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { handleCategoryEntryRedirect } from "@/features/next-middleware";

const REDDITBOT = "Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)";

function requestFor(rawPath: string, userAgent: string): NextRequest {
  return new NextRequest(`https://ecency.com${rawPath}`, { headers: { "user-agent": userAgent } });
}

/**
 * Social crawlers read a post's card off the canonical page, whose metadata is
 * rendered blocking for them by `htmlLimitedBots` (next.config.js). A rewrite to
 * a separate /redditbot page used to sit in the middleware; it was unreachable
 * for years' worth of shared links and has been removed. These pin the two facts
 * that made it unreachable, so a future change cannot quietly resurrect the
 * assumption that crawlers are served from a second, hand-maintained page.
 */
describe("social crawler routing", () => {
  it("308s a crawler on a category-prefixed post URL onto the canonical, like any visitor", () => {
    // The redirect runs ahead of anything UA-specific, so a crawler never gets
    // to a per-bot branch on this URL form.
    const res = handleCategoryEntryRedirect(requestFor("/hive-125125/@alice/a-post", REDDITBOT));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(308);
    expect(new URL(res!.headers.get("location")!, "https://ecency.com").pathname).toBe(
      "/@alice/a-post"
    );
  });

  it("leaves the bare canonical post URL alone for a crawler", () => {
    // The bare form is what og:url, the canonical tag and every share link use,
    // and it is served as the ordinary page. Nothing rewrites it.
    expect(handleCategoryEntryRedirect(requestFor("/@alice/a-post", REDDITBOT))).toBeNull();
  });

  it("declares the social crawlers that must receive blocking metadata", async () => {
    // og tags have to be in <head> when the response reaches the crawler: these
    // agents do not execute JS, so streamed metadata would arrive too late.
    const { htmlLimitedBots } = await import("../../../../next.config.js").then(
      (m) => (m.default ?? m) as { htmlLimitedBots: RegExp }
    );
    // Every agent the removed rewrite used to catch, so nothing silently loses
    // its card. TelegramBot was missing from this list when the rewrite was
    // removed, which meant it was already getting streamed metadata it cannot
    // read; it is in the list now.
    for (const agent of [
      "redditbot",
      "Twitterbot",
      "facebookexternalhit",
      "Discordbot",
      "TelegramBot",
      "LinkedInBot",
      "Slackbot",
      "WhatsApp"
    ]) {
      expect(new RegExp(htmlLimitedBots, "i").test(agent), `${agent} must get blocking metadata`).toBe(
        true
      );
    }
  });

  it("gives Google's indexing crawlers blocking metadata and keeps browsers streaming", async () => {
    // Googlebot executes JS and reads a streamed title or robots tag, but it
    // does not register a rel=canonical that arrives in the body: URL
    // Inspection shows no user-declared canonical for streamed pages and a
    // populated one for pages whose metadata lands in <head>. So the indexer
    // and the console's live-test agent both get the blocking render. A real
    // browser must not: blocking metadata would cost every visitor the
    // streamed shell, which is why the list is an allowlist of crawlers and
    // not a "render everything in head" switch.
    const { htmlLimitedBots } = await import("../../../../next.config.js").then(
      (m) => (m.default ?? m) as { htmlLimitedBots: RegExp }
    );
    const re = new RegExp(htmlLimitedBots, "i");
    for (const agent of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/126.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)"
    ]) {
      expect(re.test(agent), `${agent} must get blocking metadata`).toBe(true);
    }
    for (const agent of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
    ]) {
      expect(re.test(agent), `${agent} must keep streaming metadata`).toBe(false);
    }
  });

  /**
   * The origin nginx SSR cache puts this same UA class in its `proxy_cache_key`
   * (`$html_limited_bot`), so the two lists have to agree. When they drift, a
   * page primed by a browser is served to a crawler from the wrong cache
   * namespace with streamed metadata, and the setting silently stops working.
   * It is invisible in dev, where nothing is cached, which is exactly why this
   * belongs in the suite rather than in a reviewer's memory. See
   * docs/cache/nginx.md and issue #1257.
   */
  it("keeps the nginx cache-key bot map in step with htmlLimitedBots", async () => {
    const { htmlLimitedBots } = await import("../../../../next.config.js").then(
      (m) => (m.default ?? m) as { htmlLimitedBots: RegExp }
    );
    const doc = readFileSync(join(process.cwd(), "../../docs/cache/nginx.md"), "utf-8");
    const map = doc.match(/\$html_limited_bot\s*\{[^}]*"~\*\(([^)]+)\)"/);
    expect(map, "the $html_limited_bot map is missing from docs/cache/nginx.md").not.toBeNull();

    const inNginx = new Set(map![1].split("|").map((s) => s.trim()));
    const inNext = new Set(htmlLimitedBots.source.split("|").map((s) => s.trim()));

    expect([...inNext].filter((a) => !inNginx.has(a)), "in next.config but not nginx").toEqual([]);
    expect([...inNginx].filter((a) => !inNext.has(a)), "in nginx but not next.config").toEqual([]);
  });
});
