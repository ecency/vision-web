import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();
const mockMmUserFetchNdjson = vi.fn();

vi.mock("@/server/mattermost", () => ({
  toPublicChatUser: (user: unknown) => user,
  getMattermostTeamId: () => "team-123",
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (err: unknown) => ({ error: String(err) }),
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args),
  mmUserFetchNdjson: (...args: unknown[]) => mockMmUserFetchNdjson(...args)
}));

function makeChannels(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `ch-${i}`,
    name: `channel-${i}`,
    display_name: `Channel ${i}`,
    type: "O"
  }));
}

function makeMembers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: "u-self",
    channel_id: `ch-${i}`,
    mention_count: 0,
    msg_count: 0
  }));
}

describe("fetchAllChannelPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls /users/me/channels once and returns the streamed array", async () => {
    const { fetchAllChannelPages } = await import(
      "@/app/api/mattermost/channels/helpers"
    );
    const channels = makeChannels(2499);
    mockMmUserFetch.mockResolvedValueOnce(channels);

    const result = await fetchAllChannelPages("test-token");

    expect(result).toHaveLength(2499);
    expect(mockMmUserFetch).toHaveBeenCalledTimes(1);
    expect(mockMmUserFetch).toHaveBeenCalledWith(
      "/users/me/channels",
      "test-token"
    );
  });

  it("returns [] when upstream gives a non-array response", async () => {
    const { fetchAllChannelPages } = await import(
      "@/app/api/mattermost/channels/helpers"
    );
    mockMmUserFetch.mockResolvedValueOnce(undefined);

    const result = await fetchAllChannelPages("test-token");

    expect(result).toEqual([]);
    expect(mockMmUserFetch).toHaveBeenCalledTimes(1);
  });
});

describe("fetchAllChannelMemberPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls /users/me/channel_members?page=-1 once via NDJSON", async () => {
    const { fetchAllChannelMemberPages } = await import(
      "@/app/api/mattermost/channels/helpers"
    );
    const members = makeMembers(2499);
    mockMmUserFetchNdjson.mockResolvedValueOnce(members);

    const result = await fetchAllChannelMemberPages("test-token");

    expect(result).toHaveLength(2499);
    expect(mockMmUserFetchNdjson).toHaveBeenCalledTimes(1);
    expect(mockMmUserFetchNdjson).toHaveBeenCalledWith(
      "/users/me/channel_members?page=-1",
      "test-token"
    );
  });
});
