import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFavoriteTagsInfiniteQueryOptions,
  getFavoriteTagsQueryOptions,
} from "./get-favorite-tags-query-options";

// getBoundFetch() caches the bound fetch on first call, so reuse one stable mock and
// reset it per test rather than recreating it.
const fetchMock = vi.fn();

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const row = (tag: string) => ({ _id: `id-${tag}`, tag, created: "2026-09-02T00:00:00+00:00", timestamp: 1 });

function runQueryFn<T extends { queryFn?: unknown }>(options: T, context: Record<string, unknown> = {}) {
  const queryFn = options.queryFn as (context: Record<string, unknown>) => Promise<unknown>;
  return queryFn(context);
}

describe("getFavoriteTagsQueryOptions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the access code to /private-api/favorite-tags and returns the rows", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([row("photography")]));

    await expect(runQueryFn(getFavoriteTagsQueryOptions("alice", "hs-token"))).resolves.toEqual([
      row("photography"),
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/private-api\/favorite-tags$/);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: "hs-token" });
  });

  it("is disabled and throws without auth, so a prefetch cannot hit the network", async () => {
    const options = getFavoriteTagsQueryOptions(undefined, undefined);

    expect(options.enabled).toBe(false);
    await expect(runQueryFn(options)).rejects.toThrow(/missing auth/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx response instead of returning an error page as rows", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });

    await expect(runQueryFn(getFavoriteTagsQueryOptions("alice", "hs-token"))).rejects.toThrow(
      /Failed to fetch favorite tags: 502/
    );
  });

  it("keys the list by user", () => {
    expect(getFavoriteTagsQueryOptions("alice", "x").queryKey).toEqual([
      "accounts",
      "favorite-tags",
      "alice",
    ]);
  });
});

describe("getFavoriteTagsInfiniteQueryOptions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the wrapped format with offset and limit and pages while has_next", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        data: [row("a"), row("b")],
        pagination: { total: 3, limit: 2, offset: 0, has_next: true },
      })
    );
    const options = getFavoriteTagsInfiniteQueryOptions("alice", "hs-token", 2);

    const page = (await runQueryFn(options, { pageParam: 0 })) as {
      data: unknown[];
      pagination: { has_next: boolean; offset: number; limit: number };
    };

    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /\/private-api\/favorite-tags\?format=wrapped&offset=0&limit=2$/
    );
    expect(page.data).toHaveLength(2);
    expect(options.getNextPageParam(page as never, [page as never], 0, [0])).toBe(2);

    const last = { ...page, pagination: { ...page.pagination, has_next: false } };
    expect(options.getNextPageParam(last as never, [last as never], 2, [2])).toBeUndefined();
  });

  it("answers an empty page without a request when there is no auth", async () => {
    const page = (await runQueryFn(getFavoriteTagsInfiniteQueryOptions(undefined, undefined, 5), {
      pageParam: 0,
    })) as { data: unknown[]; pagination: { has_next: boolean } };

    expect(page.data).toEqual([]);
    expect(page.pagination.has_next).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The infinite key is built with the trailing-undefined stripper, so the list key
  // without a limit is a prefix of every per-limit key and invalidates them all.
  it("keeps the limit-less key a prefix of the per-limit key", () => {
    const withLimit = getFavoriteTagsInfiniteQueryOptions("alice", "x", 10).queryKey;
    expect(withLimit).toEqual(["accounts", "favorite-tags", "infinite", "alice", 10]);
    expect(withLimit.slice(0, 4)).toEqual(["accounts", "favorite-tags", "infinite", "alice"]);
  });
});
