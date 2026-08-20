// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

/**
 * The SEO Redis client is built once per replica. These pin what a sitemap
 * request sees while that client is still connecting: no command is ever
 * queued (a queued command that timed out would still run later, after the
 * caller failed), callers wait, bounded, for the connection instead, and the
 * client keeps retrying rather than ending itself after a slow start.
 */
const ctor = vi.fn();
const instances: FakeRedis[] = [];
class FakeRedis extends EventEmitter {
  status = "connecting";
  constructor(url: string, options: Record<string, unknown>) {
    super();
    ctor(url, options);
    instances.push(this);
  }
}
vi.mock("ioredis", () => ({ default: FakeRedis }));

async function load() {
  vi.resetModules();
  // The module disables itself under vitest; lift that for these tests only.
  vi.stubEnv("VITEST", "");
  vi.stubEnv("SEO_REDIS_DISABLE", "");
  return import("@/features/seo/seo-redis");
}

describe("seo-redis", () => {
  beforeEach(() => {
    ctor.mockClear();
    instances.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("never queues commands, gives the connect a real window, and never stops reconnecting", async () => {
    const { getSeoRedis } = await load();
    expect(getSeoRedis()).not.toBeNull();
    const options = ctor.mock.calls[0][1] as {
      enableOfflineQueue: boolean;
      maxRetriesPerRequest: number;
      connectTimeout: number;
      commandTimeout: number;
      retryStrategy: (times: number) => number | null;
    };
    expect(options.enableOfflineQueue).toBe(false);
    expect(options.maxRetriesPerRequest).toBe(1);
    expect(options.connectTimeout).toBe(3000);
    expect(options.commandTimeout).toBe(2000);
    for (const times of [1, 10, 11, 500]) {
      const delay = options.retryStrategy(times);
      expect(typeof delay, `retry ${times}`).toBe("number");
      expect(delay as number).toBeLessThanOrEqual(5000);
    }
  });

  it("getSeoRedisReady returns a connected client at once and waits for one that is connecting", async () => {
    const { getSeoRedisReady } = await load();
    const pending = getSeoRedisReady(2000);
    const client = instances[0];
    expect(client.status).toBe("connecting");
    // Resolves as soon as the connection is ready, not after the full wait.
    setTimeout(() => {
      client.status = "ready";
      client.emit("ready");
    }, 10);
    expect(await pending).toBe(client);
    expect(await getSeoRedisReady(2000)).toBe(client); // already ready: no wait
  });

  it("getSeoRedisReady waits the whole connect window by default, then hands back null", async () => {
    vi.useFakeTimers();
    const { getSeoRedisReady } = await load();
    let settled = false;
    const pending = getSeoRedisReady().then((c) => {
      settled = true;
      return c;
    });
    // A connect that completes late inside its 3s window must still be served.
    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(instances[0].listenerCount("ready")).toBe(0); // listener removed
  });

  it("reuses the client, rebuilds it after the connection ends, and reports the first error once", async () => {
    const { getSeoRedis } = await load();
    const first = getSeoRedis();
    expect(getSeoRedis()).toBe(first);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    instances[0].emit("error", new Error("ECONNREFUSED"));
    instances[0].emit("error", new Error("ECONNREFUSED again"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("ECONNREFUSED");
    instances[0].emit("end");
    expect(getSeoRedis()).not.toBe(first);
    expect(ctor).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("stays off under the test runner and when explicitly disabled", async () => {
    vi.resetModules();
    vi.stubEnv("VITEST", "true");
    const { getSeoRedis, getSeoRedisReady } = await import("@/features/seo/seo-redis");
    expect(getSeoRedis()).toBeNull();
    expect(await getSeoRedisReady()).toBeNull();
    expect(ctor).not.toHaveBeenCalled();
  });
});
