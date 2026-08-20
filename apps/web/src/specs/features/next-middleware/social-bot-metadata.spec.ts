import { describe, expect, it } from "vitest";
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
});
