import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The subscribe relay: the browser never talks to the newsletter service. This handler
 * verifies identity when a token is present, enforces the Pro gate for creator digests on
 * the server, adds what only the server knows (IP, user agent), and relays.
 */
const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  isPro: vi.fn(),
  fetch: vi.fn()
}));

vi.mock("@/server/hivesigner-verify", () => ({ verifyHsAccessToken: mocks.verify }));
vi.mock("@/server/pro-members", () => ({ isProRosterMember: mocks.isPro }));

function req(body: unknown, headers: Record<string, string> = {}) {
  const h = new Headers(headers);
  return { json: async () => body, headers: h } as never;
}

async function post(body: unknown, headers?: Record<string, string>) {
  const { POST } = await import("@/app/api/newsletter/subscribe/route");
  const res = await POST(req(body, headers));
  return { status: res.status, json: await res.json() };
}

const VALID = {
  email: "alice@example.com",
  type: "community",
  target: "hive-140217",
  targetLabel: "Hive Gaming",
  cadence: "weekly",
  source: "community-page"
};

function upstream(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body } as never;
}

describe("POST /api/newsletter/subscribe", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("NEWSLETTER_API_URL", "http://news.internal:3300");
    vi.stubEnv("NEWSLETTER_SERVICE_TOKEN", "service-token-0123456789abcdefghijklmnop");
    mocks.fetch.mockReset();
    mocks.verify.mockReset();
    mocks.isPro.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("503s when the service is not configured, without calling anything", async () => {
    vi.stubEnv("NEWSLETTER_SERVICE_TOKEN", "");
    const r = await post(VALID);
    expect(r.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("relays an anonymous subscribe with no account, adding the caller's IP and user agent", async () => {
    mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation", confirmationSent: true }));
    const r = await post(VALID, { "cf-connecting-ip": "203.0.113.9", "user-agent": "TestBrowser/1.0" });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe("pending_confirmation");
    expect(mocks.verify).not.toHaveBeenCalled();

    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe("http://news.internal:3300/api/subscriptions");
    expect(init.headers.Authorization).toBe("Bearer service-token-0123456789abcdefghijklmnop");
    const sent = JSON.parse(init.body);
    expect(sent).toMatchObject({
      email: "alice@example.com",
      type: "community",
      target: "hive-140217",
      cadence: "weekly",
      source: "community-page",
      sourceIp: "203.0.113.9",
      userAgent: "TestBrowser/1.0"
    });
    expect(sent.account).toBeUndefined();
  });

  it("drops a non-IP forwarding header rather than sending it", async () => {
    mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation" }));
    await post(VALID, { "x-forwarded-for": "not-an-ip, 203.0.113.9" });
    const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sent.sourceIp).toBeUndefined();
  });

  it("attributes a logged-in subscribe to the account from the VERIFIED token, never the body", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "Alice" });
    mocks.fetch.mockResolvedValue(upstream(200, { status: "active" }));
    const r = await post({ ...VALID, code: "hs-token", account: "mallory" });
    expect(r.status).toBe(200);
    const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(sent.account).toBe("alice");
  });

  it("rejects a bad token with 401 and an unavailable verifier with 503, calling nothing", async () => {
    mocks.verify.mockResolvedValueOnce({ ok: false, reason: "invalid" });
    expect((await post({ ...VALID, code: "bad" })).status).toBe(401);
    mocks.verify.mockResolvedValueOnce({ ok: false, reason: "unavailable" });
    expect((await post({ ...VALID, code: "bad" })).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("offers creator digests only for Ecency Pro creators, checked on the server", async () => {
    mocks.isPro.mockResolvedValueOnce(false);
    const denied = await post({ ...VALID, type: "creator", target: "someone" });
    expect(denied.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();

    mocks.isPro.mockResolvedValueOnce(null);
    expect((await post({ ...VALID, type: "creator", target: "someone" })).status).toBe(503);

    mocks.isPro.mockResolvedValueOnce(true);
    mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation" }));
    expect((await post({ ...VALID, type: "creator", target: "Good-Karma" })).status).toBe(200);
    expect(mocks.isPro).toHaveBeenLastCalledWith("good-karma");
  });

  it("400s malformed input before it reaches the service", async () => {
    for (const bad of [
      { ...VALID, type: "own" },
      { ...VALID, cadence: "daily" },
      { ...VALID, email: "" },
      { ...VALID, source: "elsewhere" },
      "not json"
    ]) {
      const r = await post(bad);
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("relays the service's status and body unchanged", async () => {
    mocks.fetch.mockResolvedValue(upstream(400, { error: "label must not contain control characters" }));
    const r = await post(VALID);
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/control characters/);
  });
});
