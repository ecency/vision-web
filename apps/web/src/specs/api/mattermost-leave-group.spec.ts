import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();
const mockAddUserLeftChannel = vi.fn();

vi.mock("@/server/mattermost", () => ({
  addUserLeftChannel: (...args: unknown[]) => mockAddUserLeftChannel(...args),
  COMMUNITY_CHANNEL_NAME_PATTERN: /^hive-\d+$/,
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (err: unknown) => {
    throw err;
  },
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

function respondWith(channel: { id: string; name: string; type: string }) {
  mockMmUserFetch.mockImplementation((path: string) => {
    if (path === "/users/me") return Promise.resolve({ id: "me", username: "me" });
    if (path === `/channels/${channel.id}`) return Promise.resolve(channel);
    return Promise.resolve({});
  });
}

const params = (channelId: string) => ({ params: Promise.resolve({ channelId }) });

describe("POST /api/mattermost/channels/[id]/leave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddUserLeftChannel.mockResolvedValue(undefined);
  });

  it("closes a group with a preference instead of removing the member", async () => {
    respondWith({ id: "g-1", name: "hash", type: "G" });
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/leave/route");

    const res = await POST(new Request("http://x"), params("g-1"));

    expect(res.status).toBe(200);
    const paths = mockMmUserFetch.mock.calls.map(([path]) => path);
    // Read first, so existing messages do not reopen it straight away.
    expect(paths.indexOf("/channels/members/me/view")).toBeGreaterThan(-1);
    expect(paths.indexOf("/channels/members/me/view")).toBeLessThan(paths.indexOf("/users/me/preferences"));
    const pref = mockMmUserFetch.mock.calls.find(([path]) => path === "/users/me/preferences");
    expect(JSON.parse(pref![2].body)).toEqual([
      { user_id: "me", category: "group_channel_show", name: "g-1", value: "false" }
    ]);
    expect(
      mockMmUserFetch.mock.calls.some(([, , init]) => (init as { method?: string })?.method === "DELETE")
    ).toBe(false);
  });

  it("still leaves a community channel as a member", async () => {
    respondWith({ id: "o-1", name: "hive-123", type: "O" });
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/leave/route");

    await POST(new Request("http://x"), params("o-1"));

    expect(mockMmUserFetch).toHaveBeenCalledWith("/channels/o-1/members/me", "test-token", {
      method: "DELETE"
    });
  });
});
