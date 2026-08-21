// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * core/sdk-init.ts switches the server-side RPC proxy on at import time, and
 * only when the deployment asked for it AND both halves of the wiring are
 * present. A module with import-time side effects, so each case gets a fresh
 * module registry and its own environment.
 */
const manager = {
  setPrivateApiHost: vi.fn(),
  setImageHost: vi.fn(),
  setHiveNodes: vi.fn(),
  setUserAgent: vi.fn(),
  setResilience: vi.fn(),
  setServerRpcProxy: vi.fn(),
  setDmcaLists: vi.fn()
};
vi.mock("@ecency/sdk", () => ({ ConfigManager: manager }));

async function load(env: Record<string, string | undefined>): Promise<void> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    vi.stubEnv(k, v ?? "");
  }
  await import("@/core/sdk-init");
}

afterEach(() => {
  vi.unstubAllEnvs();
  manager.setServerRpcProxy.mockClear();
});

describe("sdk-init server rpc proxy", () => {
  it("enables the proxy against the overlay host with the shared secret when switched on", async () => {
    await load({ SSR_RPC_PROXY: "1", SSR_INTERNAL_SECRET: "s3cret", INTERNAL_API_HOST: "http://vapi:4000/" });
    expect(manager.setServerRpcProxy).toHaveBeenCalledWith({
      url: "http://vapi:4000/private-api/ssr/rpc",
      headers: { "X-Ecency-Internal": "s3cret" },
      timeoutMs: 2000
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
});
