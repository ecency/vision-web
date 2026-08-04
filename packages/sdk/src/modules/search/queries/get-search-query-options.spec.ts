import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchQueryOptions,
  getControversialRisingInfiniteQueryOptions,
} from "./get-search-query-options";
import type { RequestError } from "../parse-json-response";

type QueryFn = (ctx: {
  pageParam?: unknown;
  signal?: AbortSignal;
}) => Promise<unknown>;

type RetryFn = (failureCount: number, error: Error) => boolean;

/**
 * Backed by a single readable body, like a real `Response`: reading it twice
 * throws and `json()` rejects on non-JSON. A permissive double would hide the
 * parser paths this spec exists to cover.
 */
function response(status: number, body: unknown, raw?: string) {
  const text = raw ?? JSON.stringify(body);
  let consumed = false;

  const read = async () => {
    if (consumed) {
      throw new TypeError("Body has already been consumed.");
    }
    consumed = true;
    return text;
  };

  return {
    ok: status >= 200 && status < 300,
    status,
    text: read,
    json: async () => JSON.parse(await read()) as unknown,
  } as unknown as Response;
}

const emptyPage = { hits: 0, took: 1, results: [] };

/**
 * `MAX_RETRIES` in retry-policy.ts is read from `isServer` at module scope, so
 * the browser budget only exists in a module instance loaded with isServer
 * false. Under vitest's node environment it is true, which would make every
 * retry assertion trivially false.
 */
async function loadForEnv(isServer: boolean) {
  vi.resetModules();
  vi.doMock("@tanstack/react-query", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@tanstack/react-query")>();
    return { ...actual, isServer };
  });
  return import("./get-search-query-options");
}

const rejection = (status: number) => {
  const error = new Error(`Request failed with status ${status}`) as RequestError;
  error.status = status;
  return error;
};

describe("search query options error and retry parity", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@tanstack/react-query");
    vi.resetModules();
  });

  // Regression for the "every failure looks like zero results" defect. This
  // path is what the mobile app's post search calls, and it was still throwing
  // a bare `Search failed: <status>` after the infinite-query path was fixed.
  describe("searchQueryOptions", () => {
    it("puts the status and the backend's body on the error", async () => {
      fetchMock.mockResolvedValueOnce(
        response(400, { message: { q: "Maximum 5 tags!" } })
      );

      const error = await (
        searchQueryOptions("a tag:1,2,3,4,5,6", "relevance", "0").queryFn as QueryFn
      )({ signal: undefined }).then(
        () => undefined,
        (e: RequestError) => e
      );

      expect(error?.status).toBe(400);
      expect(error?.data).toEqual({ message: { q: "Maximum 5 tags!" } });
    });

    it("keeps a non-JSON failure body as raw text", async () => {
      fetchMock.mockResolvedValueOnce(
        response(502, undefined, "<html>bad gateway</html>")
      );

      const error = await (
        searchQueryOptions("coffee", "relevance", "0").queryFn as QueryFn
      )({ signal: undefined }).then(
        () => undefined,
        (e: RequestError) => e
      );

      expect(error?.status).toBe(502);
      expect(error?.data).toBe("<html>bad gateway</html>");
    });

    it("rejects a 2xx whose body is not JSON", async () => {
      // A proxy can answer 200 with an HTML page. Handing that back as the
      // parsed payload would cache a string as a SearchResponse: consumers
      // reading .results would report an empty result set, and the
      // controversial/rising pager would throw on resp.results.length.
      fetchMock.mockResolvedValueOnce(
        response(200, undefined, "<html>maintenance</html>")
      );

      await expect(
        (searchQueryOptions("coffee", "relevance", "0").queryFn as QueryFn)({
          signal: undefined,
        })
      ).rejects.toThrow("Response body was empty or invalid JSON");
    });

    it("resolves with the parsed body on success", async () => {
      fetchMock.mockResolvedValueOnce(response(200, emptyPage));

      await expect(
        (searchQueryOptions("coffee", "relevance", "0").queryFn as QueryFn)({
          signal: undefined,
        })
      ).resolves.toEqual(emptyPage);
    });

    it("does not retry a rejected query, but does retry transient failures", async () => {
      const mod = await loadForEnv(false);
      const retry = mod.searchQueryOptions("coffee", "relevance", "0").retry as RetryFn;

      expect(retry(0, rejection(400))).toBe(false);
      expect(retry(0, rejection(404))).toBe(false);
      expect(retry(0, rejection(429))).toBe(true);
      expect(retry(0, rejection(408))).toBe(true);
      expect(retry(0, rejection(503))).toBe(true);
      expect(retry(0, new Error("Failed to fetch"))).toBe(true);
      // Budget is the library default of 3 attempts after the first.
      expect(retry(3, rejection(503))).toBe(false);
    });

    it("does not retry at all on the server", async () => {
      const mod = await loadForEnv(true);
      const retry = mod.searchQueryOptions("coffee", "relevance", "0").retry as RetryFn;

      expect(retry(0, rejection(503))).toBe(false);
      expect(retry(0, new Error("Failed to fetch"))).toBe(false);
    });
  });

  describe("getControversialRisingInfiniteQueryOptions", () => {
    it("puts the status and the body on the error", async () => {
      fetchMock.mockResolvedValueOnce(response(400, { error: "Query required" }));

      const error = await (
        getControversialRisingInfiniteQueryOptions("controversial", "today")
          .queryFn as QueryFn
      )({ pageParam: { sid: undefined, hasNextPage: true }, signal: undefined }).then(
        () => undefined,
        (e: RequestError) => e
      );

      expect(error?.status).toBe(400);
      expect(error?.data).toEqual({ error: "Query required" });
    });

    it("carries the same retry rule", async () => {
      const mod = await loadForEnv(false);
      const retry = mod.getControversialRisingInfiniteQueryOptions("rising", "week")
        .retry as RetryFn;

      expect(retry(0, rejection(400))).toBe(false);
      expect(retry(0, rejection(429))).toBe(true);
      expect(retry(0, new Error("Failed to fetch"))).toBe(true);
    });

    it("short-circuits without fetching once there is no next page", async () => {
      const result = await (
        getControversialRisingInfiniteQueryOptions("controversial", "today")
          .queryFn as QueryFn
      )({ pageParam: { sid: "x", hasNextPage: false }, signal: undefined });

      expect(result).toEqual({ hits: 0, took: 0, results: [] });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
