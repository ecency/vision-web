import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  canMentionEveryone,
  hasChannelWideMention,
  pickPostProps,
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
    "done, @channel!",
    // Mattermost trims leading ":.-_" and tries trailing ".-:_" off.
    ".@all",
    "-@channel",
    "_@here_",
    "-@here-",
    "@all-",
    "@all_",
    "@channel-.",
    // and splits a word not starting with "@" on ".-:".
    "x.@all",
    "foo-@here",
    "**@all**",
    "line one\n@channel",
    // Ways a markdown-aware skip was fooled: nothing is skipped any more.
    "`@all``",
    "`a\n`@all`",
    "```a`\n@all\n```",
    "\t```\n@all\n```",
    "](@all)",
    "http://@all",
    "http://x_y.com/@all",
    "[ http://x.com/@all",
    "use `@channel` to ping",
    "see https://x.com/@all",
    // Character references and emoji codes, as Mattermost reads them.
    "@al&#108;",
    "@channe&#108;",
    "@her&#101;",
    "@al&#x6C;",
    "@all-:x:",
    "@channel.:smile:",
    "x &commat;all",
    "@all&#120;",
    // A reference joins the text before it, not after it.
    "@al&#108;x",
    "@al&#108;ison",
    "@channe&#108;s",
    "@al&#00000108;",
    "@al&#x0000006C;",
    // An autolink is a node of its own.
    "@all-http://x.com",
    "@all.http://x.com",
    "@here:http://x.com",
    "@all-ftp://x",
    "@all_www.x.com",
    // Letters newer than Mattermost's Unicode tables split words there.
    "@all\u{2EBF0}",
    "@all\u{10D50}",
    "\u{10D50}@all",
    // A non-ASCII letter keeps ":@all:" inside a longer word for Mattermost.
    "é:@all:",
    "中:@channel:",
    "١:@here:",
    "é:@all:x",
    "中.@all.x",
    "é-@here.x"
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
    "all channel here",
    "@all:smile:",
    "@allison.",
    "&#64;allison"
  ])("leaves %j alone", (message) => {
    expect(hasChannelWideMention(message)).toBe(false);
  });

  it("keeps every channel-wide name out of the user mentions", () => {
    expect([...SPECIAL_MENTIONS].sort()).toEqual(["all", "channel", "everyone", "here"]);
  });

  it("lets anyone use them in a direct message, which reaches one person", () => {
    expect(
      canMentionEveryone({ canModerate: false, currentUser: { username: "alice" }, channel: { type: "D" } })
    ).toBe(true);
    expect(
      canMentionEveryone({ canModerate: false, currentUser: { username: "alice" }, channel: { type: "G" } })
    ).toBe(false);
  });

  it("forwards only the post props our clients send", () => {
    expect(
      pickPostProps({
        parent_id: "p1",
        link_url: "https://ecency.com",
        attachments: [{ text: "@channel" }],
        from_webhook: "true",
        parent_message: { nested: true }
      })
    ).toEqual({ parent_id: "p1", link_url: "https://ecency.com" });
    expect(pickPostProps({ attachments: [] })).toBeUndefined();
    expect(pickPostProps("x")).toBeUndefined();
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
    mockMmUserFetch.mockResolvedValue({ id: "p1", channel_id: "c1" });
  });

  it("refuses @channel and @all from a regular member", async () => {
    mockModerationContext.mockResolvedValue({ canModerate: false, currentUser: { username: "alice" } });
    const { PATCH } = await import("@/app/api/mattermost/channels/[channelId]/posts/[postId]/route");

    for (const message of ["@channel meeting now", "@all meeting now"]) {
      const res = await PATCH(edit(message), params);
      expect(res.status).toBe(403);
    }
    expect(mockMmUserFetch).not.toHaveBeenCalledWith("/posts/p1/patch", expect.anything(), expect.anything());
  });

  it("checks the channel the post is in, not the one in the address", async () => {
    // A moderator of their own community aims an edit at a post elsewhere.
    mockModerationContext.mockResolvedValue({ canModerate: true, currentUser: { username: "mod" }, channel: { id: "c1", type: "O" } });
    mockMmUserFetch.mockResolvedValue({ id: "p1", channel_id: "other-channel" });
    const { PATCH, DELETE } = await import("@/app/api/mattermost/channels/[channelId]/posts/[postId]/route");

    expect((await PATCH(edit("@channel hi"), params)).status).toBe(404);
    expect((await DELETE({} as never, params)).status).toBe(404);
    expect(mockMmUserFetch).not.toHaveBeenCalledWith("/posts/p1/patch", expect.anything(), expect.anything());
    expect(mockMmUserFetch).not.toHaveBeenCalledWith("/posts/p1", "test-token", { method: "DELETE" });
  });

  it("pins and unpins only posts in the channel named in the request", async () => {
    mockModerationContext.mockResolvedValue({
      canModerate: false,
      currentUser: { username: "alice" },
      channel: { id: "c1", type: "D" }
    });
    mockMmUserFetch.mockResolvedValue({ id: "p1", channel_id: "community-b" });
    const { POST, DELETE } = await import(
      "@/app/api/mattermost/channels/[channelId]/posts/[postId]/pin/route"
    );

    expect((await POST({} as never, params)).status).toBe(404);
    expect((await DELETE({} as never, params)).status).toBe(404);
    expect(mockMmUserFetch.mock.calls.map(([path]) => path)).toEqual(["/posts/p1", "/posts/p1"]);
  });

  it("lets the chat admin use them, in a private channel too", async () => {
    mockModerationContext.mockResolvedValue({ canModerate: false, currentUser: { username: "ecency" } });
    const { PATCH } = await import("@/app/api/mattermost/channels/[channelId]/posts/[postId]/route");

    const res = await PATCH(edit("@all meeting now"), params);

    expect(res.status).toBe(200);
    expect(mockMmUserFetch).toHaveBeenCalledWith("/posts/p1/patch", "test-token", expect.anything());
  });
});
