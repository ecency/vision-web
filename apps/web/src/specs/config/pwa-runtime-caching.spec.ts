// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { ACCOUNT_API_PREFIXES } from "@/core/pwa-account-cache";

const require = createRequire(import.meta.url);
const rules: Array<{ urlPattern: RegExp; handler?: string; options?: { cacheName?: string } }> = require(
  "../../../pwa-runtime-caching.js"
);

const APP_ORIGIN = "https://ecency.com";

/** The rule Workbox would pick for a URL: its RegExpRoute matches a cross-origin
 * URL only when the pattern matches from the very start of the href. */
function ruleFor(href: string) {
  const url = new URL(href);
  return rules.find((rule) => {
    const pattern = new RegExp(rule.urlPattern.source, rule.urlPattern.flags.replace("g", ""));
    const match = pattern.exec(url.href);
    if (!match) return false;
    return url.origin === APP_ORIGIN || match.index === 0;
  });
}

describe("service worker runtime caching", () => {
  // Post images and avatars load through <img> without CORS, so the service worker
  // only ever sees an opaque response and cannot tell a 200 from a 503. A rule that
  // caches these would keep an error showing as a broken image for days. Left to the
  // browser's HTTP cache, a good image is still kept (the image hosts send long-lived
  // cache headers) and an error is not.
  it.each([
    "https://i.ecency.com/p/2bP4pJr4wVimqCWjYimXJe2cnCgnK7?format=match&mode=fit&width=640",
    "https://images.ecency.com/u/good-karma/avatar/small",
    "https://img.ecency.com/DQmTest/image.png",
    "https://images.ecency.com/webp/0x0/https://example.com/photo.jpg"
  ])("leaves image host requests to the browser: %s", (href) => {
    expect(ruleFor(href)).toBeUndefined();
  });

  it("still caches the app's own static images and data", () => {
    expect(ruleFor(`${APP_ORIGIN}/assets/logo.png`)?.options?.cacheName).toBe("local-images");
    expect(ruleFor(`${APP_ORIGIN}/geo/cities.json`)?.options?.cacheName).toBe("ecency-geo-data");
  });

  // #2023: the generic /api rule answered a slow or failed chat request from
  // its cache, keyed by URL only, so after an account switch the badge and
  // channel list could show the previous account's chat.
  it.each([
    "/api/mattermost/channels/unreads",
    "/api/mattermost/channels",
    "/api/mattermost/me",
    "/api/mattermost/channels/c1/posts?per_page=30"
  ])("never caches chat API answers: %s", (path) => {
    const rule = ruleFor(`${APP_ORIGIN}${path}`);
    expect(rule?.handler).toBe("NetworkOnly");
    expect(rule?.options?.cacheName).toBeUndefined();
  });

  // #2084: the newsletter routes resolve the account server side while the
  // URL does not name it. The token routes' GET inspects the current state,
  // which a cached copy would hide once confirmed.
  it.each([
    "/api/newsletter/subscriptions",
    "/api/newsletter/sender?type=blog&target=alice",
    "/api/newsletter/issues?type=blog&target=alice",
    "/api/newsletter/posts?type=blog&target=alice&limit=20",
    "/api/newsletter/confirm/abc123",
    "/api/newsletter/unsubscribe/abc123"
  ])("never caches newsletter API answers: %s", (path) => {
    const rule = ruleFor(`${APP_ORIGIN}${path}`);
    expect(rule?.handler).toBe("NetworkOnly");
    expect(rule?.options?.cacheName).toBeUndefined();
  });

  it("serves every route whose cached answers an account switch drops NetworkOnly", () => {
    for (const prefix of ACCOUNT_API_PREFIXES) {
      expect(ruleFor(`${APP_ORIGIN}${prefix}x`)?.handler).toBe("NetworkOnly");
    }
  });

  it("keeps the generic API cache for other routes", () => {
    expect(ruleFor(`${APP_ORIGIN}/api/oembed?url=x`)?.options?.cacheName).toBe("ecency-api");
  });
});
