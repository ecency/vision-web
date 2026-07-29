import { describe, it, expect, vi, beforeEach } from "vitest";

// The fan-out record is final: there is no compensating release, because a
// release cannot tell its own record from one a concurrent request is relying
// on. What keeps a rejected message from costing a slot is therefore ordering,
// not compensation, and ordering is only visible from the route. These pin it.

const mockMmUserFetch = vi.fn();
const mockCheckDmFanout = vi.fn();
const mockModerationContext = vi.fn();

vi.mock("@/server/mattermost", () => ({
  CHAT_BAN_PROP: "ecency_chat_banned_until",
  ensureMattermostUser: vi.fn(),
  ensureUserInChannel: vi.fn(),
  ensureUserInTeam: vi.fn(),
  followMattermostThreadForUser: vi.fn(),
  getMattermostCommunityModerationContext: (...args: unknown[]) => mockModerationContext(...args),
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: () => ({ status: 500 }),
  isUserChatBanned: () => null,
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

vi.mock("@/server/chat-dm-fanout", () => ({
  checkDmFanout: (...args: unknown[]) => mockCheckDmFanout(...args)
}));

const CHANNEL_ID = "dm-channel";

function request(message: string) {
  return {
    json: async () => ({ message })
  } as never;
}

const params = { params: Promise.resolve({ channelId: CHANNEL_ID }) };

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
});
