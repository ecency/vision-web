import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  canMentionEveryone,
  hasChannelWideMention,
  SPECIAL_MENTIONS
} from "@/server/chat-special-mentions";

describe("channel-wide mentions", () => {
  it.each([
    "@here look",
    "@everyone free airdrop",
    "ping @channel",
    "@all",
    "(@all) please",
    "hey @ALL.",
    "done, @channel!"
  ])("recognises %j", (message) => {
    expect(hasChannelWideMention(message)).toBe(true);
  });

  it.each([
    "@allison hi",
    "@all-stars won",
    "@channels are fun",
    "@all.ecency",
    "mail me at x@all.com",
    "a@here",
    "all channel here"
  ])("leaves %j alone", (message) => {
    expect(hasChannelWideMention(message)).toBe(false);
  });

  it("keeps every channel-wide name out of the user mentions", () => {
    expect([...SPECIAL_MENTIONS].sort()).toEqual(["all", "channel", "everyone", "here"]);
  });

  it("allows community moderators and the chat admin only", () => {
    expect(canMentionEveryone({ canModerate: true, currentUser: { username: "mod" } })).toBe(true);
    expect(canMentionEveryone({ canModerate: false, currentUser: { username: "ecency" } })).toBe(true);
    expect(canMentionEveryone({ canModerate: false, currentUser: { username: "alice" } })).toBe(false);
  });
});

const mockModerationContext = vi.fn();
const mockMmUserFetch = vi.fn();

vi.mock("@/server/mattermost", async () => ({
  ...(await vi.importActual<typeof import("@/server/mattermost")>("@/server/mattermost")),
  deleteMattermostPostAsAdmin: vi.fn(),
  getMattermostCommunityModerationContext: (...args: unknown[]) => mockModerationContext(...args),
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: () => ({ status: 500 }),
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

describe("editing a post into a channel-wide mention", () => {
  const params = { params: Promise.resolve({ channelId: "c1", postId: "p1" }) };
  const edit = (message: string) => ({ json: async () => ({ message }) }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMmUserFetch.mockResolvedValue({ id: "p1" });
  });

  it("refuses @channel and @all from a regular member", async () => {
    mockModerationContext.mockResolvedValue({ canModerate: false, currentUser: { username: "alice" } });
    const { PATCH } = await import("@/app/api/mattermost/channels/[channelId]/posts/[postId]/route");

    for (const message of ["@channel meeting now", "@all meeting now"]) {
      const res = await PATCH(edit(message), params);
      expect(res.status).toBe(403);
    }
    expect(mockMmUserFetch).not.toHaveBeenCalled();
  });

  it("lets the chat admin use them, in a private channel too", async () => {
    mockModerationContext.mockResolvedValue({ canModerate: false, currentUser: { username: "ecency" } });
    const { PATCH } = await import("@/app/api/mattermost/channels/[channelId]/posts/[postId]/route");

    const res = await PATCH(edit("@all meeting now"), params);

    expect(res.status).toBe(200);
    expect(mockMmUserFetch).toHaveBeenCalledWith("/posts/p1/patch", "test-token", expect.anything());
  });
});
