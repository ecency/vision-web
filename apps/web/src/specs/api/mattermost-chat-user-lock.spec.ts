import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeLockRedis } from "./helpers/fake-lock-redis";

const KEY = (userId: string) => `chat:tokenlock:${userId}`;
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadLock(env: { ttl?: number; wait?: number } = {}) {
  process.env.CHAT_TOKEN_LOCK_TTL_MS = String(env.ttl ?? 20_000);
  process.env.CHAT_TOKEN_LOCK_WAIT_MS = String(env.wait ?? 10_000);
  vi.resetModules();
  return await import("@/server/chat-user-lock");
}

afterEach(() => {
  delete process.env.CHAT_TOKEN_LOCK_TTL_MS;
  delete process.env.CHAT_TOKEN_LOCK_WAIT_MS;
});

describe("withChatUserLock", () => {
  let redis: FakeLockRedis;

  beforeEach(() => {
    redis = new FakeLockRedis();
  });

  it("waits for a lock held elsewhere and runs once it is released", async () => {
    const { withChatUserLock } = await loadLock();
    redis.put(KEY("u-1"), "other-instance");
    const order: string[] = [];

    const pending = withChatUserLock("u-1", async () => order.push("ran"), { redis: redis as never });
    await tick();
    expect(order).toEqual([]);

    redis.delete(KEY("u-1"));
    await pending;
    expect(order).toEqual(["ran"]);
    expect(redis.size).toBe(0);
  });

  // Running unlocked would let this request revoke a token the holder is
  // about to hand out, so contention ends in a retryable error instead.
  it("gives up with a retryable error, without running, when the lock stays held", async () => {
    const { withChatUserLock, ChatUserBusyError } = await loadLock({ wait: 150 });
    redis.put(KEY("u-2"), "other-instance");
    let ran = false;

    await expect(
      withChatUserLock("u-2", async () => {
        ran = true;
      }, { redis: redis as never })
    ).rejects.toBeInstanceOf(ChatUserBusyError);
    expect(ran).toBe(false);
  });

  it("keeps the lock for as long as the work runs", async () => {
    const { withChatUserLock } = await loadLock({ ttl: 300 });
    let ownedThroughout = true;

    await withChatUserLock("u-3", async () => {
      for (let i = 0; i < 10; i++) {
        await tick(60); // well past the TTL in total
        if (redis.get(KEY("u-3")) === undefined) ownedThroughout = false;
      }
    }, { redis: redis as never });

    expect(ownedThroughout).toBe(true);
    expect(redis.size).toBe(0);
  });

  it("aborts the work and reports busy when ownership is lost", async () => {
    const { withChatUserLock, ChatUserBusyError } = await loadLock({ ttl: 120 });
    let aborted = false;

    await expect(
      withChatUserLock("u-4", async (signal) => {
        redis.put(KEY("u-4"), "someone-else"); // our lock was taken over
        await new Promise<void>((resolve, reject) => {
          signal!.addEventListener("abort", () => {
            aborted = true;
            reject(signal!.reason);
          });
          setTimeout(resolve, 1_000);
        });
      }, { redis: redis as never })
    ).rejects.toBeInstanceOf(ChatUserBusyError);

    expect(aborted).toBe(true);
    expect(redis.get(KEY("u-4"))).toBe("someone-else"); // not ours to release
  });

  it("serialises calls for the same user within an instance", async () => {
    const { withChatUserLock } = await loadLock();
    const order: string[] = [];
    const slow = withChatUserLock("u-5", async () => {
      order.push("a-start");
      await tick();
      order.push("a-end");
    }, { redis: null });
    const fast = withChatUserLock("u-5", async () => order.push("b"), { redis: null });

    await Promise.all([slow, fast]);
    expect(order).toEqual(["a-start", "a-end", "b"]);
  });

  it("does not hold other users up", async () => {
    const { withChatUserLock } = await loadLock();
    const order: string[] = [];
    const slow = withChatUserLock("u-6", async () => {
      await tick();
      order.push("u-6");
    }, { redis: null });
    await withChatUserLock("u-7", async () => order.push("u-7"), { redis: null });
    await slow;

    expect(order).toEqual(["u-7", "u-6"]);
  });

  it("releases after a failure and keeps working for the next caller", async () => {
    const { withChatUserLock } = await loadLock();

    await expect(
      withChatUserLock("u-8", async () => {
        throw new Error("boom");
      }, { redis: redis as never })
    ).rejects.toThrow("boom");

    expect(redis.size).toBe(0);
    expect(await withChatUserLock("u-8", async () => "ok", { redis: redis as never })).toBe("ok");
  });

  // A Redis outage must never block chat.
  it("runs on the in-memory chain alone when Redis is unreachable", async () => {
    const { withChatUserLock } = await loadLock();
    redis.failAll = true;

    expect(await withChatUserLock("u-9", async () => "ran", { redis: redis as never })).toBe("ran");
  });

  it("stops waiting when the request is cancelled", async () => {
    const { withChatUserLock } = await loadLock();
    redis.put(KEY("u-10"), "other-instance");
    const controller = new AbortController();
    let ran = false;

    const pending = withChatUserLock("u-10", async () => {
      ran = true;
    }, { redis: redis as never, signal: controller.signal });
    await tick();
    controller.abort(new Error("client went away"));

    await expect(pending).rejects.toThrow("client went away");
    expect(ran).toBe(false);
  });

  // One slow reply must not be read as "Redis is down" while the key is held.
  it("does not run unlocked after a transient error while the lock is held elsewhere", async () => {
    const { withChatUserLock, ChatUserBusyError } = await loadLock({ wait: 300 });
    redis.put(KEY("u-11"), "other-instance");
    let ran = false;

    const pending = withChatUserLock("u-11", async () => {
      ran = true;
    }, { redis: redis as never });
    await tick(150);
    redis.failNext = 1;

    await expect(pending).rejects.toBeInstanceOf(ChatUserBusyError);
    expect(ran).toBe(false);
  });

  it("acquires normally after a transient error when the lock is free", async () => {
    const { withChatUserLock } = await loadLock();
    redis.failNext = 1;

    expect(await withChatUserLock("u-12", async () => "ran", { redis: redis as never })).toBe("ran");
    expect(redis.size).toBe(0);
  });

  it("stops the work once renewals keep failing and the lease cannot be proven", async () => {
    const { withChatUserLock, ChatUserBusyError } = await loadLock({ ttl: 150 });

    await expect(
      withChatUserLock("u-13", async (signal) => {
        redis.failAll = true; // renewals start failing
        await new Promise<void>((resolve, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason));
          setTimeout(resolve, 1_000);
        });
      }, { redis: redis as never })
    ).rejects.toBeInstanceOf(ChatUserBusyError);
  });

  it("reports busy when ownership was lost even if the work then finished", async () => {
    const { withChatUserLock, ChatUserBusyError } = await loadLock({ ttl: 150 });

    await expect(
      withChatUserLock("u-14", async () => {
        redis.put(KEY("u-14"), "someone-else");
        await tick(120); // ignores its signal and completes
        return "token";
      }, { redis: redis as never })
    ).rejects.toBeInstanceOf(ChatUserBusyError);
  });

  // Once the key has been seen held, no number of later errors may turn the
  // wait into "Redis is down" and let the work run.
  it("stays strict through repeated errors after seeing the lock held", async () => {
    const { withChatUserLock, ChatUserBusyError } = await loadLock({ wait: 2_500 });
    redis.put(KEY("u-15"), "other-instance");
    let ran = false;

    const pending = withChatUserLock("u-15", async () => {
      ran = true;
    }, { redis: redis as never });
    await tick(50);
    redis.failNext = 4;

    await expect(pending).rejects.toBeInstanceOf(ChatUserBusyError);
    expect(ran).toBe(false);
  });

  // A reconnect takes ~500ms; three quick failures must not count as an outage.
  it("rides out a short disconnect instead of running unlocked", async () => {
    const { withChatUserLock, ChatUserBusyError } = await loadLock({ wait: 3_000 });
    redis.put(KEY("u-16"), "other-instance");
    redis.failAll = true;
    let ran = false;

    const pending = withChatUserLock("u-16", async () => {
      ran = true;
    }, { redis: redis as never });
    await tick(1_200); // three failures by now, but under the outage span
    redis.failAll = false; // reconnected; the key is still held elsewhere

    await expect(pending).rejects.toBeInstanceOf(ChatUserBusyError);
    expect(ran).toBe(false);
  });

  it("recognises its own lock when the SET reply was lost", async () => {
    const { withChatUserLock } = await loadLock({ wait: 2_000 });
    redis.loseReplyNext = true;
    const startedAt = Date.now();

    expect(await withChatUserLock("u-17", async () => "ran", { redis: redis as never })).toBe("ran");
    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(redis.size).toBe(0);
  });
});
