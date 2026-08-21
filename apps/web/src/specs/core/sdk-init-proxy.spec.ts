// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * core/sdk-init.ts switches the server-side RPC proxy on at import time, and
 * only when the deployment asked for it AND both halves of the wiring are
 * present. A module with import-time side effects, so each case gets a fresh
 * module registry and its own environment.
 */
const stats = {
  served: 0,
  fallback: 0,
  skipped: 0,
  fallbackByReason: { status: 0, timeout: 0, transport: 0, validate: 0, parse: 0 }
};
const manager = {
  setPrivateApiHost: vi.fn(),
  setImageHost: vi.fn(),
  setHiveNodes: vi.fn(),
  setUserAgent: vi.fn(),
  setResilience: vi.fn(),
  setServerRpcProxy: vi.fn(),
  getServerRpcProxyStats: vi.fn(() => stats),
  setDmcaLists: vi.fn()
};
vi.mock("@ecency/sdk", () => ({ ConfigManager: manager }));

const REPORT_MS = 5 * 60 * 1000;
const ON = { SSR_RPC_PROXY: "1", SSR_INTERNAL_SECRET: "s3cret", INTERNAL_API_HOST: "http://vapi:4000" };

async function load(env: Record<string, string | undefined>): Promise<void> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    vi.stubEnv(k, v ?? "");
  }
  await import("@/core/sdk-init");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  manager.setServerRpcProxy.mockClear();
  manager.getServerRpcProxyStats.mockClear();
  stats.served = 0;
  stats.fallback = 0;
  stats.skipped = 0;
  for (const reason of Object.keys(stats.fallbackByReason) as (keyof typeof stats.fallbackByReason)[]) {
    stats.fallbackByReason[reason] = 0;
  }
});

describe("sdk-init server rpc proxy", () => {
  it("enables the proxy against the overlay host with the shared secret when switched on", async () => {
    await load({ SSR_RPC_PROXY: "1", SSR_INTERNAL_SECRET: "s3cret", INTERNAL_API_HOST: "http://vapi:4000/" });
    expect(manager.setServerRpcProxy).toHaveBeenCalledWith({
      url: "http://vapi:4000/private-api/ssr/rpc",
      headers: { "X-Ecency-Internal": "s3cret" },
      timeoutMs: 1600
    });
  });

  it.each([
    ["the switch is off", { SSR_RPC_PROXY: undefined, SSR_INTERNAL_SECRET: "s3cret", INTERNAL_API_HOST: "http://vapi:4000" }],
    ["the secret is missing", { SSR_RPC_PROXY: "1", SSR_INTERNAL_SECRET: undefined, INTERNAL_API_HOST: "http://vapi:4000" }],
    ["the host is missing", { SSR_RPC_PROXY: "1", SSR_INTERNAL_SECRET: "s3cret", INTERNAL_API_HOST: undefined }]
  ])("stays off when %s", async (_label, env) => {
    await load(env);
    expect(manager.setServerRpcProxy).not.toHaveBeenCalled();
  });

  describe("periodic [rpc-proxy] report", () => {
    it("prints one summary line per interval, only when the counters moved", async () => {
      vi.useFakeTimers();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await load(ON);
      expect(log).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(REPORT_MS);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenLastCalledWith(
        "[rpc-proxy] served=0 fallback=0 (status=0 timeout=0 transport=0 validate=0 parse=0) skipped=0"
      );

      // Nothing moved: silence, not a repeat.
      await vi.advanceTimersByTimeAsync(REPORT_MS * 3);
      expect(log).toHaveBeenCalledTimes(1);

      stats.served = 41;
      stats.fallback = 2;
      stats.fallbackByReason.transport = 2;
      stats.skipped = 7;
      await vi.advanceTimersByTimeAsync(REPORT_MS);
      expect(log).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenLastCalledWith(
        "[rpc-proxy] served=41 fallback=2 (status=0 timeout=0 transport=2 validate=0 parse=0) skipped=7"
      );
    });

    it("does not start when the proxy is off", async () => {
      vi.useFakeTimers();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await load({ ...ON, SSR_RPC_PROXY: undefined });
      await vi.advanceTimersByTimeAsync(REPORT_MS * 2);
      expect(manager.getServerRpcProxyStats).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });
  });
});
