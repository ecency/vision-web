import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();
const mockModeration = vi.fn();

vi.mock("@/server/mattermost", () => ({
  getMattermostCommunityModerationContext: (...args: unknown[]) => mockModeration(...args),
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (error: unknown) => {
    throw error;
  },
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

const params = { params: Promise.resolve({ channelId: "c1", postId: "p1" }) };
const request = (method: string) => new Request("http://x", { method }) as never;

function channel(type: string, { canModerate = false, member = true } = {}) {
  mockModeration.mockResolvedValue({ channel: { id: "c1", type }, canModerate });
  mockMmUserFetch.mockImplementation((path: string) => {
    if (path === "/posts/p1") return Promise.resolve({ id: "p1", channel_id: "c1" });
    if (path === "/channels/c1/members/me") {
      return member ? Promise.resolve({ user_id: "me" }) : Promise.reject(new Error("not a member"));
    }
    if (path === "/channels/c1/pinned") return Promise.resolve({ posts: {}, order: [] });
    return Promise.resolve({});
  });
}

const pinCalls = () =>
  mockMmUserFetch.mock.calls.filter(([path]) => path === "/posts/p1/pin" || path === "/posts/p1/unpin");

async function route() {
  return import("@/app/api/mattermost/channels/[channelId]/posts/[postId]/pin/route");
}

describe("pin route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a group member who is not a moderator, both ways", async () => {
    const { POST, DELETE } = await route();
    channel("G");
    expect((await POST(request("POST"), params)).status).toBe(403);
    expect((await DELETE(request("DELETE"), params)).status).toBe(403);
    expect(pinCalls()).toHaveLength(0);
  });

  it("refuses a private channel member who is not a moderator, both ways", async () => {
    const { POST, DELETE } = await route();
    channel("P");
    expect((await POST(request("POST"), params)).status).toBe(403);
    expect((await DELETE(request("DELETE"), params)).status).toBe(403);
    expect(pinCalls()).toHaveLength(0);
  });

  it("refuses a public channel member who is not a moderator", async () => {
    const { POST } = await route();
    channel("O");
    expect((await POST(request("POST"), params)).status).toBe(403);
    expect(pinCalls()).toHaveLength(0);
  });

  it("lets a direct message member pin and unpin", async () => {
    const { POST, DELETE } = await route();
    channel("D");
    expect((await POST(request("POST"), params)).status).toBe(200);
    expect((await DELETE(request("DELETE"), params)).status).toBe(200);
    expect(pinCalls().map(([path]) => path)).toEqual(["/posts/p1/pin", "/posts/p1/unpin"]);
  });

  it("refuses a direct message the viewer is not in", async () => {
    const { POST } = await route();
    channel("D", { member: false });
    expect((await POST(request("POST"), params)).status).toBe(403);
    expect(pinCalls()).toHaveLength(0);
  });

  it("lets a community moderator pin and unpin", async () => {
    const { POST, DELETE } = await route();
    channel("O", { canModerate: true });
    expect((await POST(request("POST"), params)).status).toBe(200);
    expect((await DELETE(request("DELETE"), params)).status).toBe(200);
    expect(pinCalls()).toHaveLength(2);
  });
});
