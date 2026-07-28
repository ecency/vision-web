# Cloudflare Worker Cache Alignment

The `ecency-geo-router` worker sits in front of nginx and is the primary edge
cache layer for ecency.com. It implements:

1. Geo-routing across 3 origins (eu/us/asia.ecency.com)
2. WebSocket pass-through to the closest origin
3. Edge cache for cacheable HTML responses, keyed by URL + auth-class
4. Smart-Tiered-Cache-eligible subfetches via `cf.cacheKey`

> Bot/abuse filtering is **not** done in the worker — it is handled upstream at
> the Cloudflare edge (firewall rules + bot management). The worker only reads
> the verified-bot flag to tune origin timeouts.

## Cache key strategy

The cache key encodes both the URL and the auth class so anonymous and
logged-in users get separate cache entries — 2 entries per URL — without
needing a `Vary: Cookie` header (which would fragment cache on every cookie).

```js
const authClass = hasActiveUser ? "loggedin" : "anon";
// Synthetic URL prefixed with auth class. Real URL is unchanged for the
// actual fetch; this is only for the cache lookup/store key.
const cacheKeyUrl =
  `https://cache.internal/${authClass}${reqUrl.pathname}${reqUrl.search}`;
```

### Known gap: no bot-class dimension

The key does **not** encode the Next.js `htmlLimitedBots` UA class, which the
origin SSR cache does (`$html_limited_bot`, see `nginx.md`). Those crawlers get
metadata rendered into `<head>` while everyone else gets it streamed into the
body, so the two are genuinely different responses for the same URL.

This is currently **latent, not active**: post HTML is effectively pass-through
at the edge — `x-edge-cache` is MISS even on repeat requests to clean, cacheable
URLs, and the origin cache status advances on every request, which it could not
do if the standard-cache subfetch were absorbing them. The origin key is the one
that decides, and it does account for bot class.

**If edge HTML caching is ever made to actually hit, this key must gain the same
dimension first**, or browser-primed edge entries will be served to crawlers and
the origin-side split becomes unreachable. See issue #1257.

`active_user` cookie presence determines auth-class. Neither the cookie's
value nor any other cookie is part of the key — empirical analysis confirmed
that SSR is auth-class-equivalent (same for any logged-in user) on every
route except feed and profile-feed tiers, which are user-specific via mute
filter and stay private (see "Trust origin Cache-Control" below).

## Trust origin Cache-Control

The worker does not decide cacheability — origin's middleware
(`apps/web/src/features/next-middleware/cache-policy.ts`) does, via
`buildCacheControlHeader`. The worker's job is to honor the result.

Origin emits `private, no-store` for:
- `NO_CACHE_PREFIXES` (publish, chats, wallet, search, market, etc.)
- Profile sub-sections in `NO_CACHE_PROFILE_SECTIONS`
  (wallet, settings, permissions, referrals, **insights**)
- `feed`, `feed-created`, `profile-feed` tiers — but only when `isLoggedIn`,
  because these routes filter SSR by the user's mute list

For everything else (post pages, profile main + most sub-sections, community,
list, static), origin emits `public, max-age=0, s-maxage=N, stale-while-
revalidate=M` for both anon and logged-in.

The worker then:

```js
const originCC = upstream.headers.get("cache-control") || "";
const hasNoStore = /\bno-store\b/i.test(originCC);
const isPrivate = /\bprivate\b/i.test(originCC);
const sMaxMatch = originCC.match(/s-maxage=(\d+)/);
const cacheable = !hasNoStore && !isPrivate && sMaxMatch && parseInt(sMaxMatch[1], 10) > 0;
if (cacheable) {
  await caches.default.put(cacheKey, response.clone());
}
```

## Subfetch with cf.cacheKey

For cacheable requests, the origin subfetch is annotated with the same
synthetic cache-key URL. This engages CF's standard cache (eligible for
Smart Tiered Cache when enabled at the zone level), giving cross-colo
consolidation in addition to the worker's per-colo `caches.default`.

```js
const subfetchInit = canEdgeCache
  ? { cf: { cacheKey: cacheKeyUrl } }
  : {};
const upstream = await fetch(target, { ...subfetchInit, /* ... */ });
```

Note: `cacheEverything` is intentionally NOT set — origin Cache-Control
still gates whether CF's standard cache stores the subfetch response, so
no-store/private routes remain bypassed even at this layer.

## Per-post-age TTL refinement — owned by middleware + Redis

The Next.js middleware refines entry-page TTL based on post age. A per-host
Redis container (deployed alongside vision_web on each origin server) acts
as L2 for the in-process L1 Map; it lets the post-age cache survive replica
restarts and amortize RPC fetches across all replicas on the same host.
Middleware reads L2 on the request path with a tight 50ms cap, so any
replica on a host can emit the refined tier as soon as Redis is populated
by any other replica — without that, the entry-unknown 60s response gets
cached at every edge layer until the responding replica's L1 happens to
warm, which rarely converges for long-tail posts.

The CF worker does **not** need to fetch post metadata — it just respects
the `Cache-Control` header emitted by middleware, which already encodes the
age-based TTL.

**Tier table (origin-emitted, for reference):**

| Post age | `s-maxage` | `stale-while-revalidate` |
|---|---|---|
| < 1d | 60s | 300s |
| 1-7d | 1h | 1d |
| 7-30d | 1d | 7d |
| 30-60d | 30d | 7d |
| > 60d | 30d | 60d |

The worker caps stored TTL at 7 days as a safety bound:

```js
const cappedTtl = Math.min(edgeTtl, 604800);
```

## Observability

The worker sets `X-Edge-Cache: HIT|MISS` on every response. The origin's
`x-cache-tier` header passes through unchanged (e.g. `entry-ancient`,
`profile`, `feed-loggedin`). CF's own `cf-cache-status` reflects the
standard-cache outcome on the subfetch path — not the worker's
`caches.default` HIT, which appears as `dynamic` to CF's metrics.

To accurately measure worker effectiveness, parse `X-Edge-Cache` from
response headers, not `cf-cache-status`.

## Verification

Verify against the origin (port 3000) with a `Host: ecency.com` header to
bypass CF entirely — this isolates the middleware/SSR layer from worker
behavior. For end-to-end edge tests, a browser session works best because
it satisfies CF's bot management without relying on operational allowlists.

```bash
# Anonymous post page — second request should HIT in worker's caches.default
# (visible via X-Edge-Cache: HIT response header)
curl -sI -H "Host: ecency.com" \
  "http://127.0.0.1:3000/<community>/<author>/<permlink>" | \
  grep -iE 'cache-control|x-cache-tier'
# expect: cache-control: public, max-age=0, s-maxage=N, stale-while-revalidate=M

# Logged-in (auth-class-equivalent route) — origin emits cacheable header
curl -sI --cookie "active_user=alice" -H "Host: ecency.com" \
  "http://127.0.0.1:3000/@<author>" | grep -iE 'cache-control|x-cache-tier'
# expect: cache-control: public ... s-maxage=300

# Logged-in (feed) — stays private regardless
curl -sI --cookie "active_user=alice" -H "Host: ecency.com" \
  "http://127.0.0.1:3000/created" | grep -iE 'cache-control|x-cache-tier'
# expect: cache-control: private, no-store
# expect: x-cache-tier: feed-created-loggedin

# Logged-in (insights) — stays private (owner-stats SSR)
curl -sI --cookie "active_user=alice" -H "Host: ecency.com" \
  "http://127.0.0.1:3000/@<author>/insights" | grep -iE 'cache-control'
# expect: cache-control: private, no-store
```

## Deploy

Worker source is maintained outside this repo (operations infrastructure).
Deploy via the Cloudflare Workers Scripts API:

```bash
curl -X PUT -H "Authorization: Bearer $CF_API_TOKEN" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2024-01-01"};type=application/json' \
  -F "worker.js=@${WORKER_SOURCE};filename=worker.js;type=application/javascript+module" \
  "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/scripts/ecency-geo-router"
```

Provide `CF_API_TOKEN`, `WORKER_SOURCE`, and `CF_ACCOUNT_ID` from your
deployment environment. Keep prior versions as backups for one-line revert.
