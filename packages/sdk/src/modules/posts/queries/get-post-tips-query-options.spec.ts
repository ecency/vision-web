import { afterEach, describe, expect, it, vi } from "vitest";
import { getPostTipsQueryOptions } from "./get-post-tips-query-options";

/**
 * Tips are a read. Requesting them as a GET on a URL is what lets the response be
 * cached at all, so the verb and the URL shape are the contract this file guards:
 * a regression back to a POST, or a permlink pasted into the path unencoded, both
 * silently cost every reader a network round trip per mount.
 */
describe("getPostTipsQueryOptions", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Typed with the real fetch signature so mock.calls carries the arguments;
  // an argument-less mock infers an empty tuple and asserting on it needs a cast
  // that would pass whatever it was given.
  function captureRequest(response: unknown = { tips: [] }) {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => response,
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("reads tips with a GET, not a POST body", async () => {
    const fetchMock = captureRequest();

    await (getPostTipsQueryOptions("good-karma", "some-post").queryFn as () => Promise<unknown>)();

    const [url, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(url).toContain("/private-api/post-tips/good-karma/some-post");
  });

  it("encodes author and permlink as path segments", async () => {
    const fetchMock = captureRequest();

    await (
      getPostTipsQueryOptions("a b", "post/with?chars").queryFn as () => Promise<unknown>
    )();

    const [url] = fetchMock.mock.calls[0];
    // An unencoded slash would change which upstream resource is addressed.
    expect(url).toContain("/private-api/post-tips/a%20b/post%2Fwith%3Fchars");
  });

  it("stays fresh for the endpoint's window, not merely non-zero", () => {
    // toBeGreaterThan(0) would pass for a 1ms window, which is the bug this
    // guards: an unset or near-zero staleTime refetches on every mount.
    expect(getPostTipsQueryOptions("good-karma", "some-post").staleTime).toBe(60 * 1000);
  });

  it("does not fire without both an author and a permlink", () => {
    expect(getPostTipsQueryOptions("", "some-post").enabled).toBe(false);
    expect(getPostTipsQueryOptions("good-karma", "").enabled).toBe(false);
    expect(getPostTipsQueryOptions("good-karma", "some-post", false).enabled).toBe(false);
    expect(getPostTipsQueryOptions("good-karma", "some-post").enabled).toBe(true);
  });

  it("surfaces a failed read instead of returning an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );

    await expect(
      (getPostTipsQueryOptions("good-karma", "some-post").queryFn as () => Promise<unknown>)()
    ).rejects.toThrow("503");
  });
});
