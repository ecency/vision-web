import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mmChannels: [] as unknown,
  ensureChannelForCommunity: vi.fn(async (name: string) => `ch-${name}`),
  findHiveCommunity: vi.fn(async (_name: string): Promise<{ name: string; title?: string } | null> => null),
  searchHiveCommunities: vi.fn(async (): Promise<{ name: string; title?: string }[]> => [])
}));

vi.mock("@/server/hive-community", () => ({
  findHiveCommunity: mocks.findHiveCommunity,
  searchHiveCommunities: mocks.searchHiveCommunities
}));

vi.mock("@/server/mattermost", async (importActual) => {
  const actual = await importActual<typeof import("@/server/mattermost")>();
  return {
    ...actual,
    getMattermostTokenFromCookies: vi.fn(async () => "user-token"),
    getMattermostTeamId: vi.fn(() => "team-1"),
    mmUserFetch: vi.fn(async () => mocks.mmChannels),
    ensureChannelForCommunity: mocks.ensureChannelForCommunity
  };
});

type SearchResult = { channels: { id: string; name: string; display_name: string }[] };

async function search(body: Record<string, unknown>): Promise<SearchResult> {
  process.env.MATTERMOST_BASE_URL = "https://chat.test/api/v4";
  process.env.MATTERMOST_ADMIN_TOKEN = "admin-token";
  process.env.MATTERMOST_TEAM_ID = "team-1";
  const { POST } = await import("@/app/api/mattermost/channels/search/route");
  const res = await POST(
    new Request("http://localhost/api/mattermost/channels/search", {
      method: "POST",
      body: JSON.stringify(body)
    })
  );
  expect(res.status).toBe(200);
  return (await res.json()) as SearchResult;
}

describe("POST /api/mattermost/channels/search Hive community fallback", () => {
  beforeEach(() => {
    // The route caches Hive matches and channel ids per process.
    vi.resetModules();
    mocks.mmChannels = [];
    mocks.ensureChannelForCommunity.mockClear();
    mocks.findHiveCommunity.mockReset().mockResolvedValue(null);
    mocks.searchHiveCommunities.mockReset().mockResolvedValue([]);
  });

  it("creates and returns channels for matching communities that have none", async () => {
    mocks.mmChannels = [{ id: "ch-a", name: "hive-1", display_name: "Photo A", type: "O" }];
    mocks.searchHiveCommunities.mockResolvedValue([
      { name: "hive-1", title: "Photo A" },
      { name: "hive-2", title: "Photo B" }
    ]);

    const { channels } = await search({ term: "photo" });

    expect(mocks.ensureChannelForCommunity).toHaveBeenCalledTimes(1);
    expect(mocks.ensureChannelForCommunity.mock.calls[0][0]).toBe("hive-2");
    expect(channels.map((c) => c.id)).toEqual(["ch-a", "ch-hive-2"]);
    expect(channels[1]).toMatchObject({ name: "hive-2", display_name: "Photo B" });
  });

  it("looks a community id up directly", async () => {
    mocks.findHiveCommunity.mockResolvedValue({ name: "hive-123", title: "Exact" });

    const { channels } = await search({ term: "Hive-123" });

    expect(mocks.findHiveCommunity.mock.calls[0][0]).toBe("hive-123");
    expect(mocks.searchHiveCommunities).not.toHaveBeenCalled();
    expect(channels.map((c) => c.name)).toEqual(["hive-123"]);
  });

  it("caps Hive matches at 3", async () => {
    mocks.searchHiveCommunities.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ name: `hive-${i}` }))
    );

    const { channels } = await search({ term: "art" });

    expect(mocks.searchHiveCommunities.mock.calls[0][1]).toBe(3);
    expect(channels).toHaveLength(3);
  });

  it("skips the Hive lookup for 2-letter queries and private-only searches", async () => {
    await search({ term: "ab" });
    await search({ term: "photo", public: false });

    expect(mocks.searchHiveCommunities).not.toHaveBeenCalled();
    expect(mocks.ensureChannelForCommunity).not.toHaveBeenCalled();
  });

  it("still returns Mattermost results when channel creation fails", async () => {
    mocks.mmChannels = [{ id: "ch-a", name: "hive-1", display_name: "A", type: "O" }];
    mocks.searchHiveCommunities.mockResolvedValue([{ name: "hive-2" }]);
    mocks.ensureChannelForCommunity.mockRejectedValueOnce(new Error("boom"));

    const { channels } = await search({ term: "photo" });

    expect(channels.map((c) => c.id)).toEqual(["ch-a"]);
  });

  it("reuses cached Hive matches and channel ids for a repeated search", async () => {
    mocks.searchHiveCommunities.mockResolvedValue([{ name: "hive-2", title: "B" }]);
    const { POST } = await import("@/app/api/mattermost/channels/search/route");
    const call = () =>
      POST(
        new Request("http://localhost/api/mattermost/channels/search", {
          method: "POST",
          body: JSON.stringify({ term: "photo" })
        })
      ).then((r) => r.json() as Promise<SearchResult>);

    await call();
    const second = await call();

    expect(mocks.searchHiveCommunities).toHaveBeenCalledTimes(1);
    expect(mocks.ensureChannelForCommunity).toHaveBeenCalledTimes(1);
    expect(second.channels.map((c) => c.id)).toEqual(["ch-hive-2"]);
  });

  it("does not cache an empty Hive result, so a failed lookup is retried", async () => {
    // The real helpers turn Hive errors and timeouts into an empty result.
    mocks.searchHiveCommunities.mockResolvedValueOnce([]);
    mocks.searchHiveCommunities.mockResolvedValueOnce([{ name: "hive-2", title: "B" }]);
    const { POST } = await import("@/app/api/mattermost/channels/search/route");
    const call = () =>
      POST(
        new Request("http://localhost/api/mattermost/channels/search", {
          method: "POST",
          body: JSON.stringify({ term: "photo" })
        })
      ).then((r) => r.json() as Promise<SearchResult>);

    expect((await call()).channels).toEqual([]);
    const second = await call();

    expect(mocks.searchHiveCommunities).toHaveBeenCalledTimes(2);
    expect(second.channels.map((c) => c.id)).toEqual(["ch-hive-2"]);
  });

  it("passes a non-array Mattermost body through without a Hive lookup", async () => {
    mocks.mmChannels = { unexpected: true };

    const body = (await search({ term: "photo" })) as unknown as { channels: unknown };

    expect(body.channels).toEqual({ unexpected: true });
    expect(mocks.searchHiveCommunities).not.toHaveBeenCalled();
  });
});
