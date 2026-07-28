import { describe, expect, it } from "vitest";
import type { DehydratedState } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import {
  stripActiveVotesFromDehydratedState,
  stripActiveVotesFromValue,
  stripAnonEntryCacheInPlace
} from "@/core/react-query/strip-active-votes";

function entry(overrides: Record<string, any> = {}) {
  return {
    author: "alice",
    permlink: "p",
    net_rshares: 0,
    stats: { total_votes: 3, flag_weight: 0, gray: false, hide: false },
    active_votes: [
      { voter: "a", rshares: 1 },
      { voter: "b", rshares: 2 },
      { voter: "c", rshares: 3 }
    ],
    ...overrides
  };
}

function dehydrated(data: unknown): DehydratedState {
  return {
    mutations: [],
    queries: [
      {
        queryKey: ["posts", "entry", "/@alice/p"],
        queryHash: "h",
        state: { data, dataUpdatedAt: 0, status: "success" } as any
      } as any
    ]
  };
}

describe("stripActiveVotesFromDehydratedState", () => {
  it("strips active_votes from a single dehydrated entry but keeps stats.total_votes", () => {
    const e = entry();
    const out = stripActiveVotesFromDehydratedState(dehydrated(e));
    const data = out.queries[0].state.data as any;
    expect(data.active_votes).toEqual([]);
    expect(data.stats.total_votes).toBe(3);
    // other fields untouched
    expect(data.author).toBe("alice");
  });

  it("does NOT mutate the original entry (clones)", () => {
    const e = entry();
    stripActiveVotesFromDehydratedState(dehydrated(e));
    expect(e.active_votes).toHaveLength(3);
  });

  it("returns the state UNCHANGED for a logged-in request (currentUser set) — keeps full votes for isVoted", () => {
    const e = entry();
    const state = dehydrated(e);
    const out = stripActiveVotesFromDehydratedState(state, "alice");
    expect(out).toBe(state);
    expect((out.queries[0].state.data as any).active_votes).toHaveLength(3);
  });

  it("strips for an anonymous request (no currentUser)", () => {
    const e = entry();
    const out = stripActiveVotesFromDehydratedState(dehydrated(e), undefined);
    expect((out.queries[0].state.data as any).active_votes).toEqual([]);
  });

  it("leaves entries WITHOUT stats.total_votes intact (so their vote count stays stable)", () => {
    const e = entry({ stats: undefined });
    const out = stripActiveVotesFromDehydratedState(dehydrated(e));
    expect((out.queries[0].state.data as any).active_votes).toHaveLength(3);
  });

  it("leaves an entry with already-empty active_votes referentially unchanged", () => {
    const e = entry({ active_votes: [] });
    const out = stripActiveVotesFromDehydratedState(dehydrated(e));
    expect(out.queries[0].state.data).toBe(e);
  });

  it("strips entries inside an infinite feed (pages of Entry[])", () => {
    const data = {
      pages: [[entry({ permlink: "p1" }), entry({ permlink: "p2" })], [entry({ permlink: "p3" })]],
      pageParams: [null]
    };
    const out = stripActiveVotesFromDehydratedState(dehydrated(data));
    const pages = (out.queries[0].state.data as any).pages;
    expect(pages[0][0].active_votes).toEqual([]);
    expect(pages[0][1].active_votes).toEqual([]);
    expect(pages[1][0].active_votes).toEqual([]);
    expect(pages[0][0].stats.total_votes).toBe(3);
  });

  it("strips a search result that carries a top-level total_votes instead of stats.total_votes", () => {
    const searchResult = {
      author: "alice",
      permlink: "s",
      total_votes: 42,
      active_votes: [
        { voter: "a", rshares: 1 },
        { voter: "b", rshares: 2 }
      ]
    };
    const out = stripActiveVotesFromDehydratedState(
      dehydrated({ pages: [{ results: [searchResult] }], pageParams: [null] })
    );
    const r = (out.queries[0].state.data as any).pages[0].results[0];
    expect(r.active_votes).toEqual([]);
    expect(r.total_votes).toBe(42);
  });

  it("strips entries inside an infinite search feed (pages of { results })", () => {
    const data = {
      pages: [{ results: [entry({ permlink: "s1" }), entry({ permlink: "s2" })], scroll_id: "x" }],
      pageParams: [null]
    };
    const out = stripActiveVotesFromDehydratedState(dehydrated(data));
    const page0 = (out.queries[0].state.data as any).pages[0];
    expect(page0.results[0].active_votes).toEqual([]);
    expect(page0.results[1].active_votes).toEqual([]);
    expect(page0.scroll_id).toBe("x");
  });

  it("strips a plain array of entries (discussion list)", () => {
    const out = stripActiveVotesFromDehydratedState(
      dehydrated([entry({ permlink: "r1" }), entry({ permlink: "r2" })])
    );
    const arr = out.queries[0].state.data as any[];
    expect(arr[0].active_votes).toEqual([]);
    expect(arr[1].active_votes).toEqual([]);
  });

  it("strips a keyed map of entries (raw bridge.get_discussion shape)", () => {
    const data = {
      "alice/p1": entry({ permlink: "p1" }),
      "bob/p2": entry({ permlink: "p2" })
    };
    const out = stripActiveVotesFromDehydratedState(dehydrated(data));
    const d = out.queries[0].state.data as any;
    expect(d["alice/p1"].active_votes).toEqual([]);
    expect(d["bob/p2"].active_votes).toEqual([]);
    expect(d["alice/p1"].stats.total_votes).toBe(3);
  });

  it("leaves non-entry query data untouched", () => {
    const data = { foo: "bar", count: 5, nested: { a: 1 } };
    const out = stripActiveVotesFromDehydratedState(dehydrated(data));
    expect(out.queries[0].state.data).toBe(data);
  });

  it("returns the same query objects when nothing changed", () => {
    const state = dehydrated({ foo: 1 });
    const out = stripActiveVotesFromDehydratedState(state);
    expect(out.queries[0]).toBe(state.queries[0]);
  });
});

describe("stripActiveVotesFromValue (props channel, e.g. profile initialFeed)", () => {
  it("strips an InfiniteData feed value for anonymous requests", () => {
    const feed = {
      pages: [[entry({ permlink: "p1" }), entry({ permlink: "p2" })]],
      pageParams: [null]
    };
    const out = stripActiveVotesFromValue(feed, undefined) as any;
    expect(out.pages[0][0].active_votes).toEqual([]);
    expect(out.pages[0][1].active_votes).toEqual([]);
    expect(out.pages[0][0].stats.total_votes).toBe(3);
  });

  it("strips a plain Entry[] (the profile entryList incl. pinned entry)", () => {
    const list = [entry({ permlink: "pinned" }), entry({ permlink: "a" })];
    const out = stripActiveVotesFromValue(list, undefined) as any[];
    expect(out[0].active_votes).toEqual([]);
    expect(out[1].active_votes).toEqual([]);
  });

  it("returns the value unchanged for a logged-in user", () => {
    const feed = { pages: [[entry({ permlink: "p1" })]], pageParams: [null] };
    const out = stripActiveVotesFromValue(feed, "alice");
    expect(out).toBe(feed);
    expect(out.pages[0][0].active_votes).toHaveLength(3);
  });

  it("passes through undefined (no feed prefetched)", () => {
    expect(stripActiveVotesFromValue(undefined, undefined)).toBeUndefined();
  });
});

// condenser_api.get_content has no `stats` object — its only count field is
// `net_votes`, which is upvotes MINUS downvotes, not a voter count (live posts:
// 848 voters vs net_votes 820, and 453 vs 423). Since entry-votes reads
// `stats.total_votes || active_votes.length || net_votes || total_votes`,
// stripping that shape would drop the displayed number to the net figure. It is
// therefore left unstripped, and nothing needs otherwise: the entry page keeps
// the metadata-only condenser query out of the dehydrated payload entirely.
describe("condenser_api.get_content shape (net_votes is NOT a voter count)", () => {
  function condenserEntry(overrides: Record<string, any> = {}) {
    return {
      author: "alice",
      permlink: "p",
      net_votes: 1, // deliberately != active_votes.length, as on real posts
      active_votes: [
        { voter: "a", rshares: 1 },
        { voter: "b", rshares: -2 }
      ],
      ...overrides
    };
  }

  it("does NOT strip an entry whose only surviving count is net_votes", () => {
    const out = stripActiveVotesFromDehydratedState(dehydrated(condenserEntry()));
    expect((out.queries[0].state.data as any).active_votes).toHaveLength(2);
  });

  it("does NOT strip that shape through the props channel either", () => {
    const out = stripActiveVotesFromValue(condenserEntry(), undefined) as any;
    expect(out.active_votes).toHaveLength(2);
  });

  it("DOES strip the same entry once a real voter count is present", () => {
    const out = stripActiveVotesFromValue(condenserEntry({ total_votes: 2 }), undefined) as any;
    expect(out.active_votes).toEqual([]);
    expect(out.total_votes).toBe(2);
  });

  it("still refuses to strip when NO vote count survives anywhere", () => {
    const e = { author: "alice", permlink: "p", active_votes: [{ voter: "a", rshares: 1 }] };
    const out = stripActiveVotesFromDehydratedState(dehydrated(e));
    expect((out.queries[0].state.data as any).active_votes).toHaveLength(1);
  });
});

// The identity-preserving variant used by the entry, community and waves routes.
// It rewrites the request-scoped cache so dehydrate() emits the same objects the
// page passes as props — Flight dedupes by reference, and two separate clones
// would serialize every post body twice.
describe("stripAnonEntryCacheInPlace", () => {
  function makeClient() {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } });
  }

  it("returns the STORED object, not the clone (setQueryData applies structural sharing)", () => {
    const qc = makeClient();
    const e = entry();
    qc.setQueryData(["posts", "entry", "/@alice/p"], e);

    const returned = stripAnonEntryCacheInPlace(qc, e);
    const stored = qc.getQueryData(["posts", "entry", "/@alice/p"]);

    expect(returned).toBe(stored); // the identity that makes Flight dedupe work
    expect((returned as any).active_votes).toEqual([]);
    expect((returned as any).stats.total_votes).toBe(3);
  });

  it("rewrites the cache so a later dehydrate carries no voters", () => {
    const qc = makeClient();
    qc.setQueryData(["posts", "entry", "/@alice/p"], entry());
    stripAnonEntryCacheInPlace(qc, undefined);
    expect((qc.getQueryData(["posts", "entry", "/@alice/p"]) as any).active_votes).toEqual([]);
  });

  it("strips every entry-bearing query, not just the one passed in", () => {
    const qc = makeClient();
    qc.setQueryData(["a"], entry({ permlink: "one" }));
    qc.setQueryData(["b"], { pages: [[entry({ permlink: "two" })]], pageParams: [null] });
    stripAnonEntryCacheInPlace(qc, undefined);
    expect((qc.getQueryData(["a"]) as any).active_votes).toEqual([]);
    expect((qc.getQueryData(["b"]) as any).pages[0][0].active_votes).toEqual([]);
  });

  it("bridges identity for an infinite feed value too", () => {
    const qc = makeClient();
    const feed = { pages: [[entry({ permlink: "p1" })]], pageParams: [null] };
    qc.setQueryData(["feed"], feed);
    const returned = stripAnonEntryCacheInPlace(qc, feed);
    expect(returned).toBe(qc.getQueryData(["feed"]));
    expect((returned as any).pages[0][0].active_votes).toEqual([]);
  });

  it("is a no-op for a logged-in user — cache and value untouched", () => {
    const qc = makeClient();
    const e = entry();
    qc.setQueryData(["posts", "entry", "/@alice/p"], e);
    const returned = stripAnonEntryCacheInPlace(qc, e, "alice");
    expect(returned).toBe(e);
    expect((qc.getQueryData(["posts", "entry", "/@alice/p"]) as any).active_votes).toHaveLength(3);
  });

  it("leaves the value alone when it holds nothing strippable", () => {
    const qc = makeClient();
    const plain = { foo: "bar" };
    qc.setQueryData(["plain"], plain);
    expect(stripAnonEntryCacheInPlace(qc, plain)).toBe(plain);
  });
});
