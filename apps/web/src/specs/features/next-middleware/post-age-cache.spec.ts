import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPostAgeCacheForTests,
  __setRedisForTests,
  awaitPostCreatedMs,
  getCachedPostCreatedMs,
  refreshPostCreatedMs
} from "@/features/next-middleware";

// Minimal mock — importing the real @ecency/sdk fails in jsdom because
// ByteBuffer.ts uses TextEncoder at module level (not available in jsdom).
// Only callRPC is used by post-age-cache, so a stub is sufficient.
vi.mock("@ecency/sdk", () => ({
  callRPC: vi.fn()
}));

import { callRPC } from "@ecency/sdk";

// Minimal stand-in for the bits of ioredis we touch on the request path.
type FakeRedis = {
  get: (k: string) => Promise<string | null>;
  disconnect?: () => void;
};

describe("post-age-cache", () => {
  beforeEach(() => {
    __resetPostAgeCacheForTests();
    vi.mocked(callRPC).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined when nothing cached", () => {
    expect(getCachedPostCreatedMs("alice", "post")).toBeUndefined();
  });

  it("caches createdMs after successful refresh", async () => {
    vi.mocked(callRPC).mockResolvedValue({ created: "2025-01-15T12:00:00" });

    await refreshPostCreatedMs("alice", "post");

    expect(getCachedPostCreatedMs("alice", "post")).toBe(Date.parse("2025-01-15T12:00:00Z"));
  });

  it("passes correct RPC method, params, timeout, retries", async () => {
    vi.mocked(callRPC).mockResolvedValue({ created: "2025-01-15T12:00:00" });

    await refreshPostCreatedMs("alice", "post");

    expect(callRPC).toHaveBeenCalledWith("condenser_api.get_content", ["alice", "post"], 2000, 2);
  });

  it("does not cache on transient RPC failure (allows retry)", async () => {
    vi.mocked(callRPC).mockRejectedValue(new Error("all nodes failed"));

    await refreshPostCreatedMs("alice", "post");

    // Transient failures must NOT poison the cache. A negative entry would
    // be shared across replicas via Redis and over-cache fresh posts to the
    // default 1h/1d entry tier. Returning undefined lets the next request
    // re-trigger the fetch.
    expect(getCachedPostCreatedMs("alice", "post")).toBeUndefined();
  });

  it("negative-caches when created field is missing", async () => {
    vi.mocked(callRPC).mockResolvedValue({});

    await refreshPostCreatedMs("alice", "post");

    expect(getCachedPostCreatedMs("alice", "post")).toBeNull();
  });

  it("negative-caches when result is null", async () => {
    vi.mocked(callRPC).mockResolvedValue(null);

    await refreshPostCreatedMs("alice", "post");

    expect(getCachedPostCreatedMs("alice", "post")).toBeNull();
  });

  it("de-duplicates concurrent fetches for the same post", async () => {
    let resolve: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    vi.mocked(callRPC).mockReturnValue(
      pending.then(() => ({ created: "2025-01-15T12:00:00" })) as ReturnType<typeof callRPC>
    );

    const p1 = refreshPostCreatedMs("alice", "post");
    const p2 = refreshPostCreatedMs("alice", "post");
    const p3 = refreshPostCreatedMs("alice", "post");

    resolve!(undefined);
    await Promise.all([p1, p2, p3]);

    expect(callRPC).toHaveBeenCalledTimes(1);
  });

  it("separates cache entries by author/permlink", async () => {
    vi.mocked(callRPC)
      .mockResolvedValueOnce({ created: "2025-01-01T00:00:00" })
      .mockResolvedValueOnce({ created: "2025-06-01T00:00:00" });

    await refreshPostCreatedMs("alice", "post-a");
    await refreshPostCreatedMs("bob", "post-b");

    expect(getCachedPostCreatedMs("alice", "post-a")).toBe(Date.parse("2025-01-01T00:00:00Z"));
    expect(getCachedPostCreatedMs("bob", "post-b")).toBe(Date.parse("2025-06-01T00:00:00Z"));
  });
});

describe("awaitPostCreatedMs", () => {
  beforeEach(() => {
    __resetPostAgeCacheForTests();
    vi.mocked(callRPC).mockReset();
  });

  afterEach(() => {
    __setRedisForTests(undefined);
    vi.restoreAllMocks();
  });

  it("returns L1 value without consulting Redis on hit", async () => {
    vi.mocked(callRPC).mockResolvedValue({ created: "2025-01-15T12:00:00" });
    await refreshPostCreatedMs("alice", "post"); // populate L1

    const get = vi.fn();
    __setRedisForTests({ get } as FakeRedis as never);

    const v = await awaitPostCreatedMs("alice", "post");
    expect(v).toBe(Date.parse("2025-01-15T12:00:00Z"));
    expect(get).not.toHaveBeenCalled();
  });

  it("falls through to Redis on L1 miss and populates L1", async () => {
    const get = vi.fn().mockResolvedValue("1521633183000");
    __setRedisForTests({ get } as FakeRedis as never);

    const v = await awaitPostCreatedMs("alice", "post");
    expect(v).toBe(1521633183000);
    expect(get).toHaveBeenCalledWith("postage:alice/post");

    // Subsequent sync read should hit L1.
    expect(getCachedPostCreatedMs("alice", "post")).toBe(1521633183000);
  });

  it("returns undefined on Redis miss without poisoning L1", async () => {
    const get = vi.fn().mockResolvedValue(null);
    __setRedisForTests({ get } as FakeRedis as never);

    const v = await awaitPostCreatedMs("alice", "post");
    expect(v).toBeUndefined();
    expect(getCachedPostCreatedMs("alice", "post")).toBeUndefined();
  });

  it("returns undefined when Redis returns malformed value", async () => {
    const get = vi.fn().mockResolvedValue("not-a-number");
    __setRedisForTests({ get } as FakeRedis as never);

    const v = await awaitPostCreatedMs("alice", "post");
    expect(v).toBeUndefined();
  });

  it("returns undefined on Redis error", async () => {
    const get = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    __setRedisForTests({ get } as FakeRedis as never);

    const v = await awaitPostCreatedMs("alice", "post");
    expect(v).toBeUndefined();
  });

  it("returns undefined when no Redis client is available", async () => {
    __setRedisForTests(null);

    const v = await awaitPostCreatedMs("alice", "post");
    expect(v).toBeUndefined();
  });

  it("times out and returns undefined when Redis hangs past 50ms", async () => {
    // get() never resolves — Promise.race against the internal 50ms timer
    // must resolve to undefined.
    const get = vi.fn().mockReturnValue(new Promise(() => {}));
    __setRedisForTests({ get } as FakeRedis as never);

    const start = Date.now();
    const v = await awaitPostCreatedMs("alice", "post");
    const elapsed = Date.now() - start;

    expect(v).toBeUndefined();
    // Lower bound proves we waited the timeout window; upper bound a safety
    // margin so the test fails if the cap blows out.
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(500);
  });
});
