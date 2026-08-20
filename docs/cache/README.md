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
│  (proxy cache)  │   (32G LRU, 2h inactive, per-host)
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
| `entry-archive` | 30d | 7d | posts 30-60 days old | yes |
| `entry-ancient` | 30d | 60d | posts > 60 days old | yes |
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

## Layer-specific configuration

- [Nginx](./nginx.md) — proxy cache (32G LRU, 2h inactive)
- [Cloudflare Worker](./cloudflare-worker.md) — auth-class cache key,
  Smart-Tiered-Cache subfetches, per-post-age TTL via origin

## DMCA / moderation invalidation

See [purge script](../../scripts/purge-cache.sh).

**Workflow:**
1. Update `apps/web/public/dmca/dmca-*.json`, commit, deploy
2. Run `./scripts/purge-cache.sh <affected-urls>` to drop pre-DMCA HTML
   from the CF edge cache

Without step 2, CF serves the pre-DMCA HTML until `s-maxage` expires
(up to 1h for post pages, 7d for static pages).

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
