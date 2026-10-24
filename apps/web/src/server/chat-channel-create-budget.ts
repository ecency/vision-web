/**
 * Per-user budget for community channels created from chat search.
 *
 * Search creates a channel only for a Hive community that clearly matches the
 * query, but one account could still walk through many communities. This caps
 * how many new channels one user can cause per hour. Finding an existing
 * channel is free; only an actual create spends a slot.
 *
 * Fails closed: creating from search is an optional extra, so without Redis it
 * is skipped. A community's own chat page still creates its channel on demand.
 */
import type { Redis as RedisClient } from "ioredis";
import { getChatRedis } from "./chat-dm-fanout";

export const CHANNEL_CREATE_WINDOW_MS = 60 * 60_000;
export const CHANNEL_CREATE_MAX = 10;
const KEY_PREFIX = "chat:searchcreate:v1:";

export async function takeChannelCreateSlot(
  userId: string,
  redis: RedisClient | null = getChatRedis()
): Promise<boolean> {
  if (!redis || !userId) return false;
  try {
    const key = `${KEY_PREFIX}${userId}`;
    // Create the key with its expiry first, so a failure between the two
    // calls can never leave a counter that lives forever.
    await redis.set(key, 0, "PX", CHANNEL_CREATE_WINDOW_MS, "NX");
    const count = await redis.incr(key);
    // The key can expire between the two calls, and INCR then recreates it
    // without a TTL. Re-arm it; a no-op whenever SET already set one.
    if (count === 1) await redis.pexpire(key, CHANNEL_CREATE_WINDOW_MS, "NX");
    return count <= CHANNEL_CREATE_MAX;
  } catch {
    return false;
  }
}
