import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), fetch: vi.fn(), getCommunity: vi.fn() }));
vi.mock("@/server/hivesigner-verify", () => ({ verifyHsAccessToken: mocks.verify }));
vi.mock("@ecency/sdk", () => ({ getCommunity: mocks.getCommunity }));

function req(query: string, headers: Record<string, string> = {}) {
  const url = new URL(`http://localhost/api/newsletter/sender?${query}`);
  return { nextUrl: url, headers: new Headers(headers), json: async () => ({}) } as never;
}
function upstream(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body } as never;
}

/**
 * vision-web#1513: a sender's standing is shown to the SENDER. The route is the
 * gate: the account itself for a creator digest, the community's team for a
 * community digest, nobody else.
 */
describe("GET /api/newsletter/sender", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("NEWSLETTER_API_URL", "http://news.internal:3300");
    vi.stubEnv("NEWSLETTER_SERVICE_TOKEN", "service-token-0123456789abcdefghijklmnop");
    mocks.fetch.mockReset();
    mocks.verify.mockReset();
    mocks.getCommunity.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("a creator sees their own standing and nobody else's", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "Alice" });
    mocks.fetch.mockResolvedValue(upstream(200, { status: "suspended", reason: "complaint_rate" }));
    const { GET } = await import("@/app/api/newsletter/sender/route");
    const mine = await GET(req("type=creator&target=alice", { "x-hs-token": "tok" }));
    expect(mine.status).toBe(200);
    expect(mocks.fetch.mock.calls[0][0]).toBe("http://news.internal:3300/api/senders/creator/alice");
    const other = await GET(req("type=creator&target=bob", { "x-hs-token": "tok" }));
    expect(other.status).toBe(403);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("a community's owner, admin or mod sees the community's standing; a member or stranger does not", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    mocks.fetch.mockResolvedValue(upstream(200, { status: "active" }));
    mocks.getCommunity.mockResolvedValue({ name: "hive-125125", team: [["owner1", "owner", ""], ["alice", "mod", ""], ["carol", "member", ""]] });
    const { GET } = await import("@/app/api/newsletter/sender/route");
    expect((await GET(req("type=community&target=hive-125125", { "x-hs-token": "tok" }))).status).toBe(200);
    expect(mocks.getCommunity).toHaveBeenCalledWith("hive-125125", "alice");
    expect(mocks.fetch.mock.calls[0][0]).toBe("http://news.internal:3300/api/senders/community/hive-125125");
    mocks.verify.mockResolvedValue({ ok: true, username: "carol" });
    expect((await GET(req("type=community&target=hive-125125", { "x-hs-token": "tok" }))).status).toBe(403);
    mocks.verify.mockResolvedValue({ ok: true, username: "dave" });
    expect((await GET(req("type=community&target=hive-125125", { "x-hs-token": "tok" }))).status).toBe(403);
    mocks.getCommunity.mockResolvedValue(null);
    expect((await GET(req("type=community&target=hive-000000", { "x-hs-token": "tok" }))).status).toBe(403);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses bad input, missing identity, and an unconfigured service", async () => {
    mocks.verify.mockResolvedValue({ ok: true, username: "alice" });
    const { GET } = await import("@/app/api/newsletter/sender/route");
    expect((await GET(req("type=site&target=ecency", { "x-hs-token": "tok" }))).status).toBe(400);
    expect((await GET(req("type=creator&target=Bad%20Name", { "x-hs-token": "tok" }))).status).toBe(400);
    mocks.verify.mockResolvedValue({ ok: false, reason: "missing" });
    expect((await GET(req("type=creator&target=alice"))).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv("NEWSLETTER_SERVICE_TOKEN", "");
    vi.resetModules();
    const { GET: GET2 } = await import("@/app/api/newsletter/sender/route");
    expect((await GET2(req("type=creator&target=alice", { "x-hs-token": "tok" }))).status).toBe(503);
  });
});
