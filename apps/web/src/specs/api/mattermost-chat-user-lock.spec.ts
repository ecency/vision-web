import { describe, it, expect } from "vitest";
import { withChatUserLock } from "@/server/chat-user-lock";

/** SET NX PX plus the compare-and-delete release, as the lock uses them. */
class FakeRedis {
  store = new Map<string, string>();
  failSet = false;

  async set(key: string, value: string, _px: string, _ttl: number, _nx: string) {
    if (this.failSet) throw new Error("redis down");
    if (this.store.has(key)) return null;
    this.store.set(key, value);
    return "OK";
  }

  async eval(_script: string, _keys: number, key: string, owner: string) {
    if (this.store.get(key) === owner) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("withChatUserLock", () => {
  // Two app instances share Redis but not memory: model that by giving each
  // call its own module-level chain is not possible here, so the Redis path is
  // exercised by holding the key from outside.
  it("waits for a lock held elsewhere and runs once it is released", async () => {
    const redis = new FakeRedis();
    redis.store.set("chat:tokenlock:u-1", "other-instance");
    const order: string[] = [];

    const pending = withChatUserLock("u-1", async () => order.push("ran"), { redis: redis as never });
    await tick();
    expect(order).toEqual([]);

    redis.store.delete("chat:tokenlock:u-1");
    await pending;
    expect(order).toEqual(["ran"]);
    expect(redis.store.size).toBe(0);
  });

  it("serialises calls for the same user within an instance", async () => {
    const order: string[] = [];
    const slow = withChatUserLock("u-2", async () => {
      order.push("a-start");
      await tick();
      order.push("a-end");
    }, { redis: null });
    const fast = withChatUserLock("u-2", async () => order.push("b"), { redis: null });

    await Promise.all([slow, fast]);
    expect(order).toEqual(["a-start", "a-end", "b"]);
  });

  it("does not hold other users up", async () => {
    const order: string[] = [];
    const slow = withChatUserLock("u-3", async () => {
      await tick();
      order.push("u-3");
    }, { redis: null });
    await withChatUserLock("u-4", async () => order.push("u-4"), { redis: null });
    await slow;

    expect(order).toEqual(["u-4", "u-3"]);
  });

  it("releases after a failure and keeps working for the next caller", async () => {
    const redis = new FakeRedis();

    await expect(
      withChatUserLock("u-5", async () => {
        throw new Error("boom");
      }, { redis: redis as never })
    ).rejects.toThrow("boom");

    expect(redis.store.size).toBe(0);
    expect(await withChatUserLock("u-5", async () => "ok", { redis: redis as never })).toBe("ok");
  });

  it("never releases a lock it does not own", async () => {
    const redis = new FakeRedis();
    await withChatUserLock("u-6", async () => {
      // Our lock expired and another instance took it.
      redis.store.set("chat:tokenlock:u-6", "someone-else");
    }, { redis: redis as never });

    expect(redis.store.get("chat:tokenlock:u-6")).toBe("someone-else");
  });

  it("runs anyway when Redis fails", async () => {
    const redis = new FakeRedis();
    redis.failSet = true;

    expect(await withChatUserLock("u-7", async () => "ran", { redis: redis as never })).toBe("ran");
  });

  it("stops waiting when the request is cancelled", async () => {
    const redis = new FakeRedis();
    redis.store.set("chat:tokenlock:u-8", "other-instance");
    const controller = new AbortController();
    let ran = false;

    const pending = withChatUserLock("u-8", async () => {
      ran = true;
    }, { redis: redis as never, signal: controller.signal });
    await tick();
    controller.abort(new Error("client went away"));

    await expect(pending).rejects.toThrow("client went away");
    expect(ran).toBe(false);
  });
});
