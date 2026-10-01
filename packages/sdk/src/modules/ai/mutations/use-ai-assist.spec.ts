import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { aiAssistRequest, invalidateAiAssistCaches } from "./use-ai-assist";
import type { AiAssistResponse } from "../types";
import { ConfigManager, QueryKeys } from "../../core";

const OK = {
  action: "summarize",
  output: "short",
  cost: 0,
  is_free: true,
  request_id: "1",
};

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

function jsonResponse(status: number, body: unknown): FakeResponse {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text,
  };
}

function sentKey(call: unknown[]): string {
  return JSON.parse((call[1] as RequestInit).body as string).idempotency_key;
}

// getBoundFetch() caches the bound fetch on first call, so every describe shares one
// stable mock, reset per test (a fresh mock wouldn't be picked up).
const fetchMock = vi.fn();

describe("aiAssistRequest", () => {
  // A fake clock that only moves when the retry loop sleeps, so the deadline is exact.
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const deps = { sleep, now: () => clock };
  const run = (): Promise<AiAssistResponse> =>
    aiAssistRequest("alice", "code", { action: "summarize", text: "t" }, deps);

  beforeEach(() => {
    fetchMock.mockReset();
    sleep.mockClear();
    clock = 0;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs once with an idempotency key and returns the result", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK));

    const result = await run();

    expect(result).toEqual(OK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/private-api/ai-assist");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ code: "code", us: "alice", action: "summarize", text: "t" });
    expect(body.idempotency_key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a gateway error with the SAME key so a charged assist is replayed", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 504, text: async () => "Gateway Timeout" })
      .mockResolvedValueOnce(jsonResponse(200, { ...OK, idempotent_replay: true }));

    const result = await run();

    expect(result.idempotent_replay).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentKey(fetchMock.mock.calls[1])).toBe(sentKey(fetchMock.mock.calls[0]));
  });

  it("retries a transport failure with the same key", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(200, OK));

    await run();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentKey(fetchMock.mock.calls[1])).toBe(sentKey(fetchMock.mock.calls[0]));
  });

  it("waits retry_after on 409 in_progress, capped", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(409, { error: "in_progress", retry_after: 5 }))
      .mockResolvedValueOnce(jsonResponse(409, { error: "in_progress", retry_after: 600 }))
      .mockResolvedValueOnce(jsonResponse(200, OK));

    await run();

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5000, 10000]);
    expect(new Set(fetchMock.mock.calls.map(sentKey)).size).toBe(1);
  });

  it("keeps polling 409 in_progress past the gateway cap until the result lands", async () => {
    for (let i = 0; i < 5; i++) {
      fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: "in_progress", retry_after: 5 }));
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...OK, idempotent_replay: true }));

    const result = await run();

    expect(result.idempotent_replay).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(new Set(fetchMock.mock.calls.map(sentKey)).size).toBe(1);
  });

  it("stops polling at the overall deadline and throws the 409 with status and data", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: "in_progress", retry_after: 10 }));

    const err = await run().catch((e) => e);

    // 10s apart inside a 150s budget: polls at 0, 10 ... 140, and the next wait would cross it.
    expect(fetchMock).toHaveBeenCalledTimes(15);
    expect(clock).toBeLessThan(150_000);
    expect(err.status).toBe(409);
    expect(err.data).toEqual({ error: "in_progress", retry_after: 10 });
  });

  it("retries a gateway error at most twice, since it can also be a refunded failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "unavailable" });

    const err = await run().catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(err.status).toBe(502);
  });

  it("retries a transport failure at most twice", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(run()).rejects.toThrow("Failed to fetch");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries with the same key when the body is lost after the headers", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new TypeError("network error");
        },
        text: async () => "",
      })
      .mockResolvedValueOnce(jsonResponse(200, { ...OK, idempotent_replay: true }));

    const result = await run();

    expect(result.idempotent_replay).toBe(true);
    expect(sentKey(fetchMock.mock.calls[1])).toBe(sentKey(fetchMock.mock.calls[0]));
  });

  it("keeps a definite status when its error body cannot be read", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({}),
      text: async () => {
        throw new TypeError("network error");
      },
    });

    const err = await run().catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err.status).toBe(402);
    expect(err.data).toEqual({});
  });

  it("does not send again when a late timer wakes past the deadline", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: "in_progress", retry_after: 5 }));
    // The tab slept through the whole budget during the first wait.
    sleep.mockImplementationOnce(async () => {
      clock += 200_000;
    });

    const err = await run().catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err.status).toBe(409);
  });

  it("sends the caller's key when one is given", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OK));

    await aiAssistRequest(
      "alice",
      "code",
      { action: "summarize", text: "t", idempotency_key: "kept-from-an-earlier-dialog" },
      deps
    );

    expect(sentKey(fetchMock.mock.calls[0])).toBe("kept-from-an-earlier-dialog");
  });

  it.each([
    [402, { error: "insufficient_points", required: 50, available: 1 }],
    [409, { error: "something_else" }],
    [422, { error: "content_policy" }],
    [429, { error: "rate_limited", retry_after: 60 }],
    [500, { error: "server_error" }],
    [503, { error: "ai_unavailable", retry_after: 3600 }],
  ])("does not retry a definite %i answer", async (status, body) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(status, body));

    const err = await run().catch(
      (e) => e
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(err.status).toBe(status);
    expect(err.data).toEqual(body);
  });

  it("uses a new key for each separate request", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, OK));

    await run();
    await run();

    expect(sentKey(fetchMock.mock.calls[0])).not.toBe(sentKey(fetchMock.mock.calls[1]));
  });
});

describe("aiAssistRequest attempt timeout", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts a stalled request at the overall deadline instead of hanging", async () => {
    // Never answers; only the abort signal ends it.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          );
        })
    );

    const outcome = aiAssistRequest("alice", "code", { action: "summarize", text: "t" }).catch(
      (e) => e
    );
    await vi.advanceTimersByTimeAsync(150_000);
    const err = await outcome;

    expect(err.name).toBe("AbortError");
    // The stall used the whole budget, so nothing is left to retry in.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("invalidateAiAssistCaches", () => {
  it("invalidates the points balance and the assist free counts for the user", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    ConfigManager.setQueryClient(client);

    invalidateAiAssistCaches("alice");

    expect(spy).toHaveBeenCalledWith({ queryKey: QueryKeys.points._prefix("alice") });
    expect(spy).toHaveBeenCalledWith({ queryKey: QueryKeys.ai.assistPrices("alice") });
  });
});
