import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// #2023 review: the avatar route answers `Cache-Control: public`, so it must
// never carry the chat session cookies (an owner stamp or an expiry) that the
// ownerless-cookie check can write.

let jar: Record<string, string> = {};
const setCookie = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({
    get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined),
    set: (...args: unknown[]) => setCookie(...args)
  })
}));

const fetchMock = vi.fn();

async function avatar() {
  vi.resetModules();
  vi.stubEnv("MATTERMOST_BASE_URL", "https://mm.test/api/v4");
  const { GET } = await import("@/app/api/mattermost/users/[userId]/image/route");
  return GET({} as never, { params: Promise.resolve({ userId: "u2" }) });
}

describe("avatar route and the chat session cookies (#2023)", () => {
  beforeEach(() => {
    setCookie.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("writes no chat cookie for an ownerless session, whoever it belongs to", async () => {
    jar = { mm_pat: "tok-a", active_user: "alice" };
    for (const username of ["alice", "bob"]) {
      fetchMock.mockImplementation(async (url: string) =>
        url.endsWith("/users/me")
          ? new Response(JSON.stringify({ id: "u1", username }), { status: 200 })
          : new Response(new Uint8Array([1]), { status: 200, headers: { "Content-Type": "image/png" } })
      );
      await avatar();
    }
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    await avatar();

    expect(setCookie).not.toHaveBeenCalled();
  });

  it("still serves the avatar, publicly cacheable, for a session that names its owner", async () => {
    jar = { mm_pat: "tok-a", mm_owner: "alice", active_user: "alice" };
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1]), { status: 200, headers: { "Content-Type": "image/png" } })
    );
    const res = await avatar();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(setCookie).not.toHaveBeenCalled();
  });
});
