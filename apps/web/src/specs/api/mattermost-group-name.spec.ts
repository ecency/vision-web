import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeMattermostError extends Error {
  constructor(public status: number) {
    super(`status ${status}`);
  }
}

const GROUP = "g".repeat(26);
const ME = "m".repeat(26);
const BOB = "b".repeat(26);

const mockMmUserFetch = vi.fn();
const mockGetOwner = vi.fn();
const mockSetOwner = vi.fn();
const mockOwnerMissing = vi.fn();

vi.mock("@/server/mattermost", () => ({
  getMattermostTokenFromCookies: () => Promise.resolve("test-token"),
  handleMattermostError: (error: unknown) => ({
    status: error instanceof FakeMattermostError ? error.status : 500
  }),
  getGroupOwnerId: (...args: unknown[]) => mockGetOwner(...args),
  setGroupOwnerId: (...args: unknown[]) => mockSetOwner(...args),
  isGroupOwnerMissing: (...args: unknown[]) => mockOwnerMissing(...args),
  mmUserFetch: (...args: unknown[]) => mockMmUserFetch(...args)
}));

function request(body: unknown) {
  return { json: async () => body } as never;
}

const params = { params: Promise.resolve({ channelId: GROUP }) };

function setup({ type = "G", header = "" }: { type?: string; header?: string } = {}) {
  mockMmUserFetch.mockImplementation((path: string) => {
    if (path === `/channels/${GROUP}`) return Promise.resolve({ id: GROUP, type, header });
    if (path === "/users/me") return Promise.resolve({ id: ME });
    if (path === `/channels/${GROUP}/patch`) return Promise.resolve({});
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const patches = () => mockMmUserFetch.mock.calls.filter(([p]) => p === `/channels/${GROUP}/patch`);

async function put(name: unknown) {
  const { PUT } = await import("@/app/api/mattermost/channels/[channelId]/name/route");
  return PUT(request({ name }), params);
}

describe("PUT /api/mattermost/channels/[channelId]/name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOwner.mockResolvedValue(ME);
    mockSetOwner.mockResolvedValue(undefined);
    mockOwnerMissing.mockResolvedValue(true);
  });

  it("lets the owner name the group, kept in its header", async () => {
    setup();

    const res = await put("  Book   club \n");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Book club" });
    expect(JSON.parse(patches()[0][2].body)).toEqual({ header: "Book club" });
    expect(mockGetOwner).toHaveBeenCalledWith(GROUP, { fresh: true });
    expect(mockSetOwner).not.toHaveBeenCalled();
  });

  it("refuses a member when someone else owns the group", async () => {
    setup();
    mockGetOwner.mockResolvedValue(BOB);

    const res = await put("Mine now");

    expect(res.status).toBe(403);
    expect(mockSetOwner).not.toHaveBeenCalled();
    expect(patches()).toHaveLength(0);
  });

  it("lets the first member name a group with no owner, recording them", async () => {
    setup();
    mockGetOwner.mockResolvedValueOnce(null).mockResolvedValueOnce(ME);

    const res = await put("Old group");

    expect(res.status).toBe(200);
    expect(mockSetOwner).toHaveBeenCalledWith(GROUP, ME);
    expect(patches()).toHaveLength(1);
  });

  it("does not claim when the full owner list shows an owner after all", async () => {
    setup();
    mockGetOwner.mockResolvedValue(null);
    mockOwnerMissing.mockResolvedValue(false);

    const res = await put("Not yours");

    expect(res.status).toBe(403);
    expect(mockSetOwner).not.toHaveBeenCalled();
    expect(patches()).toHaveLength(0);
  });

  it("refuses the loser when two members claim at once", async () => {
    setup();
    mockGetOwner.mockResolvedValueOnce(null).mockResolvedValueOnce(BOB);

    const res = await put("Race");

    expect(res.status).toBe(403);
    expect(patches()).toHaveLength(0);
  });

  it("clears the name with an empty string", async () => {
    setup({ header: "Book club" });

    const res = await put("");

    expect(res.status).toBe(200);
    expect(JSON.parse(patches()[0][2].body)).toEqual({ header: "" });
  });

  it("does not post a change when the name is the same", async () => {
    setup({ header: " Book   club " });

    const res = await put("Book club");

    expect(res.status).toBe(200);
    expect(patches()).toHaveLength(0);
  });

  it("only renames group conversations, and never claims anything else", async () => {
    setup({ type: "O" });

    const res = await put("Town square");

    expect(res.status).toBe(400);
    expect(mockGetOwner).not.toHaveBeenCalled();
    expect(mockSetOwner).not.toHaveBeenCalled();
    expect(patches()).toHaveLength(0);
  });

  it("rejects a name that is too long or not text", async () => {
    setup();

    expect((await put("x".repeat(65))).status).toBe(400);
    expect((await put(42)).status).toBe(400);
    expect(mockMmUserFetch).not.toHaveBeenCalled();
  });

  it("passes through a refusal to read the channel, as for a non-member", async () => {
    mockMmUserFetch.mockImplementation((path: string) =>
      path === `/channels/${GROUP}`
        ? Promise.reject(new FakeMattermostError(403))
        : Promise.resolve({ id: ME })
    );

    const res = await put("Sneaky");

    expect(res.status).toBe(403);
    expect(mockSetOwner).not.toHaveBeenCalled();
    expect(patches()).toHaveLength(0);
  });
});
