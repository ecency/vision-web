import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import {
  dedupeCurationPages,
  getCurationFeedInfiniteQueryOptions
} from "./get-curation-feed-infinite-query-options";
import type { CurationFeedPage, CurationRow } from "../types";

const fetchMock = vi.fn();

function row(post_id: number, extra: Partial<CurationRow> = {}): CurationRow {
  return {
    post_id,
    author: `a${post_id}`,
    permlink: `p${post_id}`,
    title: "t",
    created: "2026-09-05T00:00:00Z",
    app: null,
    is_ecency: true,
    community: null,
    community_title: null,
    tags: [],
    rep: 50,
    is_new_author: false,
    author_post_count: 10,
    word_count: 300,
    image_count: 0,
    first_image: null,
    summary: null,
    edited_at: null,
    edit_count: 0,
    votes: 0,
    pending_payout: 0,
    payout_at: "2026-09-12T00:00:00Z",
    state: 0,
    trailed_by: null,
    voted_by: [],
    author_trailed_at: null,
    recommend_count: 0,
    unique_recommenders: 0,
    reco_no_meta_count: 0,
    _cursor: `c${post_id}`,
    ...extra
  };
}

function page(items: CurationRow[]): CurationFeedPage {
  return {
    items,
    next_cursor: items.length ? `c${items[items.length - 1].post_id}` : null,
    team_cursor: { post_id: null, created: null },
    head_lag_seconds: 3,
    feed_version: "v1",
    generated_at: "2026-09-05T00:00:00Z"
  };
}

describe("getCurationFeedInfiniteQueryOptions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("puts the sort, the seed and every filter on the key, defaults dropped", () => {
    const { queryKey } = getCurationFeedInfiniteQueryOptions({
      sort: "random",
      seed: "abcd1234",
      view: "queue",
      app: "peakd",
      community: "hive-125125",
      window: "half",
      rep_min: 25,
      rep_max: 75,
      min_words: 300,
      max_words: 1000,
      has_images: true,
      new_authors: true,
      recommended: true,
      hide_curated: false,
      limit: 25
    } as any);
    expect(queryKey).toEqual([
      "curation",
      "feed",
      {
        sort: "random",
        seed: "abcd1234",
        view: "queue",
        app: "peakd",
        community: "hive-125125",
        window: "half",
        rep_min: "25",
        rep_max: "75",
        min_words: "300",
        max_words: "1000",
        has_images: "1",
        new_authors: "1",
        recommended: "1",
        hide_curated: "0",
        limit: "25"
      }
    ]);
  });

  it("drops `all` values, false booleans, bad communities and a seed outside random", () => {
    const { queryKey } = getCurationFeedInfiniteQueryOptions({
      sort: "newest",
      seed: "abcd1234",
      app: "all",
      window: "all",
      community: "not-a-community",
      has_images: false
    } as any);
    expect(queryKey[2]).toEqual({ sort: "newest", limit: "25" });
  });

  it("two different sorts never share a key", () => {
    const a = getCurationFeedInfiniteQueryOptions({ sort: "queue" }).queryKey;
    const b = getCurationFeedInfiniteQueryOptions({ sort: "newest" }).queryKey;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("passes the last row's _cursor opaque and stops on a short page", () => {
    const options = getCurationFeedInfiniteQueryOptions({ limit: 2 });
    const full = page([row(1), row(2, { _cursor: "opaque:zzz" })]);
    expect(options.getNextPageParam(full, [full], undefined, [undefined])).toBe("opaque:zzz");
    const short = page([row(3)]);
    expect(options.getNextPageParam(short, [short], undefined, [undefined])).toBeUndefined();
  });

  it("requests page 1 without a cursor and later pages with it, params in a fixed order", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => page([])
    });
    const options = getCurationFeedInfiniteQueryOptions({ sort: "newest", app: "ecency", limit: 25 });
    await (options.queryFn as any)({ pageParam: undefined, signal: undefined });
    await (options.queryFn as any)({ pageParam: "c9", signal: undefined });
    const first = String(fetchMock.mock.calls[0][0]);
    const second = String(fetchMock.mock.calls[1][0]);
    expect(first).toMatch(/\/private-api\/curation-desk\/feed\?sort=newest&app=ecency&limit=25$/);
    expect(second).toMatch(/sort=newest&app=ecency&limit=25&cursor=c9$/);
  });

  it("merging two pages that share a post_id yields one row", () => {
    const data: InfiniteData<CurationFeedPage> = {
      pages: [page([row(1), row(2)]), page([row(2), row(3)])],
      pageParams: [undefined, "c2"]
    };
    const result = dedupeCurationPages(data);
    const ids = result.pages.flatMap((p) => p.items.map((r) => r.post_id));
    expect(ids).toEqual([1, 2, 3]);
    // The untouched page keeps its identity so memoized rows do not re-render.
    expect(result.pages[0]).toBe(data.pages[0]);
  });

  it("returns the same data object when nothing repeats", () => {
    const data: InfiniteData<CurationFeedPage> = {
      pages: [page([row(1)]), page([row(2)])],
      pageParams: [undefined, "c1"]
    };
    expect(dedupeCurationPages(data)).toBe(data);
  });
});
