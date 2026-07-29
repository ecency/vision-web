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

const ALLOW_UNMEASURED: DmFanoutDecision = {
  allowed: true,
  recipients: 0,
  limit: DM_FANOUT_MAX,
  retryAfterSeconds: 0
};

function pipelineValue(results: [Error | null, unknown][] | null, index: number) {
  const entry = results?.[index];
  if (!entry || entry[0]) return null;
  return entry[1] ?? null;
}

/**
 * Records `channelId` as a recipient of `userId` and reports whether the send
 * may proceed. Nothing is recorded when the send is blocked, so a rejected
 * attempt does not consume a slot or extend the window.
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
    const key = `${KEY_PREFIX}${userId}`;
    const results = (await redis
      .pipeline()
      .zremrangebyscore(key, 0, now - DM_FANOUT_WINDOW_MS)
      .zscore(key, channelId)
      .zcard(key)
      .zrange(key, 0, 0, "WITHSCORES")
      .exec()) as [Error | null, unknown][] | null;

    // An already-counted recipient is never blocked: the cap is on how many
    // people you reach, not on how much you say to them.
    const known = pipelineValue(results, 1) !== null;
    const recipients = Number(pipelineValue(results, 2) ?? 0);

    if (!known && recipients >= limit) {
      const oldest = pipelineValue(results, 3) as string[] | null;
      const oldestScore = Number(oldest?.[1]);
      const freesAt = Number.isFinite(oldestScore)
        ? oldestScore + DM_FANOUT_WINDOW_MS
        : now + DM_FANOUT_WINDOW_MS;
      return {
        allowed: false,
        recipients,
        limit,
        retryAfterSeconds: Math.max(1, Math.ceil((freesAt - now) / 1000))
      };
    }

    await redis.pipeline().zadd(key, now, channelId).pexpire(key, DM_FANOUT_WINDOW_MS).exec();

    return {
      allowed: true,
      recipients: known ? recipients : recipients + 1,
      limit,
      retryAfterSeconds: 0
    };
  } catch {
    // Fail open — see the module comment.
    return { ...ALLOW_UNMEASURED, limit };
  }
}
