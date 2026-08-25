import { describe, expect, it, vi, beforeEach } from "vitest";
import { getAiImagesQueryOptions } from "./get-ai-images-query-options";
import { CONFIG, QueryKeys } from "../../core";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("../../core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core")>();
  return { ...actual, getBoundFetch: vi.fn(() => fetchMock) };
});

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const HISTORY = [
  {
    id: 1,
    prompt: "a fox",
    url: "https://images.test/fox.webp",
    aspect_ratio: "1:1",
    cost: 150,
    created: "2026-08-25T15:28:08+00:00",
  },
];

describe("getAiImagesQueryOptions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("uses the shared key builder and refetches on every mount", () => {
    const options = getAiImagesQueryOptions("alice", "token");
    expect(options.queryKey).toEqual(QueryKeys.ai.images("alice"));
    // Recovery surface: opening the history must always show what the server actually
    // delivered, even when the client never saw the success that would invalidate it.
    expect(options.refetchOnMount).toBe("always");
  });

  it("is disabled until both username and access token exist", () => {
    expect(getAiImagesQueryOptions(undefined, "token").enabled).toBe(false);
    expect(getAiImagesQueryOptions("alice", "").enabled).toBe(false);
    expect(getAiImagesQueryOptions("alice", "token").enabled).toBe(true);
  });

  it("posts the code to the private API and returns the parsed history", async () => {
    fetchMock.mockResolvedValueOnce(response(HISTORY));

    const options = getAiImagesQueryOptions("alice", "token");
    const result = await (options.queryFn as () => Promise<unknown>)();

    expect(result).toEqual(HISTORY);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(CONFIG.privateApiHost + "/private-api/ai-images");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ code: "token" });
  });

  it("throws on a non-OK response", async () => {
    fetchMock.mockResolvedValueOnce(response({}, false, 401));

    const options = getAiImagesQueryOptions("alice", "token");
    await expect((options.queryFn as () => Promise<unknown>)()).rejects.toThrow("401");
  });
});
