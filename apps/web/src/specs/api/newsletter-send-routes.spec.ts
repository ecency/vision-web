import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), fetch: vi.fn(), getCommunity: vi.fn(), pro: vi.fn() }));
vi.mock("@/server/hivesigner-verify", () => ({ verifyHsAccessToken: mocks.verify }));
vi.mock("@ecency/sdk", () => ({ getCommunity: mocks.getCommunity }));
vi.mock("@/server/pro-members", () => ({ isProRosterMember: mocks.pro }));

function req(body: unknown, headers: Record<string, string> = {}, query = "") {
  const url = new URL(`http://localhost/api/newsletter/x?${query}`);
  return { json: async () => body, headers: new Headers(headers), nextUrl: url } as never;
}
function upstream(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body } as never;
}
const SEND = { type: "creator", target: "alice", author: "alice", permlink: "hello" };

/**
 * vision-web#1532: who may send is decided here (Pro creator for their own
 * list; community owner or admin); the service's answers are relayed as they
 * are, with the requester asserted.
 */
describe("author send routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("NEWSLETTER_API_URL", "http://news.internal:3300");
    vi.stubEnv("NEWSLETTER_SERVICE_TOKEN", "service-token-0123456789abcdefghijklmnop");
    mocks.fetch.mockReset();
    mocks.verify.mockReset();
    mocks.getCommunity.mockReset();
    mocks.pro.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("a Pro creator sends their own post; the requester is asserted and the service's answer relayed", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "Alice" });
    mocks.pro.mockResolvedValue(true);
    mocks.fetch.mockResolvedValue(upstream(201, { issues: [{ issueId: "i1", cadence: "weekly", period: "2026-08-17", send: { recipients: 3, sent: 3 } }] }));
    const { POST } = await import("@/app/api/newsletter/send/route");
    const res = await POST(req(SEND, { "x-hs-token": "tok" }));
    expect(res.status).toBe(201);
    expect(mocks.fetch.mock.calls[0][0]).toBe("http://news.internal:3300/api/issues");
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ ...SEND, requestedBy: "alice" });
    // 409 / 422 / 403 from the service pass through with their bodies.
    mocks.fetch.mockResolvedValue(upstream(409, { error: "taken", code: "already_sent", taken: [{ cadence: "weekly" }] }));
    const taken = await POST(req(SEND, { "x-hs-token": "tok" }));
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ code: "already_sent" });
  });

  it("a creator who is not Pro, or someone else's list, is refused before the service is asked; an unknown roster is a 503", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    const { POST } = await import("@/app/api/newsletter/send/route");
    mocks.pro.mockResolvedValue(false);
    expect((await POST(req(SEND, { "x-hs-token": "tok" }))).status).toBe(403);
    mocks.pro.mockResolvedValue(true);
    expect((await POST(req({ ...SEND, target: "bob" }, { "x-hs-token": "tok" }))).status).toBe(403);
    mocks.pro.mockResolvedValue(null);
    expect((await POST(req(SEND, { "x-hs-token": "tok" }))).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("a community's owner or admin may send; a mod may look but not send; a member neither", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    mocks.getCommunity.mockResolvedValue({ name: "hive-125125", team: [["owner1", "owner", ""], ["alice", "mod", ""], ["dora", "admin", ""], ["carol", "member", ""]] });
    mocks.fetch.mockResolvedValue(upstream(201, { issues: [] }));
    const body = { type: "community", target: "hive-125125", author: "bob", permlink: "post" };
    const { POST } = await import("@/app/api/newsletter/send/route");
    const { POST: PREVIEW } = await import("@/app/api/newsletter/send/preview/route");
    const { GET: ISSUES } = await import("@/app/api/newsletter/issues/route");
    // alice is a mod: may view issues, may not send or preview a send.
    expect((await POST(req(body, { "x-hs-token": "tok" }))).status).toBe(403);
    expect((await PREVIEW(req(body, { "x-hs-token": "tok" }))).status).toBe(403);
    mocks.fetch.mockResolvedValue(upstream(200, { issues: [] }));
    expect((await ISSUES(req(undefined, { "x-hs-token": "tok" }, "type=community&target=hive-125125"))).status).toBe(200);
    expect(mocks.fetch.mock.calls[0][0]).toBe("http://news.internal:3300/api/issues?type=community&target=hive-125125");
    // dora is an admin: sends.
    mocks.verify.mockResolvedValue({ ok: true, username: "dora" });
    mocks.fetch.mockResolvedValue(upstream(200, { subject: "x", subscribers: { weekly: 1, monthly: 0 }, alreadySent: [] }));
    expect((await PREVIEW(req(body, { "x-hs-token": "tok" }))).status).toBe(200);
    expect(mocks.fetch.mock.calls[1][0]).toBe("http://news.internal:3300/api/issues/preview");
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual(body);
    // carol is a member: nothing.
    mocks.verify.mockResolvedValue({ ok: true, username: "carol" });
    expect((await ISSUES(req(undefined, { "x-hs-token": "tok" }, "type=community&target=hive-125125"))).status).toBe(403);
    expect((await POST(req(body, { "x-hs-token": "tok" }))).status).toBe(403);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("validates the body, requires identity, and answers 503 unconfigured", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    mocks.pro.mockResolvedValue(true);
    const { POST } = await import("@/app/api/newsletter/send/route");
    expect((await POST(req({ ...SEND, permlink: "Bad Permlink!" }, { "x-hs-token": "tok" }))).status).toBe(400);
    expect((await POST(req({ ...SEND, type: "site" }, { "x-hs-token": "tok" }))).status).toBe(400);
    expect((await POST(req(null, { "x-hs-token": "tok" }))).status).toBe(400);
    mocks.verify.mockResolvedValue({ ok: false, reason: "missing" });
    expect((await POST(req(SEND))).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv("NEWSLETTER_SERVICE_TOKEN", "");
    vi.resetModules();
    const { POST: POST2 } = await import("@/app/api/newsletter/send/route");
    expect((await POST2(req(SEND, { "x-hs-token": "tok" }))).status).toBe(503);
  });
});
