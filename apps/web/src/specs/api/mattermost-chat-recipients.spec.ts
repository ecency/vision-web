import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { collectPostUserIds } from "@/server/chat-post-users";

function resp(status: number, body: unknown) {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

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

  it("falls back to one recipient when the members cannot be read", async () => {
    const { getPrivateChannelRecipientIds } = await loadModule();
    fetchMock.mockResolvedValue(resp(500, { message: "boom" }));

    expect(
      await getPrivateChannelRecipientIds({ id: "g1", name: "hash", type: "G" }, "me", "tok")
    ).toEqual(["g1"]);
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
