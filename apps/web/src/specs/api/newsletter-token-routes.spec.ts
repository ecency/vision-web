import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
function upstream(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body } as never;
}
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const TOKEN = "abcdefghijklmnopqrstuvwx";

describe("link-driven newsletter routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("NEWSLETTER_API_URL", "http://news.internal:3300");
    vi.stubEnv("NEWSLETTER_SERVICE_TOKEN", "service-token-0123456789abcdefghijklmnop");
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue(upstream(200, { ok: true }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("confirm: GET inspects (relayed as GET), POST acts (relayed as POST)", async () => {
    const { GET, POST } = await import("@/app/api/newsletter/confirm/[token]/route");
    await GET({} as never, ctx(TOKEN));
    expect(mocks.fetch.mock.calls[0][0]).toBe(`http://news.internal:3300/confirm/${TOKEN}`);
    expect(mocks.fetch.mock.calls[0][1].method).toBe("GET");
    await POST({} as never, ctx(TOKEN));
    expect(mocks.fetch.mock.calls[1][1].method).toBe("POST");
  });

  it("unsubscribe: GET inspects, POST leaves one, POST /all suppresses", async () => {
    const one = await import("@/app/api/newsletter/unsubscribe/[token]/route");
    const all = await import("@/app/api/newsletter/unsubscribe/[token]/all/route");
    await one.GET({} as never, ctx(TOKEN));
    await one.POST({} as never, ctx(TOKEN));
    await all.POST({} as never, ctx(TOKEN));
    expect(mocks.fetch.mock.calls.map((c) => [c[0], c[1].method])).toEqual([
      [`http://news.internal:3300/unsubscribe/${TOKEN}`, "GET"],
      [`http://news.internal:3300/unsubscribe/${TOKEN}`, "POST"],
      [`http://news.internal:3300/unsubscribe/${TOKEN}/all`, "POST"]
    ]);
  });

  it("refuses a token that is not the shape the service mints, before any upstream call", async () => {
    const { POST } = await import("@/app/api/newsletter/confirm/[token]/route");
    for (const bad of ["short", "has space here abcdefghijklmnop", "../../admin/addresses", "a".repeat(65)]) {
      const res = await POST({} as never, ctx(bad));
      expect(res.status, bad).toBe(404);
    }
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("maps a service timeout to 504 and an unreachable service to 502, never 500", async () => {
    const { POST } = await import("@/app/api/newsletter/confirm/[token]/route");
    mocks.fetch.mockRejectedValueOnce(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    const slow = await POST({} as never, ctx(TOKEN));
    expect(slow.status).toBe(504);
    expect(((await slow.json()) as { error: string }).error).toMatch(/timed out/);
    mocks.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));
    const down = await POST({} as never, ctx(TOKEN));
    expect(down.status).toBe(502);
    expect(((await down.json()) as { error: string }).error).toMatch(/unreachable/);
  });

  it("503s when unconfigured", async () => {
    vi.stubEnv("NEWSLETTER_API_URL", "");
    const { POST } = await import("@/app/api/newsletter/confirm/[token]/route");
    expect((await POST({} as never, ctx(TOKEN))).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
