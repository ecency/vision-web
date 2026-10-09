import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeMattermostError extends Error {
  constructor(public status: number) {
    super(`status ${status}`);
  }
}

const mockMmUserFetch = vi.fn();
const mockAnyUserHasPreference = vi.fn();

vi.mock("@/server/mattermost", () => ({
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (error: unknown) => ({
    status: error instanceof FakeMattermostError ? error.status : 500
  }),
  isMattermostNotFoundError: (error: unknown) =>
    error instanceof FakeMattermostError && error.status === 404,
  anyUserHasPreference: (...args: unknown[]) => mockAnyUserHasPreference(...args),
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

const OWNER_PREF = "/users/me/preferences/ecency_group_owner/name/group-1";

function request(body: unknown) {
  return { json: async () => body } as never;
}

const params = { params: Promise.resolve({ channelId: "group-1" }) };

function setup({
  type = "G",
  header = "",
  owner = true
}: { type?: string; header?: string; owner?: boolean } = {}) {
  mockMmUserFetch.mockImplementation((path: string) => {
    if (path === "/channels/group-1") return Promise.resolve({ id: "group-1", type, header });
    if (path === "/users/me") return Promise.resolve({ id: "me" });
    if (path === OWNER_PREF) {
      return owner ? Promise.resolve({}) : Promise.reject(new FakeMattermostError(404));
    }
    if (path === "/users?in_channel=group-1&per_page=20") {
      return Promise.resolve([{ id: "me" }, { id: "bob" }, { id: "carol" }]);
    }
    if (path === "/channels/group-1/patch") return Promise.resolve({});
    if (path === "/users/me/preferences") return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const calls = (path: string) => mockMmUserFetch.mock.calls.filter(([p]) => p === path);

describe("PUT /api/mattermost/channels/[channelId]/name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnyUserHasPreference.mockResolvedValue(false);
  });

  it("lets the owner name the group, kept in its header", async () => {
    setup();
    const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");

    const res = await PUT(request({ name: "  Book   club \n" }), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Book club" });
    expect(JSON.parse(calls("/channels/group-1/patch")[0][2].body)).toEqual({ header: "Book club" });
    expect(mockAnyUserHasPreference).not.toHaveBeenCalled();
    expect(calls("/users/me/preferences")).toHaveLength(0);
  });

  it("refuses a member when someone else started the group", async () => {
    setup({ owner: false });
    mockAnyUserHasPreference.mockResolvedValue(true);
    const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");

    const res = await PUT(request({ name: "Mine now" }), params);

    expect(res.status).toBe(403);
    expect(mockAnyUserHasPreference).toHaveBeenCalledWith(
      ["bob", "carol"],
      "ecency_group_owner",
      "group-1"
    );
    expect(calls("/channels/group-1/patch")).toHaveLength(0);
  });

  it("lets the first member name a group that has no owner yet, and records them", async () => {
    setup({ owner: false });
    const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");

    const res = await PUT(request({ name: "Old group" }), params);

    expect(res.status).toBe(200);
    expect(calls("/channels/group-1/patch")).toHaveLength(1);
    expect(JSON.parse(calls("/users/me/preferences")[0][2].body)).toEqual([
      { user_id: "me", category: "ecency_group_owner", name: "group-1", value: "true" }
    ]);
  });

  it("clears the name with an empty string", async () => {
    setup({ header: "Book club" });
    const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");

    const res = await PUT(request({ name: "" }), params);

    expect(res.status).toBe(200);
    expect(JSON.parse(calls("/channels/group-1/patch")[0][2].body)).toEqual({ header: "" });
  });

  it("does not post a change when the name is the same", async () => {
    setup({ header: "Book club" });
    const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");

    const res = await PUT(request({ name: "Book club" }), params);

    expect(res.status).toBe(200);
    expect(calls("/channels/group-1/patch")).toHaveLength(0);
  });

  it("only renames group conversations", async () => {
    setup({ type: "O" });
    const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");

    const res = await PUT(request({ name: "Town square" }), params);

    expect(res.status).toBe(400);
    expect(calls("/channels/group-1/patch")).toHaveLength(0);
  });

  it("rejects a name that is too long or not text", async () => {
    setup();
    const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");

    expect((await PUT(request({ name: "x".repeat(65) }), params)).status).toBe(400);
    expect((await PUT(request({ name: 42 }), params)).status).toBe(400);
    expect(mockMmUserFetch).not.toHaveBeenCalled();
  });

  it("passes through a refusal to read the channel, as for a non-member", async () => {
    setup();
    mockMmUserFetch.mockImplementation((path: string) =>
      path === "/channels/group-1"
        ? Promise.reject(new FakeMattermostError(403))
        : Promise.resolve({ id: "me" })
    );
    const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");

    const res = await PUT(request({ name: "Sneaky" }), params);

    expect(res.status).toBe(403);
    expect(calls("/channels/group-1/patch")).toHaveLength(0);
  });
});
