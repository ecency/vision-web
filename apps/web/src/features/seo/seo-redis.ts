/**
 * Shared ioredis singleton for SEO features (precomputed sitemap blobs).
 *
 * Contract: the client keeps reconnecting for as long as the process lives
 * (no retry cap), is rebuilt on `end`, never queues a command (a queued
 * command that timed out would still run later, after its caller failed),
 * logs the first error per client, and is disabled under Vitest so unit
 * tests never open real TCP connections. Callers that can afford a short
 * wait take the client through getSeoRedisReady(), which waits, bounded,
 * for the connection of a client that is still connecting.
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

// One window for both the socket connect and the default getSeoRedisReady()
// wait, so a request that lands during a slow first connect is served once
// that connect succeeds instead of giving up a second before it would have.
const CONNECT_TIMEOUT_MS = 3000;

export function getSeoRedis(): RedisClient | null {
  if (_redis !== undefined) return _redis;
  if (REDIS_DISABLED) {
    _redis = null;
    return null;
  }
  try {
    _redis = new Redis(REDIS_URL, {
      lazyConnect: false,
      // No offline queue, deliberately: a command that times out while
      // queued would still be sent once the socket comes up, i.e. after the
      // caller has already failed its request (a lone shard write after a
      // failed generator run). Callers that can tolerate a short wait use
      // getSeoRedisReady() below instead, which waits for the connection
      // without ever queueing a command.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: CONNECT_TIMEOUT_MS,
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

/**
 * The client once it is connected, waiting up to `waitMs` for one that is
 * still connecting (a replica that has just started). A replica starting
 * under load used to answer 503 to every sitemap request until its client
 * had connected, for minutes on a saturated origin, because the first use
 * found the client mid-connect and no command may wait in a queue. Null when
 * Redis is off or still unreachable after the wait; the caller degrades as
 * before, and nothing can execute after it has given up.
 */
const isReady = (client: RedisClient): boolean => client.status === "ready";

export async function getSeoRedisReady(waitMs = CONNECT_TIMEOUT_MS): Promise<RedisClient | null> {
  const client = getSeoRedis();
  if (!client) return null;
  if (isReady(client)) return client;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      client.off("ready", done);
      resolve();
    };
    const timer = setTimeout(done, waitMs);
    client.once("ready", done);
  });
  return isReady(client) ? client : null;
}
