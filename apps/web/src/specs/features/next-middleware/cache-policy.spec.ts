import { describe, expect, it } from "vitest";
import {
  buildCacheControlHeader,
  getCachePolicyForPath,
  getEntryTierForAge,
  isUserSpecificForLoggedIn,
  parseEntryUrl
} from "@/features/next-middleware";

const DAY = 86400_000;

describe("getCachePolicyForPath", () => {
  describe("no-cache paths", () => {
    it.each([
      "/publish",
      "/publish/entry/@alice/hello",
      "/auth",
      "/auth/keychain-sign",
      "/signup",
      "/submit",
      "/draft",
      "/wallet",
      "/wallet/hive",
      "/market",
      "/purchase",
      "/onboard-friend"
    ])("returns no-cache tier for %s", (path) => {
      const policy = getCachePolicyForPath(path);
      expect(policy).toEqual({ tier: "no-cache", sMaxAge: 0, staleWhileRevalidate: 0 });
    });

    it.each([
      "/@alice/wallet",
      "/@alice/settings",
      "/@alice/permissions",
      "/@alice/referrals",
      "/@alice/insights"
    ])("returns no-cache for sensitive profile section %s", (path) => {
      const policy = getCachePolicyForPath(path);
      expect(policy?.tier).toBe("no-cache");
    });
  });

  describe("static pages nested under a dynamic prefix", () => {
    it("matches /curation/guide as static before the /curation prefix", () => {
      expect(getCachePolicyForPath("/curation/guide")).toEqual({
        tier: "static",
        sMaxAge: 86400,
        staleWhileRevalidate: 604800
      });
    });
  });

  describe("dynamic-page tier (anonymous-equivalent SSR, 60s)", () => {
    it.each([
      "/chats",
      "/chats/general",
      "/decks",
      "/decks/main",
      "/waves",
      "/waves/@alice/wave-1",
      "/perks",
      "/perks/promote-post",
      "/search",
      "/search?q=hive",
      "/curation",
      "/curation/marks",
      "/curation/recommendations"
    ])("returns dynamic-page tier for %s", (path) => {
      const policy = getCachePolicyForPath(path);
      expect(policy).toEqual({ tier: "dynamic-page", sMaxAge: 60, staleWhileRevalidate: 300 });
    });
  });

  describe("static pages", () => {
    it.each([
      "/faq",
      "/about",
      "/child-safety",
      "/contributors",
      "/privacy-policy",
      "/terms-of-service",
      "/whitepaper",
      "/mobile",
      "/honeyback-about",
      "/honeyback-privacy"
    ])("returns static tier for %s", (path) => {
      const policy = getCachePolicyForPath(path);
      expect(policy).toEqual({ tier: "static", sMaxAge: 86400, staleWhileRevalidate: 604800 });
    });
  });

  describe("homepage", () => {
    it("returns home tier for /", () => {
      const policy = getCachePolicyForPath("/");
      expect(policy).toEqual({ tier: "home", sMaxAge: 300, staleWhileRevalidate: 3600 });
    });
  });

  describe("list pages", () => {
    it.each([
      ["/discover", "list"],
      ["/communities", "list"],
      ["/witnesses", "list"],
      ["/tags", "list"]
    ])("returns list tier for %s", (path, tier) => {
      const policy = getCachePolicyForPath(path);
      expect(policy?.tier).toBe(tier);
      expect(policy?.sMaxAge).toBe(300);
      expect(policy?.staleWhileRevalidate).toBe(3600);
    });

    it("returns list-proposals tier with longer s-maxage", () => {
      const policy = getCachePolicyForPath("/proposals");
      expect(policy).toEqual({ tier: "list-proposals", sMaxAge: 600, staleWhileRevalidate: 3600 });
    });
  });

  describe("feed pages", () => {
    it.each(["/hot", "/trending", "/payout", "/muted", "/promoted"])(
      "returns feed tier for %s",
      (path) => {
        const policy = getCachePolicyForPath(path);
        expect(policy).toEqual({ tier: "feed", sMaxAge: 60, staleWhileRevalidate: 300 });
      }
    );

    it("returns feed-created tier for /created (shorter TTL)", () => {
      const policy = getCachePolicyForPath("/created");
      expect(policy).toEqual({ tier: "feed-created", sMaxAge: 30, staleWhileRevalidate: 120 });
    });

    it("returns feed-created tier for /tags/:tag (rewrites to created)", () => {
      const policy = getCachePolicyForPath("/tags/photography");
      expect(policy).toEqual({ tier: "feed-created", sMaxAge: 30, staleWhileRevalidate: 120 });
    });

    it("handles tag filter: /hot/photography", () => {
      const policy = getCachePolicyForPath("/hot/photography");
      expect(policy?.tier).toBe("feed");
    });

    it("handles nested filter: /hot/photography/hive-123456", () => {
      const policy = getCachePolicyForPath("/hot/photography/hive-123456");
      expect(policy?.tier).toBe("feed");
    });
  });

  describe("community pages", () => {
    it("returns community tier for /:tag/hive-xxxxx", () => {
      const policy = getCachePolicyForPath("/photography/hive-123456");
      expect(policy).toEqual({ tier: "community", sMaxAge: 60, staleWhileRevalidate: 300 });
    });

    it("returns community tier for community with sub", () => {
      const policy = getCachePolicyForPath("/photography/hive-123456/hot");
      expect(policy?.tier).toBe("community");
    });
  });

  describe("profile pages", () => {
    it("returns profile tier for /@alice", () => {
      const policy = getCachePolicyForPath("/@alice");
      expect(policy).toEqual({ tier: "profile", sMaxAge: 300, staleWhileRevalidate: 3600 });
    });

    it.each(["posts", "blog", "comments", "replies", "communities", "followers", "following"])(
      "returns profile tier for /@alice/%s",
      (section) => {
        const policy = getCachePolicyForPath(`/@alice/${section}`);
        expect(policy?.tier).toBe("profile");
      }
    );

    it.each(["feed", "trail"])(
      "returns profile-feed tier for /@alice/%s (aggregates content from other users)",
      (section) => {
        const policy = getCachePolicyForPath(`/@alice/${section}`);
        expect(policy).toEqual({ tier: "profile-feed", sMaxAge: 60, staleWhileRevalidate: 300 });
      }
    );

    it.each(["followers", "following"])(
      "does not treat /@alice/%s as an entry page (viewer-independent profile tier)",
      (section) => {
        // Regression: a 2-segment /@author/<section> must not fall through to
        // the entry tier (which would cache a follower list as a post for 1h).
        // SSR is viewer-independent, so it gets the cacheable profile tier.
        const policy = getCachePolicyForPath(`/@alice/${section}`);
        expect(policy).toEqual({ tier: "profile", sMaxAge: 300, staleWhileRevalidate: 3600 });
      }
    );
  });

  describe("entry pages", () => {
    it("returns entry tier for /:category/@author/:permlink", () => {
      const policy = getCachePolicyForPath("/photography/@alice/my-post");
      expect(policy).toEqual({ tier: "entry", sMaxAge: 3600, staleWhileRevalidate: 86400 });
    });

    it("returns entry tier for short /@author/:permlink", () => {
      const policy = getCachePolicyForPath("/@alice/my-post-slug");
      expect(policy).toEqual({ tier: "entry", sMaxAge: 3600, staleWhileRevalidate: 86400 });
    });

    it("returns entry tier for /:category/@author/:permlink/:sub", () => {
      const policy = getCachePolicyForPath("/photography/@alice/my-post/comments");
      expect(policy?.tier).toBe("entry");
    });
  });

  describe("unmatched paths", () => {
    it("returns null for API routes", () => {
      expect(getCachePolicyForPath("/api/healthcheck")).toBeNull();
    });

    it("returns null for _next internals", () => {
      expect(getCachePolicyForPath("/_next/static/abc.js")).toBeNull();
    });

    it("returns null for /assets/* (handled by next.config.js)", () => {
      expect(getCachePolicyForPath("/assets/logo.svg")).toBeNull();
    });
  });

  describe("trailing slash normalization", () => {
    it("treats /discover/ the same as /discover", () => {
      expect(getCachePolicyForPath("/discover/")).toEqual(getCachePolicyForPath("/discover"));
    });

    it("does not collapse root /", () => {
      expect(getCachePolicyForPath("/")?.tier).toBe("home");
    });
  });

  describe("query string normalization", () => {
    it("strips query string before matching (e.g. /search?q=hive)", () => {
      expect(getCachePolicyForPath("/search?q=hive")).toEqual(
        getCachePolicyForPath("/search")
      );
    });

    it("strips query string for no-cache prefixes too", () => {
      expect(getCachePolicyForPath("/publish?ref=foo")).toEqual(
        getCachePolicyForPath("/publish")
      );
    });

    it("strips query string for entry pages", () => {
      expect(getCachePolicyForPath("/photography/@alice/my-post?utm=x")).toEqual(
        getCachePolicyForPath("/photography/@alice/my-post")
      );
    });
  });
});

describe("buildCacheControlHeader", () => {
  it("emits public s-maxage + swr for anonymous users", () => {
    const header = buildCacheControlHeader(
      { tier: "list", sMaxAge: 300, staleWhileRevalidate: 3600 },
      false
    );
    expect(header).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
  });

  it("emits public s-maxage + swr for logged-in users on auth-class-equivalent tiers", () => {
    // profile, list, entry, community, static, home — SSR is the same for
    // anon and any-logged-in user, so logged-in shares the cache (worker
    // keys it under #auth=loggedin separately from #auth=anon).
    const header = buildCacheControlHeader(
      { tier: "list", sMaxAge: 300, staleWhileRevalidate: 3600 },
      true
    );
    expect(header).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
  });

  it.each(["feed", "feed-created", "profile-feed"])(
    "emits private no-store for logged-in users on %s tier (mute filter)",
    (tier) => {
      const header = buildCacheControlHeader(
        { tier, sMaxAge: 60, staleWhileRevalidate: 300 },
        true
      );
      expect(header).toBe("private, no-store");
    }
  );

  it.each(["feed", "feed-created", "profile-feed"])(
    "still emits public for anonymous users on %s tier",
    (tier) => {
      const header = buildCacheControlHeader(
        { tier, sMaxAge: 60, staleWhileRevalidate: 300 },
        false
      );
      expect(header).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    }
  );

  it("emits private no-store for no-cache tier even anonymous", () => {
    const header = buildCacheControlHeader(
      { tier: "no-cache", sMaxAge: 0, staleWhileRevalidate: 0 },
      false
    );
    expect(header).toBe("private, no-store");
  });

  it("emits private no-store for no-cache tier when logged-in", () => {
    const header = buildCacheControlHeader(
      { tier: "no-cache", sMaxAge: 0, staleWhileRevalidate: 0 },
      true
    );
    expect(header).toBe("private, no-store");
  });
});

describe("isUserSpecificForLoggedIn", () => {
  it.each(["feed", "feed-created", "profile-feed"])(
    "returns true for %s tier when logged-in",
    (tier) => {
      expect(
        isUserSpecificForLoggedIn({ tier, sMaxAge: 60, staleWhileRevalidate: 300 }, true)
      ).toBe(true);
    }
  );

  it.each(["feed", "feed-created", "profile-feed"])(
    "returns false for %s tier when anonymous",
    (tier) => {
      expect(
        isUserSpecificForLoggedIn({ tier, sMaxAge: 60, staleWhileRevalidate: 300 }, false)
      ).toBe(false);
    }
  );

  it.each(["profile", "entry", "list", "community", "static", "home", "no-cache"])(
    "returns false for %s tier even when logged-in (auth-class-equivalent)",
    (tier) => {
      expect(
        isUserSpecificForLoggedIn({ tier, sMaxAge: 60, staleWhileRevalidate: 300 }, true)
      ).toBe(false);
    }
  );
});

describe("getEntryTierForAge", () => {
  it("returns entry-fresh for posts under 1 day old", () => {
    expect(getEntryTierForAge(0)).toEqual({
      tier: "entry-fresh",
      sMaxAge: 60,
      staleWhileRevalidate: 300
    });
    expect(getEntryTierForAge(DAY - 1)).toEqual({
      tier: "entry-fresh",
      sMaxAge: 60,
      staleWhileRevalidate: 300
    });
  });

  it("returns entry-week for posts 1-7 days old", () => {
    expect(getEntryTierForAge(DAY)).toEqual({
      tier: "entry-week",
      sMaxAge: 3600,
      staleWhileRevalidate: 86400
    });
    expect(getEntryTierForAge(6 * DAY)).toEqual({
      tier: "entry-week",
      sMaxAge: 3600,
      staleWhileRevalidate: 86400
    });
  });

  it("returns entry-month for posts 7-30 days old", () => {
    expect(getEntryTierForAge(7 * DAY)).toEqual({
      tier: "entry-month",
      sMaxAge: 86400,
      staleWhileRevalidate: 604800
    });
    expect(getEntryTierForAge(29 * DAY)).toEqual({
      tier: "entry-month",
      sMaxAge: 86400,
      staleWhileRevalidate: 604800
    });
  });

  it("returns entry-archive for posts 30-60 days old", () => {
    expect(getEntryTierForAge(30 * DAY)).toEqual({
      tier: "entry-archive",
      sMaxAge: 2592000,
      staleWhileRevalidate: 604800
    });
    expect(getEntryTierForAge(59 * DAY)).toEqual({
      tier: "entry-archive",
      sMaxAge: 2592000,
      staleWhileRevalidate: 604800
    });
  });

  it("returns entry-ancient for posts over 60 days old", () => {
    expect(getEntryTierForAge(60 * DAY)).toEqual({
      tier: "entry-ancient",
      sMaxAge: 2592000,
      staleWhileRevalidate: 5184000
    });
    expect(getEntryTierForAge(365 * DAY)).toEqual({
      tier: "entry-ancient",
      sMaxAge: 2592000,
      staleWhileRevalidate: 5184000
    });
  });

  it("treats negative age (future-dated) as fresh", () => {
    expect(getEntryTierForAge(-1000).tier).toBe("entry-fresh");
  });
});

describe("parseEntryUrl", () => {
  it("parses /:category/@author/:permlink", () => {
    expect(parseEntryUrl("/photography/@alice/my-post")).toEqual({
      author: "alice",
      permlink: "my-post"
    });
  });

  it("parses /:category/@author/:permlink/:sub", () => {
    expect(parseEntryUrl("/photography/@alice/my-post/comments")).toEqual({
      author: "alice",
      permlink: "my-post"
    });
  });

  it("parses /@author/:permlink (short form)", () => {
    expect(parseEntryUrl("/@alice/my-post-slug")).toEqual({
      author: "alice",
      permlink: "my-post-slug"
    });
  });

  it("returns null for profile root /@author", () => {
    expect(parseEntryUrl("/@alice")).toBeNull();
  });

  it.each([
    "posts",
    "blog",
    "comments",
    "replies",
    "communities",
    "insights",
    "rss",
    "wallet",
    "settings",
    "feed",
    "trail",
    "followers",
    "following"
  ])("returns null for profile section /@alice/%s", (section) => {
    expect(parseEntryUrl(`/@alice/${section}`)).toBeNull();
  });

  it("returns null for non-entry paths", () => {
    expect(parseEntryUrl("/discover")).toBeNull();
    expect(parseEntryUrl("/")).toBeNull();
    expect(parseEntryUrl("/hot/photography")).toBeNull();
  });

  it("handles trailing slash", () => {
    expect(parseEntryUrl("/photography/@alice/my-post/")).toEqual({
      author: "alice",
      permlink: "my-post"
    });
  });
});
