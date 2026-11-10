import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recoveryComplete,
  recoveryProve,
  recoveryStart,
  recoveryStatus,
  recoveryVerifyCode,
} from "./requests";

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("recovery private-api requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const body = (i = 0) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string);

  it("start posts username and captcha token", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { request_id: "r1", nonce: "n1" }));
    const res = await recoveryStart("alice", "tok");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/private-api/recovery/start");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(body()).toEqual({ username: "alice", captcha_token: "tok" });
    expect(res).toEqual({ status: 200, data: { request_id: "r1", nonce: "n1" } });
  });

  it("start returns error bodies instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce(json(429, { error: "rate_limited" }));
    await expect(recoveryStart("alice", "tok")).resolves.toEqual({
      status: 429,
      data: { error: "rate_limited" },
    });
  });

  it("prove sends snake_case fields and only public data", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { emails: ["a****e@x.com"] }));
    const res = await recoveryProve({
      requestId: "r1",
      username: "alice",
      newOwnerPub: "STM_NEW",
      provenKeyPub: "STM_OLD",
      signature: "ab".repeat(65),
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/private-api/recovery/prove");
    expect(body()).toEqual({
      request_id: "r1",
      username: "alice",
      new_owner_pub: "STM_NEW",
      proven_key_pub: "STM_OLD",
      signature: "ab".repeat(65),
    });
    expect(res.data.emails).toEqual(["a****e@x.com"]);
  });

  it("verify-code returns attempts_left on a wrong code", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: "invalid_code", attempts_left: 3 }));
    const res = await recoveryVerifyCode("r1", "123456");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/private-api/recovery/verify-code");
    expect(body()).toEqual({ request_id: "r1", code: "123456" });
    expect(res).toEqual({ status: 400, data: { error: "invalid_code", attempts_left: 3 } });
  });

  it("status is a GET with the request id in the query", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: "requested", tx_id: "t", error: null }));
    const res = await recoveryStatus("r 1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/private-api/recovery/status?request_id=r%201");
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    expect(res.data.status).toBe("requested");
  });

  it("complete posts the request id", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: "completed" }));
    const res = await recoveryComplete("r1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/private-api/recovery/complete");
    expect(body()).toEqual({ request_id: "r1" });
    expect(res.status).toBe(200);
  });

  it("tolerates an empty or non-JSON error body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("bad");
      },
      text: async () => "<html>",
    });
    await expect(recoveryStatus("r1")).resolves.toEqual({ status: 502, data: {} });
  });
});
