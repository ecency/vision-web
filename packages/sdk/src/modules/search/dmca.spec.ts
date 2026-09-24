import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { ConfigManager } from "@/modules/core";
import { search, similar } from "./requests";
import { searchQueryOptions, getControversialRisingInfiniteQueryOptions } from "./queries/get-search-query-options";
import { getSearchApiInfiniteQueryOptions } from "./queries/get-search-api-infinite-query-options";
import { getSimilarEntriesQueryOptions } from "./queries/get-similar-entries-query-options";
import { maskDmcaSearchResponse } from "./dmca";
import type { SearchResponse, SearchResult } from "./types/search-response";

/**
 * The search index is not DMCA-aware, so every /search-api path that returns
 * post rows has to mask listed rows on the client. These run the REAL request
 * and query functions against a stubbed fetch: the point is that no entry
 * point skips the mask, not what the mask helper does in isolation.
 */

const row = (author: string, permlink: string): SearchResult => ({
  id: 1,
  title: `${permlink} title`,
  title_marked: `<mark>${permlink}</mark> title`,
  body: `![cover](https://images.example/${permlink}.jpg) ${permlink} body`,
  body_marked: `${permlink} <mark>body</mark>`,
  category: "hive-1",
  author,
  permlink,
  author_rep: 60,
  total_payout: 1,
  payout: 1,
  total_votes: 3,
  up_votes: 3,
  img_url: `https://images.example/${permlink}.jpg`,
  created_at: "2026-09-01T00:00:00",
  children: 0,
  tags: ["hive-1"],
  app: "ecency/1",
  depth: 0,
});

const page = (): SearchResponse => ({
  hits: 2,
  took: 1,
  scroll_id: "next",
  results: [row("alice", "fine-post"), row("bob", "stolen-post")],
});

function response(body: unknown) {
  const text = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    text: async () => text,
    json: async () => JSON.parse(text) as unknown,
  } as unknown as Response;
}

type Fn = (ctx: { pageParam?: unknown; signal?: AbortSignal }) => Promise<unknown>;

const fetchMock = vi.fn();

function expectMasked(r: SearchResult) {
  expect(r.author).toBe("bob");
  expect(r.permlink).toBe("stolen-post");
  expect(r.title).toBe("");
  expect(r.title_marked).toBeNull();
  expect(r.body_marked).toBeNull();
  expect(r.img_url).toBe("");
  expect(r.body).not.toContain("stolen-post");
  expect(r.body).not.toContain("images.example");
}

function expectPage(resp: SearchResponse) {
  // Masked, not dropped: counts and cursor stay what the backend said.
  expect(resp.hits).toBe(2);
  expect(resp.scroll_id).toBe("next");
  expect(resp.results).toHaveLength(2);
  expect(resp.results[0]).toEqual(row("alice", "fine-post"));
  expectMasked(resp.results[1]);
}

describe("search takedown mask", () => {
  beforeAll(() => {
    // getBoundFetch caches the first global fetch it sees, so stub once.
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    ConfigManager.setDmcaLists({});
  });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => response(page()));
    ConfigManager.setDmcaLists({ posts: ["@bob/stolen-post"] });
  });

  it("masks the listed row from search()", async () => {
    expectPage(await search("q", "newest", "0"));
  });

  it("masks the listed row from similar()", async () => {
    expectPage(await similar({ author: "carol", permlink: "source" }));
  });

  it("masks the listed row from searchQueryOptions", async () => {
    const opts = searchQueryOptions("q", "newest", "0");
    expectPage((await (opts.queryFn as unknown as Fn)({})) as SearchResponse);
  });

  it("masks the listed row from getSearchApiInfiniteQueryOptions", async () => {
    const opts = getSearchApiInfiniteQueryOptions("q", "newest", false);
    expectPage((await (opts.queryFn as unknown as Fn)({ pageParam: undefined })) as SearchResponse);
  });

  it("masks the listed row from getControversialRisingInfiniteQueryOptions", async () => {
    const opts = getControversialRisingInfiniteQueryOptions("controversial", "week");
    expectPage(
      (await (opts.queryFn as unknown as Fn)({
        pageParam: { sid: undefined, hasNextPage: true },
      })) as SearchResponse
    );
  });

  it("leaves the related-posts strip without the listed post", async () => {
    fetchMock.mockImplementation(async () =>
      response({
        hits: 3,
        took: 1,
        results: [row("bob", "stolen-post"), row("alice", "fine-post"), row("dave", "other")],
      })
    );
    const opts = getSimilarEntriesQueryOptions({ author: "carol", permlink: "source" });
    const results = (await (opts.queryFn as unknown as Fn)({})) as SearchResult[];
    expect(results.map((r) => r.permlink)).toEqual(["fine-post", "other"]);
  });

  it("does not match a prefix of a listed path", () => {
    ConfigManager.setDmcaLists({ posts: ["@bob/stolen-post"] });
    const input: SearchResponse = { ...page(), results: [row("bob", "stolen-post-2")] };
    expect(maskDmcaSearchResponse(input)).toBe(input);
  });

  it("returns the same response when nothing is listed", () => {
    ConfigManager.setDmcaLists({});
    const input = page();
    expect(maskDmcaSearchResponse(input)).toBe(input);
  });
});
