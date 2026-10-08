import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMmUserFetch = vi.fn();
const mockFindUser = vi.fn();
const mockPrivacy = vi.fn();
const mockCheckDmFanout = vi.fn();

vi.mock("@/server/mattermost", () => ({
  lookupMattermostUser: (...args: unknown[]) => mockFindUser(...args),
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: () => ({ status: 500 }),
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

vi.mock("@/server/chat-dm-privacy", () => ({
  getDmPrivacyRejection: (...args: unknown[]) => mockPrivacy(...args)
}));

vi.mock("@/server/chat-dm-fanout", async () => {
  const actual = await vi.importActual<typeof import("@/server/chat-dm-fanout")>(
    "@/server/chat-dm-fanout"
  );
  return {
    dmFanoutLimitFor: actual.dmFanoutLimitFor,
    checkDmFanout: (...args: unknown[]) => mockCheckDmFanout(...args)
  };
});

const ESTABLISHED = Date.now() - 30 * 24 * 3_600_000;

function request(body: unknown) {
  return { json: async () => body } as never;
}

function createCalls() {
  return mockMmUserFetch.mock.calls.filter(([path]) => path === "/channels/group");
}

describe("POST /api/mattermost/group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMmUserFetch.mockImplementation((path: string) => {
      if (path === "/users/me") {
        return Promise.resolve({ id: "me", username: "alice", create_at: ESTABLISHED });
      }
      if (path === "/channels/group") return Promise.resolve({ id: "group-1" });
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    mockFindUser.mockImplementation((name: string) =>
      Promise.resolve({ id: `id-${name}`, username: name })
    );
    mockPrivacy.mockResolvedValue(null);
    mockCheckDmFanout.mockResolvedValue({
      allowed: true,
      recipients: 2,
      limit: 20,
      retryAfterSeconds: 0
    });
  });

  it("creates the group with the sender and every member", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");

    const res = await POST(request({ usernames: ["@Bob", "carol", "bob", "alice"] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ channelId: "group-1" });
    expect(JSON.parse(createCalls()[0][2].body)).toEqual(["me", "id-bob", "id-carol"]);
  });

  it("counts every member against the fan-out limit", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");

    await POST(request({ usernames: ["bob", "carol", "dave"] }));

    expect(mockCheckDmFanout.mock.calls[0][0]).toMatchObject({
      userId: "me",
      recipients: ["id-bob", "id-carol", "id-dave"]
    });
  });

  it("rejects fewer than two or more than seven other people", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");

    // Only one other person once the sender and duplicates are removed.
    const tooFew = await POST(request({ usernames: ["bob", "BOB", "alice"] }));
    const tooMany = await POST(
      request({ usernames: ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"] })
    );

    expect(tooFew.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(createCalls()).toHaveLength(0);
  });

  it("rejects a malformed body", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");

    expect((await POST(request({ usernames: "bob,carol" }))).status).toBe(400);
    expect((await POST(request({ usernames: ["bob", 7] }))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
  });

  it("names the members who are not on chat", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");
    mockFindUser.mockImplementation((name: string) =>
      Promise.resolve(name === "ghost" ? null : { id: `id-${name}`, username: name })
    );

    const res = await POST(request({ usernames: ["bob", "ghost"] }));

    expect(res.status).toBe(404);
    expect((await res.json()).missing).toEqual(["ghost"]);
    expect(createCalls()).toHaveLength(0);
  });

  it("refuses the whole group when any member does not accept DMs", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");
    mockPrivacy.mockImplementation((user: { username: string }) =>
      Promise.resolve(
        user.username === "carol"
          ? { error: "nope", privacy_level: "none", target_username: "carol" }
          : null
      )
    );

    const res = await POST(request({ usernames: ["bob", "carol"] }));

    expect(res.status).toBe(403);
    expect((await res.json()).rejections).toHaveLength(1);
    expect(mockCheckDmFanout).not.toHaveBeenCalled();
    expect(createCalls()).toHaveLength(0);
  });

  it("refuses a new account a group larger than its cap without recording anyone", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");
    mockMmUserFetch.mockImplementation((path: string) =>
      path === "/users/me"
        ? Promise.resolve({ id: "me", username: "alice", create_at: Date.now() - 60_000 })
        : Promise.resolve({ id: "group-1" })
    );

    const res = await POST(request({ usernames: ["a1", "a2", "a3", "a4", "a5", "a6"] }));

    expect(res.status).toBe(403);
    expect(mockCheckDmFanout).not.toHaveBeenCalled();
    expect(createCalls()).toHaveLength(0);
  });

  it("answers 429 and creates nothing once the cap is reached", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");
    mockCheckDmFanout.mockResolvedValue({
      allowed: false,
      recipients: 19,
      limit: 20,
      retryAfterSeconds: 600
    });

    const res = await POST(request({ usernames: ["bob", "carol"] }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect(createCalls()).toHaveLength(0);
  });

  // In a group every member can write to every other, so a followers-only
  // member must follow all of them, not just the creator.
  it("checks each member's privacy against every other participant", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");

    await POST(request({ usernames: ["bob", "carol"] }));

    const calls = mockPrivacy.mock.calls.map(([user, senders]) => [user.username, senders]);
    expect(calls).toEqual([
      ["bob", ["alice", "carol"]],
      ["carol", ["alice", "bob"]]
    ]);
  });

  it("reports an upstream failure instead of calling members missing", async () => {
    const { POST } = await import("@/app/api/mattermost/group/route");
    mockFindUser.mockRejectedValue(new Error("timeout"));

    const res = await POST(request({ usernames: ["bob", "carol"] }));

    expect(res.status).toBe(500);
    expect(createCalls()).toHaveLength(0);
  });
});
