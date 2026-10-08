import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { collectPostUserIds } from "@/server/chat-post-users";

function resp(status: number, body: unknown) {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

const ENV_KEYS = ["MATTERMOST_BASE_URL", "MATTERMOST_ADMIN_TOKEN", "MATTERMOST_TEAM_ID"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

async function loadModule() {
  process.env.MATTERMOST_BASE_URL = "https://chat.test/api/v4";
  process.env.MATTERMOST_ADMIN_TOKEN = "admin-token";
  process.env.MATTERMOST_TEAM_ID = "team-1";
  vi.resetModules();
  return await import("@/server/mattermost");
}

describe("getPrivateChannelRecipientIds", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the other member of a direct channel from its name", async () => {
    const { getPrivateChannelRecipientIds } = await loadModule();

    const ids = await getPrivateChannelRecipientIds(
      { id: "c1", name: "me__them", type: "D" },
      "me",
      "tok"
    );

    expect(ids).toEqual(["them"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("has no recipient for a conversation with yourself", async () => {
    const { getPrivateChannelRecipientIds } = await loadModule();

    expect(
      await getPrivateChannelRecipientIds({ id: "c1", name: "me__me", type: "D" }, "me", "tok")
    ).toEqual([]);
  });

  it("lists every other member of a group", async () => {
    const { getPrivateChannelRecipientIds } = await loadModule();
    fetchMock.mockResolvedValue(
      resp(200, [{ user_id: "me" }, { user_id: "b" }, { user_id: "c" }, { user_id: "d" }])
    );

    const ids = await getPrivateChannelRecipientIds(
      { id: "g1", name: "hash", type: "G" },
      "me",
      "tok"
    );

    expect(ids).toEqual(["b", "c", "d"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/channels/g1/members");
  });

  it("refuses to guess when a group's members cannot be read", async () => {
    const { getPrivateChannelRecipientIds } = await loadModule();
    fetchMock.mockResolvedValue(resp(500, { message: "boom" }));

    await expect(
      getPrivateChannelRecipientIds({ id: "g1", name: "hash", type: "G" }, "me", "tok")
    ).rejects.toThrow();
  });
});

describe("lookupMattermostUser", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves an unknown username to null", async () => {
    const { lookupMattermostUser } = await loadModule();
    fetchMock.mockResolvedValue(resp(404, { id: "app.user.missing_account.const" }));

    expect(await lookupMattermostUser("ghost")).toBeNull();
  });

  // Mattermost answers 400 for a name that cannot exist, such as one with
  // uppercase letters; that is still "not on chat", not a failure.
  it("resolves a name Mattermost rejects as invalid to null", async () => {
    const { lookupMattermostUser } = await loadModule();
    fetchMock.mockResolvedValue(resp(400, { id: "api.context.invalid_body_param.app_error" }));

    expect(await lookupMattermostUser("Alice")).toBeNull();
  });

  it("throws on an upstream failure instead of reporting the user missing", async () => {
    const { lookupMattermostUser } = await loadModule();
    fetchMock.mockResolvedValue(resp(502, { message: "bad gateway" }));

    await expect(lookupMattermostUser("bob")).rejects.toThrow();
  });
});

describe("collectPostUserIds", () => {
  it("includes reactors as well as authors, once each", () => {
    const ids = collectPostUserIds([
      { user_id: "a", metadata: { reactions: [{ user_id: "b" }, { user_id: "a" }] } },
      { user_id: "c", metadata: null },
      { user_id: "b", metadata: { reactions: [{ user_id: "d" }] } },
      { user_id: "" }
    ]);

    expect(ids.sort()).toEqual(["a", "b", "c", "d"]);
  });
});
