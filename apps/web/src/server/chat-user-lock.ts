/**
 * Serialises work on one chat user's session token across requests and app
 * instances, so two bootstraps (or a bootstrap and the admin migration) do
 * not revoke each other's freshly issued tokens.
 *
 * Best effort by design: within one instance calls are chained in memory;
 * across instances a short Redis lock is used when Redis is reachable. If the
 * lock cannot be had in time the work runs anyway. Callers re-read state
 * inside the lock and every revocation is idempotent, so running unserialised
 * costs at most an extra token, never a stuck session.
 */
import { randomUUID } from "crypto";
import type { Redis as RedisClient } from "ioredis";
import { getChatRedis } from "@/server/chat-dm-fanout";

const KEY_PREFIX = "chat:tokenlock:";
const LOCK_TTL_MS = 20_000;
const WAIT_MS = 10_000;
const POLL_MS = 100;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const localTails = new Map<string, Promise<unknown>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquire(redis: RedisClient, key: string, owner: string): Promise<boolean> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      if (await redis.set(key, owner, "PX", LOCK_TTL_MS, "NX")) return true;
    } catch {
      return false;
    }
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
}

export async function withChatUserLock<T>(
  userId: string,
  fn: () => Promise<T>,
  redis: RedisClient | null = getChatRedis()
): Promise<T> {
  const previous = localTails.get(userId) ?? Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(async () => {
      if (!redis) return fn();
      const key = `${KEY_PREFIX}${userId}`;
      const owner = randomUUID();
      const held = await acquire(redis, key, owner);
      try {
        return await fn();
      } finally {
        if (held) await redis.eval(RELEASE_SCRIPT, 1, key, owner).catch(() => {});
      }
    });
  localTails.set(userId, run);
  try {
    return await run;
  } finally {
    if (localTails.get(userId) === run) localTails.delete(userId);
  }
}
