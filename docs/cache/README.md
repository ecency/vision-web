# HTML Edge Caching Architecture

This directory documents the edge caching system for ecency.com.

## Overview

```
┌─────────────────┐
│   Cloudflare    │ ← cf.cacheKey on subfetches; Smart-Tiered-Cache eligible
│   (edge cache)  │
└────────┬────────┘
         ↓
┌─────────────────┐
│  CF Worker      │ ← cache key = URL + auth-class (anon | loggedin)
│  (geo-router)   │   2 cache entries per URL; respects origin Cache-Control
└────────┬────────┘
         ↓
┌─────────────────┐
│     Nginx       │ ← URL-keyed proxy cache, respects origin Cache-Control
│  (proxy cache)  │   (32G LRU, per-host)
└────────┬────────┘
         ↓
┌─────────────────┐
│    Next.js      │ ← single source of truth; middleware emits Cache-Control
│  (3 regions ×   │   per route pattern, with auth-aware policy
│   4 replicas)   │
└─────────────────┘
```

**Principle:** Next.js decides the cache policy. Nginx and Cloudflare respect
that policy. The CF worker keys cache entries by auth-class so logged-in
users get separate cached responses from anonymous users (one entry each)
without needing a `Vary: Cookie` header.

## Where the policy is defined

- **Route-pattern TTLs**: `apps/web/src/features/next-middleware/cache-policy.ts`
- **Header injection**: `apps/web/src/middleware.ts`
- **User-specific gate**: `isUserSpecificForLoggedIn(policy, isLoggedIn)`
  exported from `cache-policy.ts` — true only when SSR genuinely depends on
  the logged-in user's identity (today: feed tiers via mute filter)

## TTL tiers

Both anonymous and logged-in users share these s-maxage values, EXCEPT for
`feed`, `feed-created`, and `profile-feed` tiers which emit
`private, no-store` for logged-in users (mute filter applied server-side
to feed content; sharing the cache entry across users would leak filtered
content).

| Tier | `s-maxage` | `stale-while-revalidate` | Routes | Cacheable for logged-in? |
|---|---|---|---|---|
| `static` | 24h | 7d | `/faq`, `/about`, `/child-safety`, `/contributors`, `/privacy-policy`, `/terms-of-service`, `/whitepaper`, `/mobile` | yes |
| `home` | 5m | 1h | `/` | n/a (logged-in `/` rewrites to `/@user/feed`) |
| `list` | 5m | 1h | `/discover`, `/communities`, `/witnesses`, `/tags` | yes |
| `list-proposals` | 10m | 1h | `/proposals` | yes |
| `feed` | 1m | 5m | `/hot`, `/trending`, `/payout`, `/muted`, `/promoted` + tags | **no** (mute filter) |
| `feed-created` | 30s | 2m | `/created`, `/tags/:tag` | **no** (mute filter) |
| `dynamic-page` | 1m | 5m | `/chats`, `/decks`, `/waves`, `/perks`, `/search` | yes (anon-equivalent SSR + client hydration) |
| `community` | 1m | 5m | `/:tag/hive-xxxxx` | yes |
| `profile` | 5m | 1h | `/@author`, `/@author/posts`, `/blog`, `/comments`, `/replies`, `/communities` | yes |
| `profile-feed` | 1m | 5m | `/@author/feed`, `/@author/trail` (aggregates other users' content) | **no** (mute filter) |
| `entry` | 1h | 1d | post pages (default — used until post age is known) | yes |
| `entry-fresh` | 1m | 5m | posts < 1 day old | yes |
| `entry-week` | 1h | 1d | posts 1-7 days old | yes |
| `entry-month` | 1d | 7d | posts 7-30 days old | yes |
| `entry-archive` | 2d | 7d | posts 30-60 days old | yes |
| `entry-ancient` | 2d | 60d | posts > 60 days old | yes |
| `no-cache` | 0 | 0 | `/publish`, `/auth/*`, `/signup`, `/submit`, `/draft`, `/onboard-friend`, `/purchase`, `/market`, `/wallet`, `/@author/{wallet,settings,permissions,referrals,insights}` | no |

**Empirical basis (2026-05-08):** SSR was tested across 26 page types with
multiple user identities. Routes flagged as cacheable for logged-in produce
byte-equivalent SSR (modulo timestamps in dehydrated React Query state)
across all logged-in users. Routes flagged as not-cacheable read
`active_user` server-side (`feed/[...sections]/page.tsx` for mute filter,
`profile/[username]/insights/page.tsx` for owner-only stats).

**Observability header:** Every response carries `x-cache-tier: <tier>`,
or `<tier>-loggedin` for tiers that are user-specific when logged-in (e.g.
`feed-created-loggedin`). CF analytics, Nginx logs, and browser DevTools
all reveal which policy was applied.

**No `Vary: Cookie`.** Auth bifurcation happens via the CF worker's cache
key, which encodes auth-class (`anon` or `loggedin`) as a synthetic URL
prefix. Two cache entries per URL — one per auth class — without
fragmenting on every cookie (analytics, locale, theme, experiments).

## Degraded renders are never stored

The tier is chosen in middleware, before the page renders. When a server
prefetch then times out or fails (`core/react-query/query-helpers.ts`; a node's
not-found answer, such as a missing post, is not a failure and keeps the tier,
see `utils/hive-not-found-error.ts`; a source with a fallback, such as condenser
`get_content` before `bridge.get_post`, passes `degradeOnFailure: false` so only
the fallback failing too counts), the page renders without that data and the client fetches it after hydration. The
`apps/web/ssr-degraded.js` preload (loaded by the image CMD) rewrites that
response to `private, no-store` as its head is written and appends `-degraded`
to `x-cache-tier`, so neither nginx nor the edge stores it and an expired good
copy stays available to be served stale (#1558). The status is untouched: a page
that answers `notFound()` after a failed lookup still sends its 404, uncached.

A render that already flushed its head (a streamed Suspense boundary, an RSC
navigation past its first chunk) cannot be changed and is still cached; the
preload counts those as `late`, with their paths, so the affected routes are
visible. Once a minute, only when something happened, the container log gets
one line such as:

```
[ssr-degraded] last 60s: sent prefetch-timeout=3,prefetch-error=1 [/@a/posts ...]; late prefetch-timeout=2 [/@b/followers ...]; abandoned prefetch-timeout=1 [/@c]
```

`abandoned` means the client went away before any head was written, so nothing
was sent.

## Layer-specific configuration

- [Nginx](./nginx.md) — proxy cache (32G LRU)
- [Cloudflare Worker](./cloudflare-worker.md) — auth-class cache key,
  Smart-Tiered-Cache subfetches, per-post-age TTL via origin

## DMCA / moderation invalidation

See [purge script](../../scripts/purge-cache.sh).

**What the lists do** (`apps/web/src/core/dmca-lists.ts`, #1870):
- `dmca-posts.json` removes a post: its page, `.md`, `.json`, oEmbed and import
  are censored.
- `dmca-accounts.json` only empties the account's own profile lists. Its posts
  still open from a direct link and still appear in ranked, tag and community
  feeds and in search. To remove a post by a listed account, list that post in
  `dmca-posts.json` too.

**Workflow** for each removed post:
1. Update `apps/web/public/dmca/dmca-*.json`, commit, deploy. The lists are
   built into the app, so nothing changes before the deploy.
2. On each origin host, delete the files listed by
   `./scripts/purge-cache.sh --origin-files --post <[category/]@author/permlink>`.
   The origin SSR cache honours `s-maxage` and has no purge of its own, so
   without this the edge refills from the pre-takedown copy. The list covers
   the browser and crawler copies of each URL.
3. Run `./scripts/purge-cache.sh --post <[category/]@author/permlink>` to purge
   the Cloudflare cache by URL. `--post` expands to the page, `.md`, `.json`,
   `.discussion.json` and the oEmbed URL, plus the category URL and its oEmbed
   when the category is given. Add `--dry-run` to see the list first.
4. Check the page with a fresh request and look at `x-edge-cache`. The worker
   stores pages under a synthetic key (see
   [cloudflare-worker.md](./cloudflare-worker.md)), which a purge by public URL
   may not reach. Such a copy expires with its `s-maxage`, capped at 7 days by
   the worker.

Without steps 2 and 3, a post page older than 30 days can be served for its
2-day `s-maxage` at the origin, and then for up to its `s-maxage` again at the
edge from a copy taken just before the origin's expired, so about 4 days, plus
a stale answer while it re-renders (#1505). Newer posts expire sooner. The
machine-readable forms and oEmbed expire within about a day, and the sitemap
within about a day plus its regeneration. `--post` does not cover the sitemap,
RSS, other pages that list the post (profiles, feeds), or a copy cached under
a query string, such as an RSC navigation payload (`?_rsc=`) or a tracking
parameter; those expire with their own `s-maxage`.

## Per-post-age TTL refinement

For entry (post) pages, the middleware refines the cache TTL based on the
post's age. The lookup is two-tier:

1. **L1 — in-process `Map`** (per Node.js process, 4 replicas per host).
   Sub-microsecond reads, capped at 2000 entries with FIFO eviction. Wiped
   on replica restart.
2. **L2 — per-host Redis** (one container per origin server, shared across
   that host's 4 replicas via the docker overlay network). Sub-millisecond
   local TCP. Survives replica restarts. Only positive entries — null
   (negative-cache for missing/malformed RPC results) stays L1-only to
   avoid amplifying RPC node lag across all replicas.

On every entry-page request, middleware:

1. Reads L1 (sync). On hit, emits the refined tier (`entry-fresh` through
   `entry-ancient`) immediately.
2. On L1 miss, awaits L2 with a tight 50ms cap. On hit, populates L1 and
   emits the refined tier.
3. On L1+L2 miss (or L2 timeout), emits `entry-unknown` (60s / 5m) and
   kicks off `event.waitUntil(refreshPostCreatedMs(...))` which fetches
   from Hive RPC (`condenser_api.get_content`) and writes both L1 and L2.

The L2 read on the request path is what lets warm-Redis posts skip the
`entry-unknown` window entirely. Without it, the entry-unknown 60s
response gets cached at every edge layer until L1 happens to warm — which
rarely converges for long-tail posts under load-balanced traffic +
L1 FIFO eviction.

Transient RPC failures (timeout, all nodes failed) are NOT cached — they
let the next request retry — to avoid over-caching a fresh post to the
default 1h tier across the whole region.

See `apps/web/src/features/next-middleware/post-age-cache.ts`.

## Current Status

Implemented in this repo:

- Middleware emits `Cache-Control` and `x-cache-tier` for cacheable HTML routes
- Logged-in users share cache on auth-class-equivalent routes
- Feed tiers + insights stay private when logged-in (server-side
  `active_user` reads detected and excluded)
- Entry-page TTL refined by post age via L1 Map + per-host Redis L2
- `scripts/purge-cache.sh` supports manual DMCA / moderation invalidation

Tracked here, applied by hand (CI does NOT deploy them):

- Nginx (`ssrcache` zone) on each origin host — the vhosts are in `infra/origin/`
  since 2026-08-20; see [nginx.md](./nginx.md) and `infra/origin/README.md` for the
  public-repo contract that keeps thresholds and addresses off the record

Operated outside this repo:

- Cloudflare worker `ecency-geo-router` — see [cloudflare-worker.md](./cloudflare-worker.md)

Before production rollout of changes here, verify `x-cache-tier` values
across route types in staging and confirm the Nginx / Cloudflare layers
are aligned with the origin policy.
