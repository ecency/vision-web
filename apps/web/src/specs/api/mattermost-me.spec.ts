import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();
const token = { value: "test-token" as string | null };

vi.mock("@/server/mattermost", () => ({
  getMattermostTokenFromCookies: () => Promise.resolve(token.value),
  handleMattermostError: () => Response.json({ error: "upstream" }, { status: 502 }),
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

// Who the chat session cookie belongs to: only the username leaves the server.
describe("GET /api/mattermost/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    token.value = "test-token";
  });

  it("answers the token's Mattermost username and nothing else", async () => {
    mockMmUserFetch.mockResolvedValue({ id: "u1", username: "ann", email: "ann+no-email@ecency.local" });
    const { GET } = await import("@/app/api/mattermost/me/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "ann" });
    expect(mockMmUserFetch).toHaveBeenCalledWith("/users/me", "test-token");
  });

  it("is 401 without a chat session", async () => {
    token.value = null;
    const { GET } = await import("@/app/api/mattermost/me/route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockMmUserFetch).not.toHaveBeenCalled();
  });

  it("maps a Mattermost failure the way the other routes do", async () => {
    mockMmUserFetch.mockRejectedValue(new Error("down"));
    const { GET } = await import("@/app/api/mattermost/me/route");
    expect((await GET()).status).toBe(502);
  });
});
