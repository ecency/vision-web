import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The subscribe relay: the browser never talks to the newsletter service. This handler
 * verifies identity when a token is present, keeps creator digests open to every creator on
 * the server, adds what only the server knows (IP, user agent), and relays.
 */
const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  isPro: vi.fn(),
  turnstile: vi.fn(),
  fetch: vi.fn()
}));

vi.mock("@/server/hivesigner-verify", () => ({ verifyHsAccessToken: mocks.verify }));
vi.mock("@/server/pro-members", () => ({ isProRosterMember: mocks.isPro }));
// Mocked as a MODULE rather than left to hit the stubbed global fetch. An inline
// siteverify call would occupy mocks.fetch.mock.calls[0], quietly turning every
// assertion about the newsletter request body below into a claim about the Cloudflare
// request instead, and some of them would still pass.
vi.mock("@/server/turnstile-verify", () => ({ verifyTurnstile: mocks.turnstile }));

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
  cadence: "weekly",
  source: "community-page",
  // Anonymous by default in this file, and an anonymous caller carries a token.
  captchaToken: "turnstile-ok"
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
    vi.stubEnv("TURNSTILE_SECRET", "test-secret");
    mocks.fetch.mockReset();
    mocks.verify.mockReset();
    mocks.isPro.mockReset();
    mocks.turnstile.mockReset();
    mocks.turnstile.mockResolvedValue({ ok: true });
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

  it("offers creator digests for EVERY creator: no Pro roster is consulted (2026-08-19)", async () => {
    mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation" }));
    expect((await post({ ...VALID, type: "creator", target: "Someone" })).status).toBe(200);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).target).toBe("someone");
    expect(mocks.isPro).not.toHaveBeenCalled();
  });

  it("accepts the site digest from the landing page and relays it without a Pro check", async () => {
    mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation" }));
    const r = await post({ email: "alice@example.com", type: "site", target: "ecency", cadence: "weekly", source: "landing-page" });
    expect(r.status).toBe(200);
    expect(mocks.isPro).not.toHaveBeenCalled();
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ type: "site", target: "ecency", source: "landing-page" });
  });

  it("accepts a signed-in mobile-app subscribe and relays the source intact", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    mocks.fetch.mockResolvedValue(upstream(200, { status: "active" }));
    const r = await post({ ...VALID, type: "creator", target: "someone", source: "mobile-app", code: "hs-token", captchaToken: undefined });
    expect(r.status).toBe(200);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      type: "creator",
      target: "someone",
      source: "mobile-app",
      account: "alice"
    });
  });

  // A tag digest is anonymous by nature (the signed-in path is a follow, not an
  // email) and comes from the tag page or a post's tag chip. The service decides
  // whether the tag is busy enough; its refusal must reach the dialog as the 422
  // it is, since the dialog keys its copy on the status.
  it("accepts a tag digest from the tag page and the chip, and relays the too-quiet refusal as-is", async () => {
    mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation" }));
    for (const source of ["tag-page", "tag-chip"]) {
      const r = await post({ ...VALID, type: "tag", target: "Photography", source });
      expect(r.status).toBe(200);
      expect(JSON.parse(mocks.fetch.mock.calls.at(-1)![1].body)).toMatchObject({ type: "tag", target: "photography", source });
    }

    const refusal = { error: "tag too quiet", code: "tag_too_quiet", authors: 2, required: 5 };
    mocks.fetch.mockResolvedValue(upstream(422, refusal));
    const r = await post({ ...VALID, type: "tag", target: "quiet", source: "tag-page" });
    expect(r.status).toBe(422);
    expect(r.json).toEqual(refusal);
  });

  it("the own digest needs a verified account and its target must be that account", async () => {
    // Anonymous: no account to be the target of.
    expect((await post({ ...VALID, type: "own", target: "alice" })).status).toBe(401);
    // Signed in as alice, asking for bob's: refused before it leaves.
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    expect((await post({ ...VALID, type: "own", target: "bob", code: "tok" })).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
    // Signed in as alice, asking for her own: relayed with the account attributed.
    mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation" }));
    expect((await post({ ...VALID, type: "own", target: "Alice", code: "tok", source: "publish-prompt" })).status).toBe(200);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ type: "own", target: "alice", account: "alice", source: "publish-prompt" });
  });

  it("400s malformed input before it reaches the service", async () => {
    for (const bad of [
      { ...VALID, type: "nope" },
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

  describe("the anonymous bot check", () => {
    it("verifies the token with the caller's IP, scoped to the newsletter action", async () => {
      mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation" }));
      await post(VALID, { "cf-connecting-ip": "203.0.113.9" });
      expect(mocks.turnstile).toHaveBeenCalledWith("turnstile-ok", "203.0.113.9", "newsletter-subscribe");
    });

    it("403s a rejected token and never reaches the service", async () => {
      mocks.turnstile.mockResolvedValue({ ok: false, reason: "invalid" });
      const r = await post(VALID);
      expect(r.status).toBe(403);
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("403s when no token is presented at all", async () => {
      mocks.turnstile.mockResolvedValue({ ok: false, reason: "invalid" });
      const { captchaToken, ...noToken } = VALID;
      const r = await post(noToken);
      expect(r.status).toBe(403);
      expect(mocks.turnstile).toHaveBeenCalledWith("", undefined, "newsletter-subscribe");
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("503s rather than 403s when Cloudflare is the thing that is broken", async () => {
      // A 403 would tell readers they look like bots because our secret is wrong.
      mocks.turnstile.mockResolvedValue({ ok: false, reason: "unavailable" });
      const r = await post(VALID);
      expect(r.status).toBe(503);
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("refuses when the secret is unset rather than relaying with the check off", async () => {
      // The route already 503s from newsletterConfigured() unless the newsletter itself is
      // configured, so "newsletter on, bot check off" is the only state this covers, and it
      // is a misconfiguration rather than a rollout window worth tolerating.
      mocks.turnstile.mockResolvedValue({ ok: false, reason: "unconfigured" });
      const r = await post(VALID);
      expect(r.status).toBe(503);
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("never challenges a signed-in caller: the account is the proof", async () => {
      mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
      mocks.fetch.mockResolvedValue(upstream(200, { status: "active" }));
      const { captchaToken, ...noToken } = VALID;
      expect((await post({ ...noToken, code: "tok" })).status).toBe(200);
      expect(mocks.turnstile).not.toHaveBeenCalled();
    });

    it("does not exempt the managed-blog embed, because `source` is caller-supplied", async () => {
      // If a source could turn the check off, one JSON field would turn it off for
      // everyone. The embed carries a real token instead.
      mocks.turnstile.mockResolvedValue({ ok: false, reason: "invalid" });
      const r = await post({ ...VALID, type: "creator", target: "bob", source: "self-hosted-blog" });
      expect(r.status).toBe(403);
      expect(mocks.turnstile).toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("401s an anonymous own-digest before spending a siteverify round trip", async () => {
      // That request can never succeed, so it should not cost a call to Cloudflare.
      const r = await post({ ...VALID, type: "own", target: "alice" });
      expect(r.status).toBe(401);
      expect(mocks.turnstile).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("never forwards the token, or a caller-supplied label, to the service", async () => {
      mocks.fetch.mockResolvedValue(upstream(200, { status: "pending_confirmation" }));
      await post({ ...VALID, targetLabel: "URGENT: verify your wallet at example.com" });
      const sent = JSON.parse(mocks.fetch.mock.calls[0][1].body);
      expect(sent.captchaToken).toBeUndefined();
      // The service derives the label from the target now; a caller no longer writes
      // part of a sentence into mail our domain sends to an address they chose.
      expect(sent.targetLabel).toBeUndefined();
    });
  });
});
