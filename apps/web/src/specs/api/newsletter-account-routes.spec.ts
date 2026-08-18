import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), fetch: vi.fn() }));
vi.mock("@/server/hivesigner-verify", () => ({ verifyHsAccessToken: mocks.verify }));

function req(body: unknown, headers: Record<string, string> = {}) {
  return { json: async () => body, headers: new Headers(headers) } as never;
}
function upstream(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body } as never;
}

describe("logged-in newsletter routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("NEWSLETTER_API_URL", "http://news.internal:3300");
    vi.stubEnv("NEWSLETTER_SERVICE_TOKEN", "service-token-0123456789abcdefghijklmnop");
    mocks.fetch.mockReset();
    mocks.verify.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("GET /subscriptions lists the verified account's subscriptions from the X-HS-Token header", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    mocks.fetch.mockResolvedValue(upstream(200, { subscriptions: [{ id: "1" }] }));
    const { GET } = await import("@/app/api/newsletter/subscriptions/route");
    const res = await GET(req(undefined, { "x-hs-token": "tok" }));
    expect(res.status).toBe(200);
    expect(mocks.fetch.mock.calls[0][0]).toBe("http://news.internal:3300/api/subscriptions?account=alice");
    // and without a token, 401 and no upstream call
    mocks.verify.mockResolvedValue({ ok: false, reason: "missing" });
    expect((await GET(req(undefined))).status).toBe(401);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("DELETE /subscriptions/:id scopes the leave to the verified account and refuses a non-uuid", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    mocks.fetch.mockResolvedValue(upstream(200, { left: true }));
    const { DELETE } = await import("@/app/api/newsletter/subscriptions/[id]/route");
    const id = "6f1c2c1a-2b3c-4d5e-8f90-123456789abc";
    const res = await DELETE(req(undefined, { "x-hs-token": "tok" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect(mocks.fetch.mock.calls[0][0]).toBe(
      `http://news.internal:3300/api/subscriptions/${id}?account=alice`
    );
    expect(mocks.fetch.mock.calls[0][1].method).toBe("DELETE");
    const bad = await DELETE(req(undefined, { "x-hs-token": "tok" }), { params: Promise.resolve({ id: "../x" }) });
    expect(bad.status).toBe(404);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("POST /unsubscribe-all only suppresses an address the account actually holds", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    const { POST } = await import("@/app/api/newsletter/unsubscribe-all/route");

    // The service is trusted with the address, so ownership is established HERE: a
    // logged-in user must not be able to suppress an arbitrary address by typing it.
    mocks.fetch.mockResolvedValueOnce(upstream(200, { subscriptions: [{ email: "alice@example.com" }] }));
    const foreign = await POST(req({ email: "victim@example.com", code: "tok" }));
    expect(foreign.status).toBe(403);
    expect(mocks.fetch).toHaveBeenCalledTimes(1); // list only, no unsubscribe call

    mocks.fetch.mockResolvedValueOnce(upstream(200, { subscriptions: [{ email: "Alice@Example.com" }] }));
    mocks.fetch.mockResolvedValueOnce(upstream(200, { suppressed: true }));
    const own = await POST(req({ email: "alice@example.com", code: "tok" }));
    expect(own.status).toBe(200);
    expect(mocks.fetch.mock.calls[2][0]).toBe("http://news.internal:3300/api/unsubscribe-all");
    expect(JSON.parse(mocks.fetch.mock.calls[2][1].body)).toEqual({ email: "alice@example.com" });
  });
});
