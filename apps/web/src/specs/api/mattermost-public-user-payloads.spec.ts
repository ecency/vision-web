import { describe, it, expect, vi, beforeEach } from "vitest";

// Every route that returns other users' records must strip private fields.
// These run the real stripping helpers; only the upstream fetch is mocked.

const mockMmUserFetch = vi.fn();

vi.mock("@/server/mattermost", async () => {
  const publicUser = await vi.importActual<typeof import("@/server/chat-public-user")>(
    "@/server/chat-public-user"
  );
  return {
    toPublicChatUser: publicUser.toPublicChatUser,
    toPublicChatUserMap: <T extends object>(users: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(users).map(([id, user]) => [id, publicUser.toPublicChatUser(user)])
      ),
    getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
    handleMattermostError: (error: unknown) => {
      throw error;
    },
    mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args),
    getMattermostCommunityModerationContext: vi.fn(),
    ensureMattermostUser: vi.fn(),
    ensureUserInChannel: vi.fn(),
    ensureUserInTeam: vi.fn(),
    followMattermostThreadForUser: vi.fn(),
    getUserChatBanReason: vi.fn(),
    isUserChatBanned: vi.fn(),
    CHAT_BAN_PROP: "ecency_chat_banned_until"
  };
});

vi.mock("@/server/chat-dm-fanout", () => ({ checkDmFanout: vi.fn() }));

const PRIVATE_USER = {
  id: "u-2",
  username: "bob",
  nickname: "Bob",
  email: "bob@example.com",
  props: { ecency_pat_sealed: "v1.x", ecency_dm_privacy: "followers" },
  notify_props: { push: "all" },
  timezone: { automaticTimezone: "Europe/Berlin" }
};

function expectPublic(user: Record<string, unknown>) {
  expect(user).toMatchObject({ id: "u-2", username: "bob", nickname: "Bob" });
  for (const field of ["props", "notify_props", "email", "timezone"]) {
    expect(user).not.toHaveProperty(field);
  }
}

describe("chat routes return public user records only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts route, thread page", async () => {
    const { GET } = await import("@/app/api/mattermost/channels/[channelId]/posts/route");
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path.startsWith("/posts/root-1/thread")) {
        return Promise.resolve({
          posts: { "root-1": { id: "root-1", channel_id: "c-1", user_id: "u-2", create_at: 1 } },
          order: ["root-1"]
        });
      }
      if (path === "/users/ids") return Promise.resolve([PRIVATE_USER]);
      return Promise.reject(new Error(`unexpected ${path}`));
    });

    const res = await GET(
      { nextUrl: new URL("https://x.test/?thread=root-1") } as never,
      { params: Promise.resolve({ channelId: "c-1" }) }
    );

    expectPublic((await res.json()).users["u-2"]);
  });

  it("pinned route", async () => {
    const { GET } = await import("@/app/api/mattermost/channels/[channelId]/pinned/route");
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path.includes("/pinned")) {
        return Promise.resolve({
          posts: { p1: { id: "p1", user_id: "u-2", create_at: 1 } },
          order: ["p1"]
        });
      }
      if (path === "/users/ids") return Promise.resolve([PRIVATE_USER]);
      return Promise.resolve({});
    });

    const res = await GET({} as never, { params: Promise.resolve({ channelId: "c-1" }) });

    expectPublic((await res.json()).users["u-2"]);
  });

  it("channel members route drops per-member notification settings", async () => {
    const { GET } = await import("@/app/api/mattermost/channels/[channelId]/members/route");
    mockMmUserFetch.mockResolvedValue([
      { channel_id: "c-1", user_id: "u-2", roles: "channel_user", notify_props: { push: "all" } }
    ]);

    const res = await GET({ nextUrl: new URL("https://x.test/") } as never, {
      params: Promise.resolve({ channelId: "c-1" })
    });

    const { members } = await res.json();
    expect(members[0]).toEqual({ channel_id: "c-1", user_id: "u-2", roles: "channel_user" });
  });
});
