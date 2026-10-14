import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenUnlockRequest } from "./use-listen-unlock";
import { getListenStatusQueryOptions, LISTEN_STATUS_POLL_MS } from "../queries/get-listen-status-query-options";
import { QueryKeys } from "../../core";

const STATUS = { cost: 50, unlocked: true, status: "preparing", languages: [] };

function jsonResponse(status: number, body: unknown) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  };
}

function sent(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string);
}

// getBoundFetch() caches the bound fetch on first call, so one stable mock, reset per test.
const fetchMock = vi.fn();
const sleep = vi.fn(async () => {});

describe("listenUnlockRequest", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sleep.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the code, the post and a generated key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, STATUS));
    const res = await listenUnlockRequest("code", { author: "noelyss", permlink: "plaza" }, sleep);
    expect(res.status).toBe("preparing");
    const body = sent(fetchMock.mock.calls[0]);
    expect(body).toMatchObject({ code: "code", author: "noelyss", permlink: "plaza" });
    expect(body.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body).not.toHaveProperty("us");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/private-api\/listen$/);
  });

  it("retries a lost answer with the SAME key", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(jsonResponse(502, {}))
      .mockResolvedValueOnce(jsonResponse(200, STATUS));
    await listenUnlockRequest("code", { author: "a", permlink: "p", idempotency_key: "key-12345678" }, sleep);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const keys = fetchMock.mock.calls.map((c) => sent(c).idempotency_key);
    expect(new Set(keys)).toEqual(new Set(["key-12345678"]));
  });

  it("gives up after two retries", async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, {}));
    await expect(listenUnlockRequest("code", { author: "a", permlink: "p" }, sleep)).rejects.toMatchObject({
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a definite answer and exposes its body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(402, { error: "insufficient_points", required: 50, available: 10 })
    );
    await expect(listenUnlockRequest("code", { author: "a", permlink: "p" }, sleep)).rejects.toMatchObject({
      status: 402,
      data: { error: "insufficient_points", required: 50 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getListenStatusQueryOptions", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks anonymously without a token, and keys without the reader", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...STATUS, unlocked: false, status: "none" }));
    const opts = getListenStatusQueryOptions("noelyss", "plaza", "alice", undefined);
    expect(opts.queryKey).toEqual(QueryKeys.ai.listenStatus("noelyss", "plaza"));
    await (opts.queryFn as any)();
    expect(sent(fetchMock.mock.calls[0])).toEqual({ author: "noelyss", permlink: "plaza" });
  });

  it("sends the code and the edit hint for a reader", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, STATUS));
    const opts = getListenStatusQueryOptions("noelyss", "plaza", "alice", "tok", "2026-10-13T01:04:12");
    expect(opts.queryKey).toEqual(QueryKeys.ai.listenStatus("noelyss", "plaza", "alice"));
    await (opts.queryFn as any)();
    expect(sent(fetchMock.mock.calls[0])).toEqual({
      code: "tok",
      author: "noelyss",
      permlink: "plaza",
      updated: "2026-10-13T01:04:12",
    });
  });

  it("the post key is a prefix of every reader's key", () => {
    const post = QueryKeys.ai.listenStatus("noelyss", "plaza");
    const reader = QueryKeys.ai.listenStatus("noelyss", "plaza", "alice");
    expect(reader.slice(0, post.length)).toEqual(post);
  });

  it("polls only while audio is being prepared or analysed", () => {
    const opts = getListenStatusQueryOptions("noelyss", "plaza");
    const interval = opts.refetchInterval as (q: unknown) => number | false;
    const q = (status?: string) => ({ state: { data: status ? { status } : undefined } });
    expect(interval(q("preparing"))).toBe(LISTEN_STATUS_POLL_MS);
    expect(interval(q("analyzing"))).toBe(LISTEN_STATUS_POLL_MS);
    expect(interval(q("ready"))).toBe(false);
    expect(interval(q())).toBe(false);
  });
});
