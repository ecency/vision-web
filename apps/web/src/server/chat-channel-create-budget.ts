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

// Count and arm the expiry in one atomic call. A key without a TTL (PTTL -1)
// gets one, so a counter left without an expiry repairs itself on next use.
const INCR_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export async function takeChannelCreateSlot(
  userId: string,
  redis: RedisClient | null = getChatRedis()
): Promise<boolean> {
  if (!redis || !userId) return false;
  try {
    const key = `${KEY_PREFIX}${userId}`;
    const count = Number(
      await redis.eval(INCR_SCRIPT, 1, key, String(CHANNEL_CREATE_WINDOW_MS))
    );
    return count <= CHANNEL_CREATE_MAX;
  } catch {
    return false;
  }
}
