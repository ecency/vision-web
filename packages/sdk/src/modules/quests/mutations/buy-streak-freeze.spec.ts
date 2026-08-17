import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyStreakFreezeRequest } from "./buy-streak-freeze";

/** Build a minimal Response-like mock accepted by buyStreakFreezeRequest. */
function makeResponse(
  opts: {
    ok: boolean;
    status?: number;
    contentType?: string;
    body?: string;
  }
) {
  const { ok, status = ok ? 200 : 500, contentType = "application/json", body = "{}" } = opts;
  return {
    ok,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => body,
  };
}

describe("buyStreakFreezeRequest", () => {
  // getBoundFetch() caches the bound fetch on first call, so reuse one stable mock
  // and reset it per test (a fresh mock each test wouldn't be picked up).
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /private-api/streak-freeze/buy with the code and a fresh idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ ok: true, body: JSON.stringify({ owned: 1, points: 700 }) })
    );

    const result = await buyStreakFreezeRequest("hs-token");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/private-api/streak-freeze/buy");
    expect((init as RequestInit).method).toBe("POST");
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.code).toBe("hs-token");
    expect(typeof payload.idempotency_key).toBe("string");
    expect(payload.idempotency_key.length).toBeGreaterThan(0);
    expect(result).toEqual({ owned: 1, points: 700 });
  });

  it("generates a distinct idempotency key per call", async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ ok: true, body: JSON.stringify({ owned: 1, points: 700 }) })
    );
    await buyStreakFreezeRequest("t");
    await buyStreakFreezeRequest("t");
    const k1 = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string).idempotency_key;
    const k2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).idempotency_key;
    expect(k1).not.toBe(k2);
  });

  it("rethrows a 402 with status + server data so the caller can route to a top-up", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        ok: false,
        status: 402,
        body: JSON.stringify({ message: "Insufficient points", required: 300, available: 100 }),
      })
    );

    await expect(buyStreakFreezeRequest("t")).rejects.toMatchObject({
      status: 402,
      data: { required: 300, available: 100 },
    });
  });

  it("rethrows a 409 (max owned) with status attached", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        ok: false,
        status: 409,
        body: JSON.stringify({ message: "Maximum freezes already owned", owned: 2 }),
      })
    );

    await expect(buyStreakFreezeRequest("t")).rejects.toMatchObject({ status: 409 });
  });

  it("does not throw on a non-JSON error body (keeps the status)", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ ok: false, status: 500, contentType: "text/plain", body: "Internal Server Error" })
    );

    await expect(buyStreakFreezeRequest("t")).rejects.toMatchObject({ status: 500 });
  });

  it("throws a descriptive error when a 2xx response has a non-JSON content-type", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ ok: true, status: 200, contentType: "text/html", body: "<html>OK</html>" })
    );

    await expect(buyStreakFreezeRequest("t")).rejects.toThrow(/expected JSON/);
  });

  it("throws a descriptive error when a 2xx response has malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ ok: true, status: 200, body: "not-json" })
    );

    await expect(buyStreakFreezeRequest("t")).rejects.toThrow(/malformed JSON/);
  });
});
