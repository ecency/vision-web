import { describe, it, expect, vi } from "vitest";
import type { Redis } from "ioredis";
import { CHANNEL_CREATE_MAX, takeChannelCreateSlot } from "@/server/chat-channel-create-budget";

function fakeRedis(): Redis {
  const counts = new Map<string, number>();
  return {
    incr: vi.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    pexpire: vi.fn(async () => 1)
  } as unknown as Redis;
}

describe("takeChannelCreateSlot", () => {
  it("allows up to the hourly cap per user, then refuses", async () => {
    const redis = fakeRedis();
    const results: boolean[] = [];
    for (let i = 0; i < CHANNEL_CREATE_MAX + 1; i++) {
      results.push(await takeChannelCreateSlot("u-1", redis));
    }
    expect(results.filter(Boolean)).toHaveLength(CHANNEL_CREATE_MAX);
    expect(results[CHANNEL_CREATE_MAX]).toBe(false);
    expect(redis.pexpire).toHaveBeenCalledTimes(1);
    // another user has their own budget
    expect(await takeChannelCreateSlot("u-2", redis)).toBe(true);
  });

  it("refuses when Redis is missing or failing", async () => {
    expect(await takeChannelCreateSlot("u-1", null)).toBe(false);
    const broken = { incr: vi.fn(async () => { throw new Error("down"); }) } as unknown as Redis;
    expect(await takeChannelCreateSlot("u-1", broken)).toBe(false);
  });
});
