import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFavoriteTagCheckQueryOptions } from "./get-favorite-tag-check-query-options";

const fetchMock = vi.fn();

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => body,
});

function runQueryFn<T extends { queryFn?: unknown }>(options: T) {
  const queryFn = options.queryFn as (context: Record<string, never>) => Promise<unknown>;
  return queryFn({});
}

describe("getFavoriteTagCheckQueryOptions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the normalised tag and returns the boolean", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(true));

    await expect(runQueryFn(getFavoriteTagCheckQueryOptions("alice", "hs-token", "#Photography"))).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/private-api\/favorite-tags-check$/);
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      code: "hs-token",
      tag: "photography",
    });
  });

  // One cache entry per tag however it was spelled where the user met it.
  it("keys on the normalised tag so spellings share one entry", () => {
    expect(getFavoriteTagCheckQueryOptions("alice", "x", "#Photography").queryKey).toEqual(
      getFavoriteTagCheckQueryOptions("alice", "x", "photography").queryKey
    );
    expect(getFavoriteTagCheckQueryOptions("alice", "x", "photography").queryKey).toEqual([
      "accounts",
      "favorite-tags",
      "check",
      "alice",
      "photography",
    ]);
  });

  it("is disabled for a value that is not a usable tag and answers false without a request", async () => {
    for (const bad of ["hive-123456", "a b", "", undefined]) {
      const options = getFavoriteTagCheckQueryOptions("alice", "hs-token", bad);
      expect(options.enabled).toBe(false);
      await expect(runQueryFn(options)).resolves.toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is disabled and throws without auth", async () => {
    const options = getFavoriteTagCheckQueryOptions(undefined, undefined, "photography");

    expect(options.enabled).toBe(false);
    await expect(runQueryFn(options)).rejects.toThrow(/missing auth/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean body and a non-2xx status", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ followed: true }));
    await expect(runQueryFn(getFavoriteTagCheckQueryOptions("alice", "x", "photography"))).rejects.toThrow(
      /expected boolean/
    );

    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", json: async () => "" });
    await expect(runQueryFn(getFavoriteTagCheckQueryOptions("alice", "x", "photography"))).rejects.toThrow(
      /failed with status 401/
    );
  });
});
