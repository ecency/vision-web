import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();

vi.mock("@/server/mattermost", () => ({
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (err: unknown) => {
    throw err;
  },
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

function respondWith(channel: { id: string; type: string }) {
  mockMmUserFetch.mockImplementation((path: string) => {
    if (path === "/users/me") return Promise.resolve({ id: "me" });
    if (path === `/channels/${channel.id}`) return Promise.resolve(channel);
    return Promise.resolve({});
  });
}

const params = (channelId: string) => ({ params: Promise.resolve({ channelId }) });
const memberAdds = () =>
  mockMmUserFetch.mock.calls.filter(
    ([path, , init]) => String(path).endsWith("/members") && (init as { method?: string })?.method === "POST"
  );

describe("POST /api/mattermost/channels/[id]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["D", "G"])("refuses a %s conversation with 403 forbidden and adds no member", async (type) => {
    respondWith({ id: "c-1", type });
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/join/route");

    const res = await POST(new Request("http://x"), params("c-1"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(memberAdds()).toHaveLength(0);
  });

  it("adds the current user to a public channel", async () => {
    respondWith({ id: "o-1", type: "O" });
    const { POST } = await import("@/app/api/mattermost/channels/[channelId]/join/route");

    const res = await POST(new Request("http://x"), params("o-1"));

    expect(res.status).toBe(200);
    expect(memberAdds()).toHaveLength(1);
    expect(JSON.parse(memberAdds()[0][2].body)).toEqual({ channel_id: "o-1", user_id: "me" });
  });
});
