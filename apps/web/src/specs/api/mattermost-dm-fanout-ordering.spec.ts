import { describe, it, expect, vi, beforeEach } from "vitest";

// The fan-out record is final: there is no compensating release, because a
// release cannot tell its own record from one a concurrent request is relying
// on. What keeps a rejected message from costing a slot is therefore ordering,
// not compensation, and ordering is only visible from the route. These pin it.

const mockMmUserFetch = vi.fn();
const mockCheckDmFanout = vi.fn();
const mockModerationContext = vi.fn();
const mockRecipientIds = vi.fn();

vi.mock("@/server/mattermost", () => ({
  CHAT_BAN_PROP: "ecency_chat_banned_until",
  ensureUserInChannel: vi.fn(),
  ensureUserInTeam: vi.fn(),
  followMattermostThreadForUser: vi.fn(),
  getMattermostCommunityModerationContext: (...args: unknown[]) => mockModerationContext(...args),
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  getPrivateChannelRecipientIds: (...args: unknown[]) => mockRecipientIds(...args),
  handleMattermostError: () => ({ status: 500 }),
  isUserChatBanned: () => null,
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

vi.mock("@/server/chat-dm-fanout", () => ({
  checkDmFanout: (...args: unknown[]) => mockCheckDmFanout(...args)
}));

const mockAddMentioned = vi.fn();
vi.mock("@/server/chat-mentions", () => ({
  addMentionedUsersToChannel: (...args: unknown[]) => mockAddMentioned(...args)
}));

const CHANNEL_ID = "dm-channel";

function request(message: string) {
  return {
    json: async () => ({ message })
  } as never;
}

const params = { params: Promise.resolve({ channelId: CHANNEL_ID }) };

function asGroupChannel() {
  const base = mockMmUserFetch.getMockImplementation()!;
  mockMmUserFetch.mockImplementation((path: string, ...rest: unknown[]) =>
    path === `/channels/${CHANNEL_ID}`
      ? Promise.resolve({ id: CHANNEL_ID, name: "group-hash", display_name: "a, b, c", type: "G" })
      : base(path, ...rest)
  );
}

function allowFanout() {
  mockCheckDmFanout.mockResolvedValue({
    allowed: true,
    recipients: 1,
    limit: 5,
    retryAfterSeconds: 0
  });
}

describe("posts route — DM fan-out runs last", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecipientIds.mockResolvedValue(["u-2"]);
    // /users/me then /channels/:id, both resolved in parallel by the route.
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path === "/users/me") {
        return Promise.resolve({ id: "u-1", username: "newbie", create_at: Date.now() });
      }
      if (path === `/channels/${CHANNEL_ID}`) {
        return Promise.resolve({ id: CHANNEL_ID, name: "dm", display_name: "dm", type: "D" });
      }
      return Promise.resolve({ id: "post-1" });
    });
  });

  // The case that made the earlier rollback look necessary. Rejecting the
  // message before the record is written costs nothing and needs no undo.
  it("does not record a recipient for a message it rejects", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    mockModerationContext.mockResolvedValue({ canModerate: false });
    allowFanout();

    const res = await POST(request("@everyone free airdrop"), params);

    expect(res.status).toBe(403);
    expect(mockCheckDmFanout).not.toHaveBeenCalled();
    expect(mockMmUserFetch).not.toHaveBeenCalledWith("/posts", expect.anything(), expect.anything());
  });

  it("records the recipient and posts for an ordinary DM", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    allowFanout();

    const res = await POST(request("hello there"), params);

    expect(res.status).toBe(200);
    expect(mockCheckDmFanout).toHaveBeenCalledOnce();
    expect(mockCheckDmFanout.mock.calls[0][0]).toMatchObject({ userId: "u-1", recipients: ["u-2"] });
    expect(mockMmUserFetch).toHaveBeenCalledWith("/posts", "test-token", expect.anything());
  });

  it("rejects with 429 and sends nothing once the cap is reached", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    mockCheckDmFanout.mockResolvedValue({
      allowed: false,
      recipients: 5,
      limit: 5,
      retryAfterSeconds: 1800
    });

    const res = await POST(request("hello there"), params);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    expect(mockMmUserFetch).not.toHaveBeenCalledWith("/posts", expect.anything(), expect.anything());
  });

  it("leaves public channel posting unmetered", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path === "/users/me") {
        return Promise.resolve({ id: "u-1", username: "newbie", create_at: Date.now() });
      }
      if (path === `/channels/${CHANNEL_ID}`) {
        return Promise.resolve({ id: CHANNEL_ID, name: "hive-1", display_name: "c", type: "O" });
      }
      return Promise.resolve({ id: "post-1" });
    });

    const res = await POST(request("hello there"), params);

    expect(res.status).toBe(200);
    expect(mockCheckDmFanout).not.toHaveBeenCalled();
  });

  it("counts every other member of a group as a recipient", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    asGroupChannel();
    mockRecipientIds.mockResolvedValue(["u-2", "u-3", "u-4"]);
    allowFanout();

    const res = await POST(request("hello group"), params);

    expect(res.status).toBe(200);
    expect(mockRecipientIds.mock.calls[0][0]).toMatchObject({ type: "G" });
    expect(mockCheckDmFanout.mock.calls[0][0]).toMatchObject({
      recipients: ["u-2", "u-3", "u-4"]
    });
  });

  it("explains a group larger than the cap instead of asking to retry later", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    asGroupChannel();
    mockRecipientIds.mockResolvedValue(["u-2", "u-3", "u-4", "u-5", "u-6", "u-7"]);
    mockCheckDmFanout.mockResolvedValue({
      allowed: false,
      recipients: 0,
      limit: 5,
      retryAfterSeconds: 3600
    });

    const res = await POST(request("hello group"), params);

    expect(res.status).toBe(403);
    expect(mockMmUserFetch).not.toHaveBeenCalledWith("/posts", expect.anything(), expect.anything());
  });

  it("asks to retry later when a group exactly at the cap is blocked", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    asGroupChannel();
    mockRecipientIds.mockResolvedValue(["u-2", "u-3", "u-4", "u-5", "u-6"]);
    mockCheckDmFanout.mockResolvedValue({
      allowed: false,
      recipients: 3,
      limit: 5,
      retryAfterSeconds: 900
    });

    const res = await POST(request("hello group"), params);

    expect(res.status).toBe(429);
  });

  it("sends nothing when a group's members cannot be read", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    asGroupChannel();
    mockRecipientIds.mockRejectedValue(new Error("upstream down"));
    allowFanout();

    const res = await POST(request("hello group"), params);

    expect(res.status).toBe(500);
    expect(mockCheckDmFanout).not.toHaveBeenCalled();
    expect(mockMmUserFetch).not.toHaveBeenCalledWith("/posts", expect.anything(), expect.anything());
  });
});

describe("posts route — @mention auto-join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddMentioned.mockResolvedValue({ added: [] });
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path === "/users/me") {
        return Promise.resolve({ id: "u-1", username: "poster", create_at: 42 });
      }
      if (path === `/channels/${CHANNEL_ID}`) {
        return Promise.resolve({ id: CHANNEL_ID, name: "town", display_name: "Town", type: "O" });
      }
      return Promise.resolve({ id: "post-1" });
    });
  });

  it("hands public-channel mentions to the bounded helper after posting", async () => {
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");

    await POST(request("hi @Alice and @bob.smith, also @alice"), params);

    expect(mockAddMentioned).toHaveBeenCalledTimes(1);
    expect(mockAddMentioned).toHaveBeenCalledWith({
      channelId: CHANNEL_ID,
      senderId: "u-1",
      senderCreatedAt: 42,
      usernames: ["alice", "bob.smith"]
    });
    // A public channel is not a private conversation: no fan-out on the post itself.
    expect(mockCheckDmFanout).not.toHaveBeenCalled();
  });

  it("does not auto-join anyone from a direct message", async () => {
    mockRecipientIds.mockResolvedValue(["u-2"]);
    allowFanout();
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path === "/users/me") return Promise.resolve({ id: "u-1", username: "poster" });
      if (path === `/channels/${CHANNEL_ID}`) {
        return Promise.resolve({ id: CHANNEL_ID, name: "u-1__u-2", display_name: "dm", type: "D" });
      }
      return Promise.resolve({ id: "post-1" });
    });
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");

    await POST(request("hey @carol"), params);

    expect(mockAddMentioned).not.toHaveBeenCalled();
  });
});
