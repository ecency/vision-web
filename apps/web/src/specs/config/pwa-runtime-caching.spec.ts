// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rules: Array<{ urlPattern: RegExp; options?: { cacheName?: string } }> = require(
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
});
