/**
 * Cache policy resolution for HTML responses.
 *
 * Returns the Cache-Control tier that should be applied to a given pathname,
 * or null if no policy applies (middleware will leave the response untouched).
 *
 * Entry (post) pages use a conservative default tier derived from URL alone.
 * When the post's created date is known (via post-age-cache), the tier is
 * refined by age — see `getEntryTierForAge` and `post-age-cache.ts`.
 *
 * All TTLs are expressed for shared caches (Nginx, Cloudflare):
 *   - max-age=0          → browsers always revalidate HTML
 *   - s-maxage=N         → CDN serves fresh for N seconds
 *   - stale-while-revalidate=M → CDN serves stale for M more seconds
 *                                while revalidating in background
 */

export interface CachePolicy {
  tier: string;
  sMaxAge: number;
  staleWhileRevalidate: number;
}

const NO_CACHE_TIER = "no-cache";

/**
 * Routes that must never be edge-cached.
 *
 * These either render user-specific content server-side (drafts, wallet
 * balances) or are inherently interactive/transactional (auth flows, market
 * trading) where stale HTML could mislead the user.
 *
 * Routes that look interactive but actually render an auth-class-equivalent
 * scaffold (with dynamic content hydrated client-side) are NOT here — they
 * use the `dynamic-page` tier instead. See DYNAMIC_PAGE_PREFIXES below.
 */
const NO_CACHE_PREFIXES = [
  "/publish", // user's drafts, in-progress content
  "/auth", // authentication redirect flows
  "/signup", // signup form state
  "/submit", // post-submission form state
  "/draft", // user-specific drafts
  "/onboard-friend", // referral flow
  "/purchase", // payment flow
  "/market", // trading interactive UI
  "/wallet" // user-specific balances
];

/**
 * Routes that render an anonymous-equivalent scaffold server-side and
 * hydrate dynamic content client-side. Empirically verified that SSR HTML
 * is byte-identical across anon, user1, user2 (route handlers don't read
 * cookies; data fetched via React Query after hydration).
 *
 * Cached at 60s shared TTL — addresses the bulk of 504s historically caused
 * by these routes saturating origin SSR (they were ~50% of post-deploy 504s
 * because every request hit origin).
 *
 * - `/chats`  — Mattermost-backed messaging shell; channel/message data
 *               loads client-side per user
 * - `/decks`  — TweetDeck-style multi-feed UI; column content loads
 *               client-side
 * - `/waves`  — Hive waves (short-form posts) feed
 * - `/perks`  — Subscription perks page; mostly static
 * - `/search` — Search results; query is in the URL so different queries
 *               get different cache entries automatically
 * - `/curation` — Curation desk; the server shell is anonymous-equivalent and
 *               the queue, marks and recommendations load client-side. The
 *               guide under it is static and matched explicitly below.
 */
const DYNAMIC_PAGE_PREFIXES = ["/chats", "/decks", "/waves", "/perks", "/search", "/curation"];

/**
 * Static pages that live UNDER a dynamic prefix. They have to be matched before
 * the prefix loop, because `STATIC_PAGES` is only consulted after it.
 */
const STATIC_UNDER_DYNAMIC = new Set(["/curation/guide"]);

/**
 * Profile subsections that must never be edge-cached.
 *
 * `insights` is here because the route handler reads `active_user` to render
 * owner-only stats (see profile/[username]/insights/page.tsx), so the SSR
 * differs for the profile owner vs everyone else. Sharing the cache entry
 * across logged-in users would leak the owner-only sections to other viewers.
 */
const NO_CACHE_PROFILE_SECTIONS = new Set([
  "wallet",
  "settings",
  "permissions",
  "referrals",
  "insights"
]);

/**
 * Profile subsections that aggregate content from OTHER users (not the
 * profile owner's authored content). Update faster than profile-owned
 * sections and get the feed tier instead of the profile tier.
 *
 * - `feed`  rewrites to the personalized feed route (/feed/feed/:author),
 *           which falls back to the ecency observer for anonymous viewers.
 *           Content is deterministic per URL for anon, but it's a feed of
 *           posts from followed users and should refresh on feed cadence.
 * - `trail` shows the user's curation trail (votes on others' posts),
 *           which also updates faster than authored content.
 *
 * NOTE: `followers`/`following` are NOT here — their SSR is viewer-independent
 * (the list hydrates client-side; only the owner's follow counts render on the
 * server), so they use the auth-class-equivalent `profile` tier and can share
 * an edge-cache entry across logged-in users, exactly like posts/blog.
 */
const PROFILE_FEED_SECTIONS = new Set(["feed", "trail"]);

/** Static content pages — effectively permanent. */
const STATIC_PAGES = new Set([
  "/faq",
  "/about",
  "/child-safety",
  "/contributors",
  "/creator-economy",
  "/privacy-policy",
  "/honeyback-about",
  "/honeyback-privacy",
  "/terms-of-service",
  "/whitepaper",
  "/mobile"
]);

const FEED_FILTERS = new Set(["hot", "created", "trending", "payout", "muted", "promoted"]);

/**
 * Cache tiers whose SSR is filtered by the logged-in user's mute list (via
 * `observer` in feed/[...sections]/page.tsx). Different logged-in users see
 * different filtered feeds, so these tiers must stay private when isLoggedIn.
 *
 * All other tiers are auth-class-equivalent (anon vs any-logged-in-user) per
 * empirical sweep across 26 page types — they can share an edge cache entry
 * across logged-in users.
 */
const USER_SPECIFIC_TIERS_WHEN_LOGGED_IN = new Set([
  "feed", // /:filter (hot, trending, payout, muted, promoted)
  "feed-created", // /:filter where filter is "created", and tag feeds
  "profile-feed" // /@author/feed and /@author/trail
]);

/**
 * True when this policy's SSR depends on the logged-in user's identity (today
 * only the mute-filter feed tiers). Exposed for middleware observability and
 * potential reuse in the CF worker / nginx layers.
 */
export function isUserSpecificForLoggedIn(policy: CachePolicy, isLoggedIn: boolean): boolean {
  return isLoggedIn && USER_SPECIFIC_TIERS_WHEN_LOGGED_IN.has(policy.tier);
}

export function getCachePolicyForPath(pathname: string): CachePolicy | null {
  // Normalize for consistent matching:
  //   - Strip query string (callers usually pass `nextUrl.pathname` which has none,
  //     but be defensive — `/search?q=...` should still match the `/search` prefix).
  //   - Strip trailing slash (except for root).
  const queryIdx = pathname.indexOf("?");
  const noQuery = queryIdx >= 0 ? pathname.slice(0, queryIdx) : pathname;
  const path = noQuery.length > 1 && noQuery.endsWith("/") ? noQuery.slice(0, -1) : noQuery;

  // Never cache API routes, Next internals, or assets (those are handled in next.config.js).
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    path.startsWith("/assets/") ||
    path.startsWith("/scripts/")
  ) {
    return null;
  }

  // No-cache paths (user-specific / interactive).
  for (const prefix of NO_CACHE_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      return { tier: NO_CACHE_TIER, sMaxAge: 0, staleWhileRevalidate: 0 };
    }
  }

  // Static pages nested under a dynamic prefix (the curation guide).
  if (STATIC_UNDER_DYNAMIC.has(path)) {
    return { tier: "static", sMaxAge: 86400, staleWhileRevalidate: 604800 };
  }

  // Dynamic pages: anonymous-equivalent SSR with client-hydrated content.
  // 60s/300s lets us absorb thundering-herd spikes on these routes (which
  // historically saturated origin and produced ~50% of 504s) while still
  // refreshing dynamic content frequently.
  for (const prefix of DYNAMIC_PAGE_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      return { tier: "dynamic-page", sMaxAge: 60, staleWhileRevalidate: 300 };
    }
  }

  // Static content pages.
  if (STATIC_PAGES.has(path)) {
    return { tier: "static", sMaxAge: 86400, staleWhileRevalidate: 604800 };
  }

  // Homepage.
  if (path === "/") {
    return { tier: "home", sMaxAge: 300, staleWhileRevalidate: 3600 };
  }

  // List pages.
  if (path === "/discover" || path.startsWith("/discover/")) {
    return { tier: "list", sMaxAge: 300, staleWhileRevalidate: 3600 };
  }
  if (path === "/communities") {
    return { tier: "list", sMaxAge: 300, staleWhileRevalidate: 3600 };
  }
  if (path === "/witnesses") {
    return { tier: "list", sMaxAge: 300, staleWhileRevalidate: 3600 };
  }
  if (path === "/proposals" || path.startsWith("/proposals/")) {
    return { tier: "list-proposals", sMaxAge: 600, staleWhileRevalidate: 3600 };
  }
  if (path === "/tags") {
    return { tier: "list", sMaxAge: 300, staleWhileRevalidate: 3600 };
  }
  // /tags/:tag rewrites to /feed/created/:tag — treat as created-feed
  if (path.startsWith("/tags/")) {
    return { tier: "feed-created", sMaxAge: 30, staleWhileRevalidate: 120 };
  }

  // Profile pages: /@author or /@author/:section or /@author/:section/...
  // Must match before entry-page check (also starts with /@author).
  const profileMatch = path.match(/^\/@[^/]+(?:\/([^/]+))?(?:\/|$)/);
  if (profileMatch) {
    const segments = path.split("/").filter(Boolean);
    // Entry: /@author/permlink (exactly 2 segments, second is not a known section)
    if (segments.length === 2) {
      const second = segments[1];
      if (
        !NO_CACHE_PROFILE_SECTIONS.has(second) &&
        !["posts", "blog", "comments", "replies", "communities", "trail", "followers", "following", "insights", "rss", "rss.xml", "feed"].includes(
          second
        )
      ) {
        // /@author/permlink — entry page
        return { tier: "entry", sMaxAge: 3600, staleWhileRevalidate: 86400 };
      }
    }
    const section = profileMatch[1];
    if (section && NO_CACHE_PROFILE_SECTIONS.has(section)) {
      return { tier: NO_CACHE_TIER, sMaxAge: 0, staleWhileRevalidate: 0 };
    }
    if (section && PROFILE_FEED_SECTIONS.has(section)) {
      return { tier: "profile-feed", sMaxAge: 60, staleWhileRevalidate: 300 };
    }
    return { tier: "profile", sMaxAge: 300, staleWhileRevalidate: 3600 };
  }

  // Feed pages: /:filter, /:filter/:tag, /:filter/:tag/:sub
  const firstSegment = path.split("/").filter(Boolean)[0];
  if (firstSegment && FEED_FILTERS.has(firstSegment)) {
    if (firstSegment === "created") {
      return { tier: "feed-created", sMaxAge: 30, staleWhileRevalidate: 120 };
    }
    return { tier: "feed", sMaxAge: 60, staleWhileRevalidate: 300 };
  }

  // Community pages: /:tag/hive-xxxxx or /:tag/hive-xxxxx/:sub
  if (/^\/[^/@][^/]*\/hive-\d{5,6}(\/|$)/.test(path)) {
    return { tier: "community", sMaxAge: 60, staleWhileRevalidate: 300 };
  }

  // Entry pages: /:category/@author/:permlink
  // Single conservative tier. CF worker refines per post age.
  if (/^\/[^/]+\/@[^/]+\/[^/]+/.test(path)) {
    return { tier: "entry", sMaxAge: 3600, staleWhileRevalidate: 86400 };
  }

  // Unknown — skip.
  return null;
}

/** Build a Cache-Control header value from a policy. */
export function buildCacheControlHeader(policy: CachePolicy, isLoggedIn: boolean): string {
  if (policy.tier === NO_CACHE_TIER || isUserSpecificForLoggedIn(policy, isLoggedIn)) {
    return "private, no-store";
  }
  return `public, max-age=0, s-maxage=${policy.sMaxAge}, stale-while-revalidate=${policy.staleWhileRevalidate}`;
}

const DAY_MS = 86400_000;

/**
 * Refine the entry-page tier based on post age.
 *
 * Older posts change much less and tolerate far longer caching. On Hive,
 * posts are frozen (payout-wise) after 7 days; comments can still accrue
 * indefinitely but are rare on archived content. Anonymous viewers may see
 * up to (s-maxage + swr) of staleness, which is the deliberate tradeoff for
 * the hit-ratio wins.
 *
 * Tiers (agreed with user 2026-04-05):
 *   < 1d     : 60s / 300s     (active editing, voting)
 *   1-7d     : 1h  / 1d        (in payout window)
 *   7-30d    : 1d  / 7d        (paid out, comments still active)
 *   30-60d   : 30d / 7d        (stable archive)
 *   > 60d    : 30d / 60d       (ancient — softer cap than 1y for bounded staleness)
 */
export function getEntryTierForAge(ageMs: number): CachePolicy {
  if (ageMs < 0) {
    // Future-dated (shouldn't happen) — treat as fresh
    return { tier: "entry-fresh", sMaxAge: 60, staleWhileRevalidate: 300 };
  }
  const ageDays = ageMs / DAY_MS;
  if (ageDays < 1) {
    return { tier: "entry-fresh", sMaxAge: 60, staleWhileRevalidate: 300 };
  }
  if (ageDays < 7) {
    return { tier: "entry-week", sMaxAge: 3600, staleWhileRevalidate: 86400 };
  }
  if (ageDays < 30) {
    return { tier: "entry-month", sMaxAge: 86400, staleWhileRevalidate: 604800 };
  }
  if (ageDays < 60) {
    return { tier: "entry-archive", sMaxAge: 2592000, staleWhileRevalidate: 604800 };
  }
  return { tier: "entry-ancient", sMaxAge: 2592000, staleWhileRevalidate: 5184000 };
}

/**
 * Extract author and permlink from an entry-page URL.
 *
 * Matches:
 *   /:category/@author/:permlink          → {category, author, permlink}
 *   /:category/@author/:permlink/:sub     → {category, author, permlink}
 *   /@author/:permlink                    → {author, permlink} (rewrites to /entry/created/...)
 *
 * Excludes profile sections (/@author/posts, /@author/wallet, etc.) which
 * have exactly 2 segments where the second is a known section.
 */
export function parseEntryUrl(
  path: string
): { author: string; permlink: string } | null {
  // Strip trailing slash
  const p = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = p.split("/").filter(Boolean);

  // /:category/@author/:permlink[/...]
  if (segments.length >= 3 && segments[1].startsWith("@")) {
    const author = segments[1].slice(1);
    const permlink = segments[2];
    if (author && permlink) return { author, permlink };
  }

  // /@author/:permlink (rewrites to entry)
  if (segments.length === 2 && segments[0].startsWith("@")) {
    const second = segments[1];
    if (
      NO_CACHE_PROFILE_SECTIONS.has(second) ||
      PROFILE_FEED_SECTIONS.has(second) ||
      ["posts", "blog", "comments", "replies", "communities", "followers", "following", "insights", "rss", "rss.xml"].includes(second)
    ) {
      return null; // profile section, not an entry
    }
    const author = segments[0].slice(1);
    if (author) return { author, permlink: second };
  }

  return null;
}
