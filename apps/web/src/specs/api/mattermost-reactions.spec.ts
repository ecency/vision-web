import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();
const mockEnsureUserInChannel = vi.fn();

vi.mock("@/server/mattermost", () => ({
  ensureUserInChannel: (...args: unknown[]) => mockEnsureUserInChannel(...args),
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (error: unknown) => {
    throw error;
  },
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

const params = { params: Promise.resolve({ channelId: "c1", postId: "p1" }) };
const request = (method: string) =>
  new Request("http://x", { method, body: JSON.stringify({ emoji: "smile" }) }) as never;

function respondWith(channelType: string, postChannelId = "c1") {
  mockMmUserFetch.mockImplementation((path: string) => {
    if (path === "/users/me") return Promise.resolve({ id: "me" });
    if (path === "/channels/c1") return Promise.resolve({ id: "c1", type: channelType });
    if (path === "/posts/p1") return Promise.resolve({ id: "p1", channel_id: postChannelId });
    return Promise.resolve({ user_id: "me", post_id: "p1", emoji_name: "smile" });
  });
}

describe("reactions route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("joins a public channel before reacting, as reading one by link does", async () => {
    respondWith("O");
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/[postId]/reactions/route");

    expect((await POST(request("POST"), params)).status).toBe(200);
    expect(mockEnsureUserInChannel).toHaveBeenCalledWith("me", "c1");
  });

  it("never adds anyone to a private channel, group or DM", async () => {
    const { POST, DELETE } = await import(
      "@/app/api/mattermost/channels/[channelId]/posts/[postId]/reactions/route"
    );
    for (const type of ["P", "G", "D"]) {
      respondWith(type);
      await POST(request("POST"), params);
      await DELETE(request("DELETE"), params);
    }
    expect(mockEnsureUserInChannel).not.toHaveBeenCalled();
  });

  it("refuses a post from another channel", async () => {
    respondWith("O", "elsewhere");
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/posts/[postId]/reactions/route");

    expect((await POST(request("POST"), params)).status).toBe(404);
    expect(mockMmUserFetch).not.toHaveBeenCalledWith("/reactions", expect.anything(), expect.anything());
  });
});
