import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getSearchApiInfiniteQueryOptions } from "./get-search-api-infinite-query-options";
import type { RequestError } from "../parse-json-response";

type QueryFn = (ctx: {
  pageParam?: string | undefined;
  signal?: AbortSignal;
}) => Promise<unknown>;

type RetryFn = (failureCount: number, error: Error) => boolean;

const options = (q = "coffee") => getSearchApiInfiniteQueryOptions(q, "popularity", true);

const retryOf = (opts: ReturnType<typeof getSearchApiInfiniteQueryOptions>) =>
  opts.retry as RetryFn;

/**
 * Backed by a single readable body, like a real `Response`: reading it twice
 * throws, and `json()` rejects when the body is not JSON. A permissive double
 * (independent `json()`/`text()`, `json()` resolving for any input) hides
 * exactly the bugs this parser can have - it let a `json()`-then-`text()`
 * fallback that can never run look covered.
 *
 * Pass `raw` to send a body that is not JSON at all.
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
 * `MAX_RETRIES` is read from `isServer` when the module is first evaluated, so
 * the two environments have to be loaded as two separate module instances.
 */
async function loadForEnv(isServer: boolean) {
  vi.resetModules();
  vi.doMock("@tanstack/react-query", async (importOriginal) => {
    const actual =
      await importOriginal<typeof import("@tanstack/react-query")>();
    return { ...actual, isServer };
  });
  const mod = await import("./get-search-api-infinite-query-options");
  return mod.getSearchApiInfiniteQueryOptions;
}

describe("getSearchApiInfiniteQueryOptions", () => {
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

  describe("rejected queries keep the backend's answer", () => {
    // Regression for the "every failure looks like zero results" defect: the
    // search backend answers a malformed query with the reason it rejected it,
    // and a caller that only sees a thrown Error cannot tell a rejection from
    // an empty result set, let alone say what to change.
    it("puts the status and the body on the error for a 400", async () => {
      fetchMock.mockResolvedValueOnce(
        response(400, { error: "Parsed query is empty!" })
      );

      const error = await (options().queryFn as QueryFn)({
        pageParam: undefined,
        signal: undefined,
      }).then(
        () => undefined,
        (e: RequestError) => e
      );

      expect(error?.status).toBe(400);
      expect(error?.data).toEqual({ error: "Parsed query is empty!" });
      expect(error?.message).toContain("400");
    });

    it("keeps flask-restful's argument-validation shape intact", async () => {
      fetchMock.mockResolvedValueOnce(
        response(400, { message: { q: "Maximum 5 tags!" } })
      );

      const error = await (options("a tag:1,2,3,4,5,6").queryFn as QueryFn)({
        pageParam: undefined,
        signal: undefined,
      }).then(
        () => undefined,
        (e: RequestError) => e
      );

      expect(error?.status).toBe(400);
      expect(error?.data).toEqual({ message: { q: "Maximum 5 tags!" } });
    });

    it("keeps a non-JSON failure body as the raw text", async () => {
      // A proxy in front of the API answers with HTML, not JSON. The body is
      // read once and JSON.parse decides what it was, so this text survives.
      fetchMock.mockResolvedValueOnce(
        response(502, undefined, "<html>bad gateway</html>")
      );

      const error = await (options().queryFn as QueryFn)({
        pageParam: undefined,
        signal: undefined,
      }).then(
        () => undefined,
        (e: RequestError) => e
      );

      expect(error?.status).toBe(502);
      expect(error?.data).toBe("<html>bad gateway</html>");
    });

    it("rejects a 2xx whose body is not JSON", async () => {
      // Same rule as an empty body: an unparseable success is a failure. The
      // raw text is only kept for a FAILED response, where it is a diagnostic.
      fetchMock.mockResolvedValueOnce(response(200, undefined, "<html>maintenance</html>"));

      await expect(
        (options().queryFn as QueryFn)({ pageParam: undefined, signal: undefined })
      ).rejects.toThrow("Response body was empty, invalid JSON, or not the expected shape");
    });

    it("rejects an empty body rather than resolving with nothing", async () => {
      fetchMock.mockResolvedValueOnce(response(200, undefined, ""));

      await expect(
        (options().queryFn as QueryFn)({ pageParam: undefined, signal: undefined })
      ).rejects.toThrow("Response body was empty, invalid JSON, or not the expected shape");
    });


    it.each([
      ["a bare JSON string", '"maintenance"'],
      ["null", "null"],
      ["an error object with no results", '{"error":"upstream unavailable"}'],
      ["an array where an object is expected", "[]"],
    ])("rejects a 2xx carrying %s", async (_name, raw) => {
      // JSON.parse accepts all of these, so the undefined check alone let them
      // through as a SearchResponse. The pager then threw on resp.results.length
      // and the query had already cached the value as valid data.
      fetchMock.mockResolvedValueOnce(response(200, undefined, raw));

      await expect(
        (options().queryFn as QueryFn)({ pageParam: undefined, signal: undefined })
      ).rejects.toThrow("not the expected shape");
    });

    it("resolves with the parsed body on success", async () => {
      fetchMock.mockResolvedValueOnce(response(200, emptyPage));

      await expect(
        (options().queryFn as QueryFn)({ pageParam: undefined, signal: undefined })
      ).resolves.toEqual(emptyPage);
    });
  });

  describe("retry policy", () => {
    const rejection = (status: number) => {
      const error = new Error(`Request failed with status ${status}`) as RequestError;
      error.status = status;
      return error;
    };

    it("never retries a 4xx that rejects the query itself", async () => {
      const factory = await loadForEnv(false);
      const retry = retryOf(factory("coffee", "popularity", true));

      // The backend rejecting the query itself is deterministic: repeating it
      // only delays the message that says what to fix.
      [400, 404, 413].forEach((status) => {
        expect(retry(0, rejection(status))).toBe(false);
        expect(retry(2, rejection(status))).toBe(false);
      });
    });

    it("does retry the transient 4xx statuses", async () => {
      const factory = await loadForEnv(false);
      const retry = retryOf(factory("coffee", "popularity", true));

      // 429 and a gateway 408 describe when the request arrived, not what it
      // contained, and backing off is exactly what resolves them. Failing on
      // the first one is also sticky: with no pages, nothing retriggers.
      [408, 429].forEach((status) => {
        expect(retry(0, rejection(status))).toBe(true);
        expect(retry(2, rejection(status))).toBe(true);
        expect(retry(3, rejection(status))).toBe(false);
      });
    });

    it("still retries a 5xx and a transport failure in the browser", async () => {
      const factory = await loadForEnv(false);
      const retry = retryOf(factory("coffee", "popularity", true));

      expect(retry(0, rejection(500))).toBe(true);
      expect(retry(2, rejection(503))).toBe(true);
      // Budget is still the library default of 3 attempts after the first.
      expect(retry(3, rejection(500))).toBe(false);

      // A timeout or a dropped connection carries no status at all.
      expect(retry(0, new Error("Failed to fetch"))).toBe(true);
    });

    it("does not retry at all on the server", async () => {
      const factory = await loadForEnv(true);
      const retry = retryOf(factory("coffee", "popularity", true));

      expect(retry(0, rejection(500))).toBe(false);
      expect(retry(0, new Error("Failed to fetch"))).toBe(false);
    });

    it("costs one request for a rejected query and four for a failing backend", async () => {
      const factory = await loadForEnv(false);
      const client = new QueryClient({
        // Only collapses the backoff wait; the count is what is under test.
        defaultOptions: { queries: { retryDelay: 0 } },
      });

      fetchMock.mockImplementation(async () => response(400, { error: "Parsed query is empty!" }));
      await expect(
        client.fetchInfiniteQuery(factory("author:demo", "popularity", true))
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockReset();
      // Fresh per attempt: a real retry gets a new Response, and a reused body
      // would be unreadable after the first read.
      fetchMock.mockImplementation(async () => response(502, undefined, "<html>bad gateway</html>"));
      await expect(
        client.fetchInfiniteQuery(factory("coffee", "popularity", true))
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe("request payload", () => {
    const payloadOf = () =>
      JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);

    it("sends only the parameters that are set", async () => {
      fetchMock.mockResolvedValueOnce(response(200, emptyPage));

      await (options().queryFn as QueryFn)({ pageParam: undefined, signal: undefined });

      expect(String(fetchMock.mock.calls[0][0])).toContain("/search-api/search");
      expect(payloadOf()).toEqual({ q: "coffee", sort: "popularity", hide_low: true });
    });

    it("adds since, scroll_id and include_nsfw when they apply", async () => {
      fetchMock.mockResolvedValueOnce(response(200, emptyPage));

      await (
        getSearchApiInfiniteQueryOptions(
          "coffee",
          "popularity",
          false,
          "2026-01-01T00:00:00",
          undefined,
          true
        ).queryFn as QueryFn
      )({ pageParam: "scroll-2", signal: undefined });

      expect(payloadOf()).toEqual({
        q: "coffee",
        sort: "popularity",
        hide_low: false,
        since: "2026-01-01T00:00:00",
        scroll_id: "scroll-2",
        include_nsfw: 1,
      });
    });

    it("stays disabled without a query", () => {
      expect(options("").enabled).toBe(false);
      expect(options("coffee").enabled).toBe(true);
    });
  });
});
