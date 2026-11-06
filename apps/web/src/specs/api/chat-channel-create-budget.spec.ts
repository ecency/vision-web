import { describe, it, expect, vi } from "vitest";
import type { Redis } from "ioredis";
import { CHANNEL_CREATE_MAX, CHANNEL_CREATE_WINDOW_MS, takeChannelCreateSlot } from "@/server/chat-channel-create-budget";

function fakeRedis() {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  const redis = {
    set: vi.fn(async (key: string, value: number, _px: string, ms: number, _nx: string) => {
      if (counts.has(key)) return null;
      counts.set(key, value);
      ttls.set(key, ms);
      return "OK";
    }),
    incr: vi.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    pexpire: vi.fn(async (key: string, ms: number, _nx: string) => {
      if (!ttls.has(key)) ttls.set(key, ms);
      return 1;
    }),
    // Stands in for the INCR + PEXPIRE-when-no-TTL script, run as one call.
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, ms: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      if (!ttls.has(key)) ttls.set(key, Number(ms));
      return next;
    })
  };
  return { redis: redis as unknown as Redis, mock: redis, ttls };
}

describe("takeChannelCreateSlot", () => {
  it("allows up to the hourly cap per user, then refuses", async () => {
    const { redis, ttls } = fakeRedis();
    const results: boolean[] = [];
    for (let i = 0; i < CHANNEL_CREATE_MAX + 1; i++) {
      results.push(await takeChannelCreateSlot("u-1", redis));
    }
    expect(results.filter(Boolean)).toHaveLength(CHANNEL_CREATE_MAX);
    expect(results[CHANNEL_CREATE_MAX]).toBe(false);
    expect(ttls.get("chat:searchcreate:v1:u-1")).toBe(CHANNEL_CREATE_WINDOW_MS);
    // another user has their own budget
    expect(await takeChannelCreateSlot("u-2", redis)).toBe(true);
  });

  it("refuses when Redis is missing or failing", async () => {
    expect(await takeChannelCreateSlot("u-1", null)).toBe(false);
    const broken = {
      eval: vi.fn(async () => {
        throw new Error("down");
      })
    } as unknown as Redis;
    expect(await takeChannelCreateSlot("u-1", broken)).toBe(false);
  });

  it("counts and sets the expiry in one Redis call", async () => {
    const { redis, mock } = fakeRedis();
    expect(await takeChannelCreateSlot("u-1", redis)).toBe(true);
    expect(mock.eval).toHaveBeenCalledTimes(1);
    expect(mock.eval).toHaveBeenCalledWith(
      expect.stringContaining("PEXPIRE"),
      1,
      "chat:searchcreate:v1:u-1",
      String(CHANNEL_CREATE_WINDOW_MS)
    );
  });

  it("repairs a counter that was left without an expiry", async () => {
    const { redis, mock, ttls } = fakeRedis();
    // Stuck state from #1990: INCR recreated the key with no TTL past the
    // first count, and the PEXPIRE after it failed.
    await mock.incr("chat:searchcreate:v1:u-1");
    await mock.incr("chat:searchcreate:v1:u-1");
    expect(ttls.has("chat:searchcreate:v1:u-1")).toBe(false);

    await takeChannelCreateSlot("u-1", redis);
    expect(ttls.get("chat:searchcreate:v1:u-1")).toBe(CHANNEL_CREATE_WINDOW_MS);
  });
});
