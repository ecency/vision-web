// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The SEO Redis client is built once per replica. These pin the options that
 * decide what a sitemap request sees while that client is still connecting:
 * it must wait (bounded), not fail on the spot, and the client must keep
 * retrying rather than end itself after a slow start.
 */
const ctor = vi.fn();
const handlers = new Map<string, (arg: unknown) => void>();
vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(url: string, options: Record<string, unknown>) {
      ctor(url, options);
    }
    on(event: string, fn: (arg: unknown) => void) {
      handlers.set(event, fn);
      return this;
    }
  }
}));

async function load() {
  vi.resetModules();
  // The module disables itself under vitest; lift that for these tests only.
  vi.stubEnv("VITEST", "");
  vi.stubEnv("SEO_REDIS_DISABLE", "");
  return import("@/features/seo/seo-redis");
}

describe("getSeoRedis", () => {
  beforeEach(() => {
    ctor.mockClear();
    handlers.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("queues commands while connecting, with a bounded wait, and never gives up reconnecting", async () => {
    const { getSeoRedis } = await load();
    expect(getSeoRedis()).not.toBeNull();
    expect(ctor).toHaveBeenCalledTimes(1);
    const options = ctor.mock.calls[0][1] as {
      enableOfflineQueue: boolean;
      maxRetriesPerRequest: number;
      connectTimeout: number;
      commandTimeout: number;
      retryStrategy: (times: number) => number | null;
    };
    expect(options.enableOfflineQueue).toBe(true);
    expect(options.maxRetriesPerRequest).toBe(1);
    expect(options.connectTimeout).toBeGreaterThanOrEqual(3000);
    expect(options.commandTimeout).toBeLessThanOrEqual(2000);
    for (const times of [1, 10, 11, 500]) {
      const delay = options.retryStrategy(times);
      expect(typeof delay, `retry ${times}`).toBe("number");
      expect(delay as number).toBeLessThanOrEqual(5000);
    }
  });

  it("reuses the client, rebuilds it after the connection ends, and reports the first error once", async () => {
    const { getSeoRedis } = await load();
    const first = getSeoRedis();
    expect(getSeoRedis()).toBe(first);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    handlers.get("error")!(new Error("ECONNREFUSED"));
    handlers.get("error")!(new Error("ECONNREFUSED again"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ECONNREFUSED");
    handlers.get("end")!(undefined);
    expect(getSeoRedis()).not.toBe(first);
    expect(ctor).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("stays off under the test runner and when explicitly disabled", async () => {
    vi.resetModules();
    vi.stubEnv("VITEST", "true");
    const { getSeoRedis } = await import("@/features/seo/seo-redis");
    expect(getSeoRedis()).toBeNull();
    expect(ctor).not.toHaveBeenCalled();
  });
});
