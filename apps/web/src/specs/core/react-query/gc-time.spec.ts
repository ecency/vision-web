import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `isServer` is read at module load, so each case needs the module re-imported
 * with the flag it is asserting about.
 */
async function loadWith(isServer: boolean) {
  vi.resetModules();
  vi.doMock("@tanstack/react-query", async () => ({
    ...(await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")),
    isServer
  }));
  return import("@/core/react-query");
}

const THIRTY_MINUTES = 30 * 60 * 1000;

describe("query client gcTime", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the server default short enough to bound the retained working set", async () => {
    const { makeQueryClient, SERVER_GC_TIME } = await loadWith(true);

    expect(makeQueryClient().getDefaultOptions().queries?.gcTime).toBe(SERVER_GC_TIME);
  });

  it("leaves the browser default long, where the working set is one user's", async () => {
    const { makeQueryClient } = await loadWith(false);

    expect(makeQueryClient().getDefaultOptions().queries?.gcTime).toBe(10 * 60 * 1000);
  });

  /**
   * The regression the default alone does not cover. Per-query `gcTime` wins
   * over the default, and a query that outlives the request does not only
   * retain itself: React Query's gc timer closes over its Query, and `Query`
   * holds `#cache`, so one long-lived entry pins every other entry that request
   * cached. `getPollQueryOptions` (30 minutes, rendered during entry SSR) and
   * `getBadActorsQueryOptions` (`Infinity`) both do this.
   */
  it("clamps a per-query override on the server", async () => {
    const { makeQueryClient, SERVER_GC_TIME } = await loadWith(true);
    const client = makeQueryClient();

    const resolved = client.defaultQueryOptions({
      queryKey: ["poll", "author", "permlink"],
      gcTime: THIRTY_MINUTES
    });

    expect(resolved.gcTime).toBe(SERVER_GC_TIME);
  });

  /**
   * `Infinity` must survive the clamp. It is the one value that schedules no gc
   * timer — query-core's `isValidTimeout` rejects non-finite timeouts — so with
   * a per-request client the entry dies with its request. Turning it into a
   * finite window would create a timer that retains the Query and its whole
   * QueryCache for that window, which is worse than leaving it alone.
   */
  it("leaves an Infinity override alone on the server, since it schedules no timer", async () => {
    const { makeQueryClient } = await loadWith(true);
    const client = makeQueryClient();

    const resolved = client.defaultQueryOptions({
      queryKey: ["bad-actors"],
      gcTime: Infinity
    });

    expect(resolved.gcTime).toBe(Infinity);
  });

  it("schedules no gc timer for an Infinity query, so nothing is retained", async () => {
    const { makeQueryClient } = await loadWith(true);
    const client = makeQueryClient();
    vi.useFakeTimers();

    await client.fetchQuery({
      queryKey: ["bad-actors"],
      gcTime: Infinity,
      queryFn: async () => new Set(["a"])
    });

    // No timer means nothing schedules removal; the entry is released by the
    // request scope dropping the client, not by a timeout firing.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves per-query overrides alone in the browser", async () => {
    const { makeQueryClient } = await loadWith(false);
    const client = makeQueryClient();

    const resolved = client.defaultQueryOptions({
      queryKey: ["poll", "author", "permlink"],
      gcTime: THIRTY_MINUTES
    });

    expect(resolved.gcTime).toBe(THIRTY_MINUTES);
  });

  /**
   * The bound has to hold in behaviour, not just in resolved options: the
   * cached payload must actually be dropped once the window passes, including
   * for a query that asked to live far longer.
   */
  it("drops a cached payload after the server window, despite a long override", async () => {
    const { makeQueryClient, SERVER_GC_TIME } = await loadWith(true);
    const client = makeQueryClient();
    vi.useFakeTimers();

    await client.fetchQuery({
      queryKey: ["poll", "author", "permlink"],
      gcTime: THIRTY_MINUTES,
      queryFn: async () => ({ payload: "x".repeat(1024) })
    });

    expect(client.getQueryCache().findAll()).toHaveLength(1);

    vi.advanceTimersByTime(SERVER_GC_TIME + 1000);

    expect(client.getQueryCache().findAll()).toHaveLength(0);
  });

  /**
   * A single server render takes ~1-5s; the window only has to outlast that,
   * since the data is dehydrated into the payload as soon as the render ends.
   * Guards against tightening this to where entries expire mid-render.
   */
  it("still outlasts a single server render by a wide margin", async () => {
    const { SERVER_GC_TIME } = await loadWith(true);

    expect(SERVER_GC_TIME).toBeGreaterThanOrEqual(30 * 1000);
  });
});
