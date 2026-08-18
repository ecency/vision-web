/**
 * Shared, resilient ioredis singleton for SEO features (
 * precomputed sitemap blobs). Mirrors the post-age-cache client pattern:
 * bounded reconnect, singleton reset on `end`, silent graceful degradation,
 * and disabled under Vitest so unit tests never open real TCP connections.
 *
 * SEO callers must treat a null client / failed command as "no data" and
 * fail open (never block rendering, never mass-noindex).
 */
import Redis, { type Redis as RedisClient } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const REDIS_DISABLED =
  !!process.env.VITEST || process.env.SEO_REDIS_DISABLE === "1";

export const SEO_REDIS_PREFIX = "seo:";

let _redis: RedisClient | null | undefined;

export function getSeoRedis(): RedisClient | null {
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
      commandTimeout: 1000,
      retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 500, 5000);
      }
    });
    _redis.on("error", () => {}); // silent — graceful degradation
    _redis.on("end", () => {
      _redis = undefined; // rebuild on next access (covers redis restarts)
    });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}
