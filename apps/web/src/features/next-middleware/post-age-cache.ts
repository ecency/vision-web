/**
 * Two-tier cache of post `created` dates used by middleware to refine
 * entry-page Cache-Control TTL based on post age.
 *
 *   L1 — module-level Map, per Node.js process (4 replicas per host)
 *   L2 — per-stack Redis (shared across the 4 replicas), via docker overlay
 *
 * On Hive, post creation dates are immutable, so positive entries never
 * expire. Negative entries (post returned no `created` field) live only
 * in L1 with a 5-min TTL — they are NOT shared via Redis to avoid
 * amplifying RPC-node-lag false negatives across all replicas in a region.
 *
 * Design:
 *   - Two getters share L1:
 *       getCachedPostCreatedMs (sync) — L1-only, for callers that can't await.
 *       awaitPostCreatedMs (async) — L1 fast path, then Redis with a tight
 *         timeout. Used by middleware on the request path: Redis on the
 *         docker overlay is sub-millisecond when healthy, and skipping it
 *         here meant the entry-unknown response (60s) got cached at every
 *         edge layer until L1 happened to warm — which rarely converged
 *         for long-tail posts under load-balanced traffic + L1 FIFO eviction.
 *   - On L1 miss, middleware also kicks off `event.waitUntil(refreshPostCreatedMs)`
 *     so future requests find positive entries in Redis even if this one
 *     timed out the request-path lookup.
 *   - Transient RPC failures (timeout, all nodes failed) do NOT enter the
 *     cache at all — let the next request retry.
 *   - Non-throwing misses (RPC succeeded but returned no `created` field)
 *     land in L1 only. RPC nodes can lag behind chain head, so a fresh
 *     post may legitimately appear missing on one node and present on
 *     another. Sharing those nulls via Redis would let a single lagged
 *     node poison the cache across the region.
 *   - Middleware treats both undefined-cached and null-cached as the
 *     conservative cold-miss tier (60s) — only positive entries unlock
 *     the long age-refined TTL.
 *   - Graceful degradation: Redis down / unreachable / slow → fall back to
 *     L1+RPC. Bounded reconnect with singleton reset on `end` so transient
 *     Redis outages self-heal without requiring a vision_web restart.
 *   - Bounded L1: FIFO eviction at MAX_ENTRIES.
 *   - Uses `callRPC` from @ecency/sdk for the upstream lookup. Tree-shakes
 *     to just the RPC call logic with built-in node failover and per-node
 *     health tracking.
 */

import { callRPC } from "@ecency/sdk";
import Redis, { type Redis as RedisClient } from "ioredis";

const MAX_ENTRIES = 2000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 2000;
const FETCH_RETRIES = 2;
// Tight cap on the request-path Redis lookup. Local docker overlay reads are
// sub-ms when healthy; 50ms protects middleware from a degraded Redis without
// regressing to today's behavior (we just fall through to entry-unknown).
const REQUEST_PATH_REDIS_TIMEOUT_MS = 50;

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const REDIS_KEY_PREFIX = "postage:";
// Skip Redis under Vitest so unit tests don't open real TCP connections.
const REDIS_DISABLED = !!process.env.VITEST || process.env.POSTAGE_CACHE_DISABLE_REDIS === "1";

interface CacheEntry {
  createdMs: number | null; // null = negative cache (fetch failed or not found)
  cachedAt: number;
}

const l1 = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<void>>();

function key(author: string, permlink: string): string {
  return `${author}/${permlink}`;
}

let _redis: RedisClient | null | undefined;
function getRedis(): RedisClient | null {
  if (_redis !== undefined) return _redis;
  if (REDIS_DISABLED) {
    _redis = null;
    return null;
  }
  try {
    _redis = new Redis(REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
      commandTimeout: 200,
      // Bounded reconnect — back off up to ~5s, give up after 10 attempts.
      // After giving up ioredis emits `end`, which clears the singleton so
      // the next refresh rebuilds a fresh client (covers Redis container
      // restarts, deploy windows, and cold-start races where vision_web
      // boots before redis is ready).
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 500, 5000);
      }
    });
    // Silent — graceful degradation to L1+RPC on any Redis error.
    _redis.on("error", () => {});
    _redis.on("end", () => {
      _redis = undefined;
    });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

/**
 * Sentinel distinct from a negative-cache hit: `null` means "we have a
 * negative entry in L1", whereas L1_MISS means "L1 doesn't have anything
 * for this key". Callers map L1_MISS → fall through to L2 / undefined.
 */
const L1_MISS = Symbol("l1-miss");
type L1Result = number | null | typeof L1_MISS;

function consultL1(k: string): L1Result {
  const entry = l1.get(k);
  if (!entry) return L1_MISS;

  // Negative entries expire after NEGATIVE_CACHE_TTL_MS; positive entries
  // are valid indefinitely (created dates are immutable on Hive).
  if (entry.createdMs === null && Date.now() - entry.cachedAt > NEGATIVE_CACHE_TTL_MS) {
    l1.delete(k);
    return L1_MISS;
  }

  return entry.createdMs;
}

/**
 * Synchronous cache lookup. Returns the post's created-timestamp in ms,
 * or null if we have a negative-cache entry, or undefined if we don't know.
 *
 * Only L1 is consulted. Use `awaitPostCreatedMs` from middleware where the
 * Redis fallback is desired; this sync flavor is for callers that can't
 * await (none today, but the export is preserved for stability).
 */
export function getCachedPostCreatedMs(
  author: string,
  permlink: string
): number | null | undefined {
  const r = consultL1(key(author, permlink));
  return r === L1_MISS ? undefined : r;
}

/**
 * Asynchronous cache lookup. Same return semantics as
 * `getCachedPostCreatedMs`, but on L1 miss falls through to Redis with a
 * tight timeout. Used by middleware on the request path so the entry-tier
 * response carries the refined TTL even on a cold-L1 replica — without it,
 * the entry-unknown 60s response gets cached at every edge layer until L1
 * happens to warm, which rarely converges for long-tail posts.
 *
 * - L1 hit (positive or non-expired negative) → resolve immediately.
 * - L1 miss + Redis hit → populate L1, resolve with the value.
 * - L1 miss + Redis miss / timeout / error → resolve undefined. Caller is
 *   expected to also schedule `event.waitUntil(refreshPostCreatedMs)` so
 *   the next request finds a positive entry.
 *
 * Negatives are intentionally never read from Redis: refresh only writes
 * positives there (RPC node lag protection — see refreshPostCreatedMs).
 */
export async function awaitPostCreatedMs(
  author: string,
  permlink: string
): Promise<number | null | undefined> {
  const k = key(author, permlink);

  const l1Result = consultL1(k);
  if (l1Result !== L1_MISS) return l1Result;

  const redis = getRedis();
  if (!redis) return undefined;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const TIMEOUT = Symbol("redis-timeout");
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), REQUEST_PATH_REDIS_TIMEOUT_MS);
  });

  try {
    const v = await Promise.race([redis.get(REDIS_KEY_PREFIX + k), timeout]);
    if (v === TIMEOUT) return undefined;
    if (v === null || v === undefined) return undefined; // Redis miss
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined; // malformed
    setL1(k, n);
    return n;
  } catch {
    // Redis hiccup — fall through to undefined; refresh path will retry.
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Background refresh: populate L1 (and Redis when available) from
 * Redis-then-RPC. De-duplicates concurrent calls per (author, permlink).
 * Intended for `event.waitUntil(...)` in middleware.
 */
export async function refreshPostCreatedMs(author: string, permlink: string): Promise<void> {
  const k = key(author, permlink);

  const existing = inflight.get(k);
  if (existing) return existing;

  const promise = (async () => {
    const redis = getRedis();

    // L2: try Redis first — another replica may already have populated it.
    if (redis) {
      try {
        const v = await redis.get(REDIS_KEY_PREFIX + k);
        if (v !== null) {
          const createdMs = v === "null" ? null : Number(v);
          // Number("non-numeric") → NaN → treat as negative.
          setL1(k, Number.isFinite(createdMs as number) ? (createdMs as number) : null);
          return;
        }
      } catch {
        // Fall through to RPC.
      }
    }

    // L2 miss → RPC.
    let createdMs: number | null;
    try {
      createdMs = await fetchPostCreatedMs(author, permlink);
    } catch {
      // Transient RPC failure (timeout, all nodes failed, network blip).
      // Don't poison L1 or Redis — a 5-minute negative entry shared across
      // replicas would make a fresh post over-cache to the default 1h/1d
      // entry tier for the whole region. Let the next request retry.
      return;
    }
    setL1(k, createdMs);

    // Write only POSITIVE entries back to Redis. Null (post missing or
    // RPC returned no `created` field) stays in L1 for this replica's
    // 5-minute negative window. We deliberately do NOT share null via
    // Redis because RPC nodes can lag behind chain head: a fresh post
    // may legitimately appear missing on one node and present on another.
    // Sharing null would amplify a node-lag false negative across all
    // replicas in the region for 5 minutes. The cost of not sharing is
    // small — N replicas × 1 RPC per 5min for genuinely-missing posts.
    if (redis && createdMs !== null) {
      try {
        await redis.set(REDIS_KEY_PREFIX + k, String(createdMs));
      } catch {
        // Silent — L1 already has the answer for this replica.
      }
    }
  })().finally(() => {
    inflight.delete(k);
  });

  inflight.set(k, promise);
  return promise;
}

/**
 * Fetch a post's `created` timestamp from Hive RPC.
 *
 * Returns:
 *   - number  → post exists, parsed created-ms
 *   - null    → post permanently doesn't exist OR returned malformed (no
 *               `created` field, unparseable date) — safe to negative-cache
 *
 * Throws on transient failures (timeout, all nodes failed, network error)
 * so the caller can avoid poisoning the cache. Distinguishing these two
 * outcomes matters: a transient blip on a fresh post would otherwise be
 * shared across all replicas via Redis and over-cache the post.
 */
async function fetchPostCreatedMs(
  author: string,
  permlink: string
): Promise<number | null> {
  const result = (await callRPC(
    "condenser_api.get_content",
    [author, permlink],
    FETCH_TIMEOUT_MS,
    FETCH_RETRIES
  )) as { created?: string } | null | undefined;

  const createdStr = result?.created;
  if (!createdStr) return null;

  // Hive returns "YYYY-MM-DDTHH:MM:SS" without timezone (UTC assumed)
  const ms = Date.parse(createdStr + "Z");
  return Number.isFinite(ms) ? ms : null;
}

function setL1(k: string, createdMs: number | null): void {
  // FIFO eviction when at capacity
  if (l1.size >= MAX_ENTRIES && !l1.has(k)) {
    const oldest = l1.keys().next().value;
    if (oldest !== undefined) l1.delete(oldest);
  }
  l1.set(k, { createdMs, cachedAt: Date.now() });
}

/** Test-only: reset internal state. */
export function __resetPostAgeCacheForTests(): void {
  l1.clear();
  inflight.clear();
  if (_redis) {
    try {
      _redis.disconnect();
    } catch {
      // ignore
    }
  }
  _redis = undefined;
}

/**
 * Test-only: inject a fake Redis client (or null to force "no Redis").
 * Bypasses lazy init so tests can exercise `awaitPostCreatedMs`'s L2 path
 * without opening a real socket. Pass `undefined` to clear and re-trigger
 * normal lazy init on next call.
 */
export function __setRedisForTests(client: RedisClient | null | undefined): void {
  _redis = client;
}
