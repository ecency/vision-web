import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscriptions: [] as string[][],
  ensureCommunityChannelMembership: vi.fn(async () => "channel-id")
}));

vi.mock("@/server/hive-community", () => ({
  findHiveCommunity: vi.fn()
}));

vi.mock("@/server/hivesigner-verify", () => ({
  verifyHsAccessToken: vi.fn(async () => ({ ok: true, username: "alice" }))
}));

vi.mock("@ecency/sdk", () => ({
  getAccountSubscriptionsQueryOptions: vi.fn((username: string) => ({
    queryKey: ["accounts", "subscriptions", username],
    queryFn: vi.fn()
  }))
}));

vi.mock("@tanstack/react-query", () => ({
  // `function`, not an arrow: the route constructs it with `new`.
  QueryClient: vi.fn().mockImplementation(function () {
    return {
      fetchQuery: vi.fn(async () => mocks.subscriptions),
      cancelQueries: vi.fn(),
      clear: vi.fn()
    };
  })
}));

vi.mock("@/server/mattermost", async (importActual) => {
  const actual = await importActual<typeof import("@/server/mattermost")>();
  return {
    ...actual,
    ensureMattermostUser: vi.fn(async () => ({ id: "user-1" })),
    ensureUserInTeam: vi.fn(async () => undefined),
    ensurePersonalToken: vi.fn(async () => ({
      token: "pat",
      user: { id: "user-1", props: {} }
    })),
    ensureCommunityChannelMembership: mocks.ensureCommunityChannelMembership,
    withMattermostTokenCookie: vi.fn((response: Response) => response)
  };
});

type MattermostModule = typeof import("@/server/mattermost");

async function loadModule(): Promise<MattermostModule> {
  process.env.MATTERMOST_BASE_URL = "https://chat.test/api/v4";
  process.env.MATTERMOST_ADMIN_TOKEN = "admin-token";
  process.env.MATTERMOST_TEAM_ID = "team-1";
  return await import("@/server/mattermost");
}

const subs = (n: number): { id: string; title: string }[] =>
  Array.from({ length: n }, (_, i) => ({ id: `hive-${100000 + i}`, title: `C${i}` }));

describe("pickAutoJoinCommunities", () => {
  it("caps bootstrap auto-join at 10 communities, keeping Hive's order", async () => {
    const { pickAutoJoinCommunities, MAX_AUTO_JOIN_COMMUNITIES } = await loadModule();
    expect(MAX_AUTO_JOIN_COMMUNITIES).toBe(10);

    const picked = pickAutoJoinCommunities(subs(703), new Set());

    expect(picked.size).toBe(10);
    expect(Array.from(picked.keys())).toEqual(subs(10).map((s) => s.id));
    expect(picked.get("hive-100000")).toBe("C0");
  });

  it("skips left channels and duplicates without letting them use up the cap", async () => {
    const { pickAutoJoinCommunities } = await loadModule();
    const list = [{ id: "hive-100000", title: "dup" }, ...subs(12)];

    const picked = pickAutoJoinCommunities(list, new Set(["hive-100001", "hive-100002"]));

    expect(Array.from(picked.keys())).toEqual([
      "hive-100000",
      ...subs(12)
        .slice(3, 12)
        .map((s) => s.id)
    ]);
    // first occurrence wins for duplicates
    expect(picked.get("hive-100000")).toBe("dup");
  });

  it("matches left channels case-insensitively", async () => {
    const { pickAutoJoinCommunities } = await loadModule();
    const picked = pickAutoJoinCommunities([{ id: "Hive-100000" }], new Set(["hive-100000"]));
    expect(picked.size).toBe(0);
  });

  it("returns everything when under the cap", async () => {
    const { pickAutoJoinCommunities } = await loadModule();
    expect(pickAutoJoinCommunities(subs(3), new Set()).size).toBe(3);
  });
});

describe("POST /api/mattermost/bootstrap auto-join cap", () => {
  it("auto-joins only the first 10 of many subscribed communities", async () => {
    await loadModule();
    mocks.subscriptions = subs(25).map((s) => [s.id, s.title, "guest", ""]);
    mocks.ensureCommunityChannelMembership.mockClear();
    const { POST } = await import("@/app/api/mattermost/bootstrap/route");

    const res = await POST(
      new Request("http://localhost/api/mattermost/bootstrap", {
        method: "POST",
        body: JSON.stringify({ username: "alice", accessToken: "token" })
      })
    );

    expect(res.status).toBe(200);
    const joined = mocks.ensureCommunityChannelMembership.mock.calls.map(
      (call: unknown[]) => call[1]
    );
    expect(joined).toEqual(subs(10).map((s) => s.id));
  });
});
