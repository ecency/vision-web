/**
 * Serialises work on one chat user's session token and props across requests
 * and app instances, so two bootstraps (or a bootstrap and the admin
 * migration) do not revoke each other's freshly issued tokens.
 *
 * Within one instance calls are chained in memory. Across instances a Redis
 * lock is taken and renewed for as long as the work runs. If another instance
 * holds it past the wait, the call fails with ChatUserBusyError (retryable)
 * instead of running unlocked; if ownership is lost midway, the work's signal
 * is aborted and the same error is raised. A holder that cannot prove its
 * lease (renewals failing) stops the same way. Only when Redis gives no reply
 * at all does the work run with the in-memory chain alone, so a Redis outage
 * never blocks chat; a lock seen held is never ignored.
 */
import { randomUUID } from "crypto";
import type { Redis as RedisClient } from "ioredis";
import { getChatRedis } from "@/server/chat-dm-fanout";

const KEY_PREFIX = "chat:tokenlock:";

function envMs(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const LOCK_TTL_MS = envMs("CHAT_TOKEN_LOCK_TTL_MS", 20_000);
const WAIT_MS = envMs("CHAT_TOKEN_LOCK_WAIT_MS", 10_000);
const POLL_MS = 100;
// Redis counts as down only after this many failed SETs, spread over at
// least OUTAGE_SPAN_MS with no reply at all, so a reconnect (first retry after
// 500ms) gets its chance first.
const OUTAGE_ATTEMPTS = 3;
const OUTAGE_SPAN_MS = 1_500;
const FAILURE_BACKOFF_MS = 500;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

/** Another request is changing this user's session; retry shortly. */
export class ChatUserBusyError extends Error {
  readonly status = 503;

  constructor() {
    super("chat session is being updated, retry shortly");
    this.name = "ChatUserBusyError";
  }
}

const localTails = new Map<string, Promise<unknown>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * "held" once ours; "unavailable" only when Redis has not answered at all.
 * A transient error is retried like contention, and once the key has been
 * seen held the wait can only end in ownership or ChatUserBusyError.
 */
async function acquire(
  redis: RedisClient,
  key: string,
  owner: string,
  signal?: AbortSignal
): Promise<"held" | "unavailable"> {
  const startedAt = Date.now();
  const deadline = startedAt + WAIT_MS;
  let answered = false;
  let failures = 0;
  let failedBefore = false;
  for (;;) {
    signal?.throwIfAborted();
    let failed = false;
    try {
      const result = await redis.set(key, owner, "PX", LOCK_TTL_MS, "NX");
      if (result) return "held";
      answered = true;
      // A SET that succeeded but whose reply was lost leaves the key ours;
      // confirm and refresh it in one step so the lease starts now.
      if (
        failedBefore &&
        (await redis.eval(RENEW_SCRIPT, 1, key, owner, String(LOCK_TTL_MS)))
      ) {
        return "held";
      }
    } catch {
      failed = true;
      failedBefore = true;
      failures += 1;
      if (
        !answered &&
        failures >= OUTAGE_ATTEMPTS &&
        Date.now() - startedAt >= OUTAGE_SPAN_MS
      ) {
        return "unavailable";
      }
    }
    if (Date.now() >= deadline) {
      if (!answered) return "unavailable";
      throw new ChatUserBusyError();
    }
    await sleep(failed ? FAILURE_BACKOFF_MS : POLL_MS);
  }
}

async function runHeld<T>(
  redis: RedisClient,
  key: string,
  owner: string,
  fn: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  const lost = new AbortController();
  const workSignal = signal ? AbortSignal.any([signal, lost.signal]) : lost.signal;
  const interval = Math.max(50, Math.floor(LOCK_TTL_MS / 3));
  // The lease we can prove: extended by every successful renewal. When a
  // renewal fails and the lease would lapse before the next one, stop.
  let confirmedUntil = Date.now() + LOCK_TTL_MS;
  const renew = setInterval(() => {
    const sentAt = Date.now();
    redis
      .eval(RENEW_SCRIPT, 1, key, owner, String(LOCK_TTL_MS))
      .then((renewed) => {
        if (renewed) confirmedUntil = sentAt + LOCK_TTL_MS;
        else lost.abort(new ChatUserBusyError());
      })
      .catch(() => {
        if (Date.now() + interval >= confirmedUntil) lost.abort(new ChatUserBusyError());
      });
  }, interval);
  renew.unref?.();

  try {
    const result = await fn(workSignal);
    // Lost right after the last step: the result may already be undone.
    if (lost.signal.aborted && !signal?.aborted) throw new ChatUserBusyError();
    return result;
  } catch (error) {
    if (lost.signal.aborted && !signal?.aborted) throw new ChatUserBusyError();
    throw error;
  } finally {
    clearInterval(renew);
    await redis.eval(RELEASE_SCRIPT, 1, key, owner).catch(() => {});
  }
}

export async function withChatUserLock<T>(
  userId: string,
  fn: (signal?: AbortSignal) => Promise<T>,
  { redis = getChatRedis(), signal }: { redis?: RedisClient | null; signal?: AbortSignal } = {}
): Promise<T> {
  const previous = localTails.get(userId) ?? Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(async () => {
      signal?.throwIfAborted();
      if (!redis) return fn(signal);
      const key = `${KEY_PREFIX}${userId}`;
      const owner = randomUUID();
      if ((await acquire(redis, key, owner, signal)) === "unavailable") return fn(signal);
      return runHeld(redis, key, owner, fn, signal);
    });
  localTails.set(userId, run);
  try {
    return await run;
  } finally {
    if (localTails.get(userId) === run) localTails.delete(userId);
  }
}
