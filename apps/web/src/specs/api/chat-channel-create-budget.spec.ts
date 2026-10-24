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
    const broken = { incr: vi.fn(async () => { throw new Error("down"); }) } as unknown as Redis;
    expect(await takeChannelCreateSlot("u-1", broken)).toBe(false);
  });

  it("never leaves a counter without an expiry when Redis fails midway", async () => {
    const { redis, mock, ttls } = fakeRedis();
    mock.set.mockRejectedValueOnce(new Error("blip"));
    expect(await takeChannelCreateSlot("u-1", redis)).toBe(false);
    expect(mock.incr).not.toHaveBeenCalled();

    mock.incr.mockRejectedValueOnce(new Error("blip"));
    expect(await takeChannelCreateSlot("u-1", redis)).toBe(false);
    // the key exists only with its expiry, so it cannot lock the user out
    expect(ttls.get("chat:searchcreate:v1:u-1")).toBe(CHANNEL_CREATE_WINDOW_MS);
    expect(await takeChannelCreateSlot("u-1", redis)).toBe(true);
  });

  it("re-arms the expiry when the key vanished between SET and INCR", async () => {
    const { redis, mock, ttls } = fakeRedis();
    // SET sees an old key (no-op); it then expires before INCR recreates it
    mock.set.mockResolvedValueOnce(null);

    expect(await takeChannelCreateSlot("u-1", redis)).toBe(true);
    expect(ttls.get("chat:searchcreate:v1:u-1")).toBe(CHANNEL_CREATE_WINDOW_MS);
  });
});
