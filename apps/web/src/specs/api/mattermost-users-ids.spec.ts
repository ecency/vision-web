import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();

vi.mock("@/server/mattermost", () => ({
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: () => ({ status: 500 }),
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

function request(body: unknown) {
  return { json: async () => body } as never;
}

describe("POST /api/mattermost/users/ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns public fields only, keyed by id", async () => {
    const { POST } = await import("@/app/api/mattermost/users/ids/route");
    mockMmUserFetch.mockResolvedValue([
      { id: "u1", username: "bob", nickname: "Bob", email: "bob@example.com", roles: "system_user" }
    ]);

    const res = await POST(request({ ids: ["u1", "u1", " ", "u2"] }));

    expect(res.status).toBe(200);
    expect(JSON.parse(mockMmUserFetch.mock.calls[0][2].body)).toEqual(["u1", "u2"]);
    const { users } = await res.json();
    expect(users.u1).toEqual({ id: "u1", username: "bob", nickname: "Bob" });
  });

  it("rejects a malformed or oversized request without calling upstream", async () => {
    const { POST } = await import("@/app/api/mattermost/users/ids/route");

    expect((await POST(request({ ids: "u1" }))).status).toBe(400);
    expect((await POST(request({ ids: [1] }))).status).toBe(400);
    const many = Array.from({ length: 201 }, (_, i) => `u${i}`);
    expect((await POST(request({ ids: many }))).status).toBe(400);
    expect(mockMmUserFetch).not.toHaveBeenCalled();
  });

  it("answers an empty list without calling upstream", async () => {
    const { POST } = await import("@/app/api/mattermost/users/ids/route");

    const res = await POST(request({ ids: [] }));

    expect(await res.json()).toEqual({ users: {} });
    expect(mockMmUserFetch).not.toHaveBeenCalled();
  });
});
