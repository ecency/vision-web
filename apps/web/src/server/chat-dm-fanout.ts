/**
 * Server-side DM fan-out limit for chat.
 *
 * Mass-DM phishing is otherwise only caught after the fact by an out-of-band
 * monitor. That monitor deletes the messages and bans the sender, but it runs
 * periodically, so a spray still lands in real inboxes first and cannot be
 * recalled once a client has rendered it. This caps how many distinct people
 * one account can open a conversation with in a rolling window: the signal
 * every observed spray shares, and one an ordinary conversation never trips.
 *
 * State is a Redis sorted set per sender, holding the channel ids they have
 * messaged, scored by send time. Re-messaging someone already inside the
 * window is always allowed, because the cap is on distinct recipients rather
 * than on message volume.
 *
 * Fails open: a Redis outage must never stop people from talking, and the
 * monitor remains the backstop.
 */
import Redis, { type Redis as RedisClient } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const DISABLED = !!process.env.VITEST || process.env.CHAT_DM_FANOUT_DISABLE === "1";

const KEY_PREFIX = "chat:dmfanout:";

function envInt(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Rolling window the distinct-recipient count is measured over. */
export const DM_FANOUT_WINDOW_MS = envInt("CHAT_DM_FANOUT_WINDOW_MIN", 60) * 60_000;

/**
 * Accounts this new to chat get the tighter cap. Every observed spray came
 * from an account created the same day, while an established account reaching
 * many people is usually a community organiser doing their job.
 */
export const DM_FANOUT_NEW_ACCOUNT_MS = envInt("CHAT_DM_FANOUT_NEW_ACCOUNT_HOURS", 24) * 3_600_000;

export const DM_FANOUT_MAX_NEW = envInt("CHAT_DM_FANOUT_MAX_NEW", 5);
export const DM_FANOUT_MAX = envInt("CHAT_DM_FANOUT_MAX", 20);

export interface DmFanoutDecision {
  allowed: boolean;
  /** Distinct recipients already recorded in the window. */
  recipients: number;
  limit: number;
  /** Seconds until the oldest recipient ages out. Only meaningful when blocked. */
  retryAfterSeconds: number;
}

/**
 * Trim, count and conditionally insert in one atomic step.
 *
 * A read pipeline followed by a separate write loses to exactly the attack
 * this limits: fire the whole spray in parallel and every request reads a
 * count below the cap before any of them writes, so all of them pass.
 */
const RESERVE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local known = redis.call('ZSCORE', key, member)
local count = redis.call('ZCARD', key)

if not known and count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = -1
  if oldest[2] then oldestScore = tonumber(oldest[2]) end
  return {0, count, oldestScore}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)

if known then
  return {1, count, -1}
end
return {1, count + 1, -1}
`;

/**
 * A missing or nonsensical creation timestamp resolves to the established cap.
 * Treating "unknown" as new would throttle everyone to the tight limit if
 * Mattermost ever stopped returning the field.
 */
export function dmFanoutLimitFor(accountCreatedAt: number | undefined, now: number) {
  if (!accountCreatedAt || !Number.isFinite(accountCreatedAt) || accountCreatedAt > now) {
    return DM_FANOUT_MAX;
  }
  return now - accountCreatedAt < DM_FANOUT_NEW_ACCOUNT_MS ? DM_FANOUT_MAX_NEW : DM_FANOUT_MAX;
}

let _redis: RedisClient | null | undefined;

export function getChatRedis(): RedisClient | null {
  if (_redis !== undefined) return _redis;
  if (DISABLED) {
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

const ALLOW_UNMEASURED: Omit<DmFanoutDecision, "limit"> = {
  allowed: true,
  recipients: 0,
  retryAfterSeconds: 0
};

/**
 * Records `channelId` as a recipient of `userId` and reports whether the send
 * may proceed. Nothing is recorded when the send is blocked, so a rejected
 * attempt neither consumes a slot nor extends the window.
 *
 * Recording is final. There is no compensating release, because a release
 * cannot distinguish its own record from one a concurrent request is relying
 * on: pairing a doomed request with a real one would delete the record of a
 * message that did land. Callers instead run this as late as possible, once
 * nothing but the upstream post can still fail.
 */
export async function checkDmFanout(
  {
    userId,
    channelId,
    accountCreatedAt,
    now = Date.now()
  }: {
    userId: string;
    channelId: string;
    accountCreatedAt?: number;
    now?: number;
  },
  redis: RedisClient | null = getChatRedis()
): Promise<DmFanoutDecision> {
  const limit = dmFanoutLimitFor(accountCreatedAt, now);
  if (!redis) return { ...ALLOW_UNMEASURED, limit };

  try {
    const [allowed, recipients, oldestScore] = (await redis.eval(
      RESERVE_SCRIPT,
      1,
      `${KEY_PREFIX}${userId}`,
      String(now),
      String(DM_FANOUT_WINDOW_MS),
      String(limit),
      channelId
    )) as [number, number, number];

    if (allowed) {
      return { allowed: true, recipients, limit, retryAfterSeconds: 0 };
    }

    const freesAt =
      oldestScore >= 0 ? oldestScore + DM_FANOUT_WINDOW_MS : now + DM_FANOUT_WINDOW_MS;

    return {
      allowed: false,
      recipients,
      limit,
      retryAfterSeconds: Math.max(1, Math.ceil((freesAt - now) / 1000))
    };
  } catch {
    // Fail open — see the module comment.
    return { ...ALLOW_UNMEASURED, limit };
  }
}
