import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `config.ts` keeps the resolver in module scope, so every case needs a fresh
 * copy of the module rather than a shared one carrying the previous test's
 * registration.
 */
async function loadConfig() {
  vi.resetModules();
  const config = await import("./config");
  const queriesManager = await import("./queries-manager");
  return { ...config, getQueryClient: queriesManager.getQueryClient };
}

describe("CONFIG.queryClient resolution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("falls back to one lazily created client when nothing is configured", async () => {
    const { CONFIG } = await loadConfig();

    const first = CONFIG.queryClient;

    expect(first).toBeInstanceOf(QueryClient);
    expect(CONFIG.queryClient).toBe(first);
  });

  it("returns the assigned client after setQueryClient", async () => {
    const { CONFIG, ConfigManager } = await loadConfig();
    const client = new QueryClient();

    ConfigManager.setQueryClient(client);

    expect(CONFIG.queryClient).toBe(client);
    expect(CONFIG.queryClient).toBe(client);
  });

  it("consults the resolver on every read rather than caching its result", async () => {
    const { CONFIG, ConfigManager } = await loadConfig();
    const first = new QueryClient();
    const second = new QueryClient();
    let current = first;

    ConfigManager.setQueryClientResolver(() => current);

    expect(CONFIG.queryClient).toBe(first);

    current = second;

    expect(CONFIG.queryClient).toBe(second);
  });

  it("lets a resolver supersede a previously assigned client", async () => {
    const { CONFIG, ConfigManager } = await loadConfig();
    const assigned = new QueryClient();
    const resolved = new QueryClient();

    ConfigManager.setQueryClient(assigned);
    ConfigManager.setQueryClientResolver(() => resolved);

    expect(CONFIG.queryClient).toBe(resolved);
  });

  it("lets an assigned client supersede a previously registered resolver", async () => {
    const { CONFIG, ConfigManager } = await loadConfig();
    const resolved = new QueryClient();
    const assigned = new QueryClient();

    ConfigManager.setQueryClientResolver(() => resolved);
    ConfigManager.setQueryClient(assigned);

    expect(CONFIG.queryClient).toBe(assigned);
  });

  it("routes SDK-internal getQueryClient through the resolver", async () => {
    const { ConfigManager, getQueryClient } = await loadConfig();
    const client = new QueryClient();

    ConfigManager.setQueryClientResolver(() => client);

    expect(getQueryClient()).toBe(client);
  });

  /**
   * The regression this file exists for. With a single process-wide client,
   * everything one server render cached stayed reachable for the life of the
   * process — unbounded heap growth, and one request able to read another's
   * cached data. A per-request resolver has to give each request its own cache.
   */
  it("keeps cached data from crossing between server requests", async () => {
    const { CONFIG, ConfigManager } = await loadConfig();
    const clientsByRequest = new Map<string, QueryClient>();
    let currentRequest = "request-1";

    ConfigManager.setQueryClientResolver(() => {
      let client = clientsByRequest.get(currentRequest);
      if (!client) {
        client = new QueryClient();
        clientsByRequest.set(currentRequest, client);
      }
      return client;
    });

    CONFIG.queryClient.setQueryData(["entry", "alice", "hello"], { title: "first" });

    expect(CONFIG.queryClient.getQueryData(["entry", "alice", "hello"])).toEqual({
      title: "first"
    });

    currentRequest = "request-2";

    expect(CONFIG.queryClient.getQueryData(["entry", "alice", "hello"])).toBeUndefined();

    // And the first request's cache is a distinct object, so it becomes
    // unreachable once that request's scope is gone.
    currentRequest = "request-1";
    expect(CONFIG.queryClient).not.toBe(clientsByRequest.get("request-2"));
  });
});
