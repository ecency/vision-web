import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();

vi.mock("@/server/mattermost", () => ({
  getMattermostTeamId: () => "team-1",
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (err: unknown) => {
    throw err;
  },
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

let unreadIds = new Set<string>();
let preferences: Array<{ category: string; name: string; value: string }> = [];

const CHANNELS = [
  { id: "g-1", name: "hash1", display_name: "alice, bob, me", type: "G" },
  { id: "g-2", name: "hash2", display_name: "carol, dave, me", type: "G" },
  { id: "o-1", name: "hive-1", display_name: "Community", type: "O" }
];

vi.mock("@/app/api/mattermost/channels/helpers", () => ({
  fetchAllChannelPages: () => Promise.resolve(CHANNELS),
  fetchAllChannelMemberPages: () => Promise.resolve([]),
  channelUnreadMessageCount: () => 0,
  dmContributesToUnreadBadge: (channel: { id: string }) => unreadIds.has(channel.id),
  fetchDeactivatedDmPartners: () => Promise.resolve({ usersById: {}, excludedChannelIds: new Set() }),
  findPhantomUnreadDmChannelIds: () => Promise.resolve(new Set()),
  isChannelUnreadSuppressed: () => false,
  isDirectLikeChannel: (channel: { type: string }) => channel.type === "D" || channel.type === "G",
  isMattermostDefaultChannel: () => false
}));

const member = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  username: id,
  nickname: `${id} nick`,
  email: `${id}@example.com`,
  props: { private: "x" },
  notify_props: { email: "true" },
  ...extra
});

describe("channels route — group members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The route caches group members per process.
    vi.resetModules();
    unreadIds = new Set();
    preferences = [];
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path === "/users/me") return Promise.resolve({ id: "me", username: "me" });
      if (path.includes("in_channel=g-1")) {
        return Promise.resolve([member("me"), member("alice"), member("bob", { delete_at: 5 })]);
      }
      if (path.includes("in_channel=g-2")) return Promise.reject(new Error("upstream 500"));
      if (path.includes("/channels/categories")) return Promise.resolve({ categories: [], order: [] });
      if (path === "/users/me/preferences") return Promise.resolve(preferences);
      return Promise.resolve([]);
    });
  });

  it("attaches the other active members of a group, with public fields only", async () => {
    const { GET } = await import("@/app/api/mattermost/channels/route");
    const res = await GET();
    const body = await res.json();
    const group = body.channels.find((channel: { id: string }) => channel.id === "g-1");

    expect(group.groupUsers).toEqual([{ id: "alice", username: "alice", nickname: "alice nick" }]);
    expect(JSON.stringify(group.groupUsers)).not.toMatch(/email|props|notify/);
  });

  it("keeps a group whose members cannot be read, without groupUsers", async () => {
    const { GET } = await import("@/app/api/mattermost/channels/route");
    const res = await GET();
    const body = await res.json();
    const group = body.channels.find((channel: { id: string }) => channel.id === "g-2");

    expect(group).toBeDefined();
    expect(group.groupUsers).toBeUndefined();
    expect(group.display_name).toBe("carol, dave, me");
  });

  it("does not look up members of other channel types", async () => {
    const { GET } = await import("@/app/api/mattermost/channels/route");
    await GET();

    const memberLookups = mockMmUserFetch.mock.calls
      .map(([path]) => path as string)
      .filter((path) => path.startsWith("/users?in_channel="));
    expect(memberLookups).toHaveLength(2);
    expect(memberLookups.some((path) => path.includes("o-1"))).toBe(false);
  });

  it("hides a group the viewer closed, until it has something unread", async () => {
    preferences = [{ category: "group_channel_show", name: "g-1", value: "false" }];
    const { GET } = await import("@/app/api/mattermost/channels/route");

    let body = await (await GET()).json();
    expect(body.channels.map((channel: { id: string }) => channel.id)).not.toContain("g-1");
    const prefWrites = () =>
      mockMmUserFetch.mock.calls.filter(
        ([path, , init]) => path === "/users/me/preferences" && (init as { method?: string })?.method === "PUT"
      );
    expect(prefWrites()).toHaveLength(0);

    unreadIds = new Set(["g-1"]);
    body = await (await GET()).json();
    expect(body.channels.map((channel: { id: string }) => channel.id)).toContain("g-1");
    // Reopened for good, so it stays listed once read.
    expect(prefWrites()).toHaveLength(1);
    expect(JSON.parse((prefWrites()[0][2] as { body: string }).body)).toEqual([
      { user_id: "me", category: "group_channel_show", name: "g-1", value: "true" }
    ]);
  });

  it("reuses a group's member list across requests", async () => {
    const { GET } = await import("@/app/api/mattermost/channels/route");

    await GET();
    await GET();

    const g1Lookups = mockMmUserFetch.mock.calls.filter(([path]) => String(path).includes("in_channel=g-1"));
    expect(g1Lookups).toHaveLength(1);
    // A failed lookup is not cached, so it is tried again.
    const g2Lookups = mockMmUserFetch.mock.calls.filter(([path]) => String(path).includes("in_channel=g-2"));
    expect(g2Lookups).toHaveLength(2);
  });

  it("still lists channels when reopening a group fails", async () => {
    preferences = [{ category: "group_channel_show", name: "g-1", value: "false" }];
    unreadIds = new Set(["g-1"]);
    const base = mockMmUserFetch.getMockImplementation()!;
    mockMmUserFetch.mockImplementation((path: string, token: string, init?: { method?: string }) =>
      path === "/users/me/preferences" && init?.method === "PUT"
        ? Promise.reject(new Error("upstream 500"))
        : base(path, token, init)
    );
    const { GET } = await import("@/app/api/mattermost/channels/route");

    const body = await (await GET()).json();

    expect(body.channels.map((channel: { id: string }) => channel.id)).toContain("g-1");
  });
});
