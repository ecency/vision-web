import { beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_GC_TIME_MS } from "./config";

/**
 * `isServer` is read when the query-options module is evaluated, so each case
 * re-imports it with the flag it is asserting about.
 */
async function loadWith(isServer: boolean) {
  vi.resetModules();
  vi.doMock("@tanstack/react-query", async () => ({
    ...(await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query")),
    isServer
  }));
  const polls = await import("@/modules/polls/queries/get-poll-query-options");
  const badActors = await import("@/modules/bad-actors/queries/get-bad-actors-query-options");
  return { polls, badActors };
}

describe("SDK query gcTime under SSR", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  /**
   * These two are the reason a server-side default is not enough on its own.
   * Per-query `gcTime` wins over the client default, React Query's gc timer
   * closes over its Query, and `Query` holds `#cache` — so one entry asking for
   * 30 minutes (or forever) keeps every other entry that request cached alive
   * for exactly that long.
   */
  it("bounds the poll query on the server", async () => {
    const { polls } = await loadWith(true);

    expect(polls.getPollQueryOptions("alice", "hello").gcTime).toBe(SERVER_GC_TIME_MS);
  });

  /**
   * bad-actors stays `Infinity` everywhere on purpose. It is the one value that
   * schedules no gc timer — query-core's `isValidTimeout` rejects non-finite
   * timeouts — so there is no GC root and, on a per-request client, the entry
   * dies with its request. Giving it a finite server window would *create* a
   * timer retaining the Query and its whole QueryCache: a regression.
   */
  it("leaves bad-actors unbounded on the server, since Infinity schedules no timer", async () => {
    const { badActors } = await loadWith(true);

    expect(badActors.getBadActorsQueryOptions().gcTime).toBe(Infinity);
  });

  it("keeps the long poll window off the server", async () => {
    const { polls } = await loadWith(false);

    expect(polls.getPollQueryOptions("alice", "hello").gcTime).toBe(30 * 60 * 1000);
  });

  it("keeps bad-actors cached for the session off the server", async () => {
    const { badActors } = await loadWith(false);

    expect(badActors.getBadActorsQueryOptions().gcTime).toBe(Infinity);
  });

  /**
   * Any *finite* server window must sit under the ceiling. Infinity is exempt
   * for the reason above — it is the absence of a timer, not a long one.
   */
  it("never lets a finite server window exceed the ceiling", async () => {
    const { polls, badActors } = await loadWith(true);

    const windows = [
      polls.getPollQueryOptions("alice", "hello").gcTime,
      badActors.getBadActorsQueryOptions().gcTime
    ];

    for (const gcTime of windows.filter((v) => Number.isFinite(v))) {
      expect(gcTime).toBeLessThanOrEqual(SERVER_GC_TIME_MS);
    }
    expect(windows.filter((v) => Number.isFinite(v))).not.toHaveLength(0);
  });

  /**
   * The window still has to outlast a render (~1-5s), since that is the only
   * chance a server-side entry has to be reused before it is dehydrated.
   */
  it("still outlasts a single server render", () => {
    expect(SERVER_GC_TIME_MS).toBeGreaterThanOrEqual(30 * 1000);
  });
});
