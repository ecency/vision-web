import { QueryClient } from "@tanstack/react-query";
import v8 from "node:v8";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryKeys } from "./query-keys";

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

/**
 * `WeakRef` is ES2021 and this package deliberately targets ES2020, so the
 * configured lib does not declare it. Reaching for the runtime global here
 * keeps the reference test-only instead of widening the package's target and
 * letting shipped source use ES2021.
 */
interface WeakRefLike<T extends object> {
  deref(): T | undefined;
}
const WeakRefImpl = (
  globalThis as unknown as {
    WeakRef: new <T extends object>(target: T) => WeakRefLike<T>;
  }
).WeakRef;

/**
 * A forced-collection hook without requiring the runner to be launched with
 * `--expose-gc`: flip the flag at runtime and pull `gc` out of a fresh context.
 * Returns undefined if the host disallows it, so the test skips instead of
 * failing somewhere it cannot measure.
 */
function resolveForcedGc(): (() => void) | undefined {
  const existing = (globalThis as { gc?: () => void }).gc;
  if (typeof existing === "function") return existing;
  try {
    v8.setFlagsFromString("--expose-gc");
    const exposed = vm.runInNewContext("gc");
    v8.setFlagsFromString("--no-expose-gc");
    return typeof exposed === "function" ? exposed : undefined;
  } catch {
    return undefined;
  }
}

const forceGc = resolveForcedGc();

/**
 * A few collections with a macrotask between, so the client is not kept alive
 * merely by still sitting in a register or on a live stack frame.
 */
async function collectGarbage() {
  for (let i = 0; i < 3; i++) {
    forceGc!();
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Builds the client inside its own frame and hands it to the caller's scope, so
 * the only strong reference left afterwards is whatever the caller keeps — not
 * a local in the test body.
 */
function openRequestScope(
  adopt: (client: QueryClient) => void
): WeakRefLike<QueryClient> {
  const client = new QueryClient();
  adopt(client);
  return new WeakRefImpl(client);
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
    // The same key production uses, so the test cannot drift from the real
    // cache-key contract.
    const entryKey = QueryKeys.posts.content("alice", "hello");

    ConfigManager.setQueryClientResolver(() => {
      let client = clientsByRequest.get(currentRequest);
      if (!client) {
        client = new QueryClient();
        clientsByRequest.set(currentRequest, client);
      }
      return client;
    });

    CONFIG.queryClient.setQueryData(entryKey, { title: "first" });

    expect(CONFIG.queryClient.getQueryData(entryKey)).toEqual({ title: "first" });

    currentRequest = "request-2";

    expect(CONFIG.queryClient.getQueryData(entryKey)).toBeUndefined();

    // And the first request's cache is a distinct object, so it becomes
    // unreachable once that request's scope is gone.
    currentRequest = "request-1";
    expect(CONFIG.queryClient).not.toBe(clientsByRequest.get("request-2"));
  });

  /**
   * The property the leak actually violated, asserted directly rather than
   * modelled: once a request is over and its scope stops handing the client
   * out, nothing in the SDK still points at it and the memory comes back.
   *
   * This is the case that fails against the old module-level
   * `queryClient: new QueryClient()` — that reference was permanent, so the
   * client stayed reachable for the life of the process no matter what the
   * request did.
   */
  it.skipIf(!forceGc)(
    "retains no reference to a request's client once the request is over",
    async () => {
      const { CONFIG, ConfigManager } = await loadConfig();
      let currentClient: QueryClient | undefined;

      const finishedRequest = openRequestScope((client) => {
        currentClient = client;
      });

      ConfigManager.setQueryClientResolver(() => currentClient!);

      // Use it the way a server render would, so the cache is non-empty and
      // holds real entries rather than being trivially collectable.
      CONFIG.queryClient.setQueryData(QueryKeys.posts.content("alice", "hello"), {
        title: "first"
      });
      expect(finishedRequest.deref()).toBeDefined();

      // Request ends: its scope moves on to the next request's client.
      openRequestScope((client) => {
        currentClient = client;
      });

      await collectGarbage();

      expect(finishedRequest.deref()).toBeUndefined();
    }
  );
});
