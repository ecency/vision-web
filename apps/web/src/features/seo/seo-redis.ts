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
      // A command issued while the client is still connecting waits for the
      // socket instead of being rejected on the spot. A replica that starts
      // under load (rolling deploy, busy origin) used to answer 503 to every
      // sitemap request until its client had connected, for minutes on a
      // saturated box. The wait is bounded: one reconnect attempt, then the
      // queued commands fail, so a Redis that is really down still degrades
      // within a few seconds instead of hanging requests.
      enableOfflineQueue: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 2000,
      // Never give up. Giving up after ten tries ended the client and left
      // the replica without Redis until some later request rebuilt it; the
      // "end" handler below already covers a real Redis restart.
      retryStrategy: (times: number) => Math.min(times * 500, 5000)
    });
    let reported = false;
    _redis.on("error", (err: Error) => {
      // Graceful degradation, but not silent: one line per client so a
      // replica that cannot reach Redis shows up in its log.
      if (reported) return;
      reported = true;
      console.warn(`[seo-redis] ${err.message}`);
    });
    _redis.on("end", () => {
      _redis = undefined; // rebuild on next access (covers redis restarts)
    });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}
