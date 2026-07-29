import { describe, it, expect, vi, beforeEach } from "vitest";

// ensureMattermostUser must be idempotent: a concurrent/repeat bootstrap
// (common with browser-extension integrations) can create the MM user
// between the username lookup and the create POST. Mattermost then returns
// 400 app.user.save.username_exists.app_error. That benign race must NOT
// surface as an error (the bootstrap route maps it to a 502) — it should
// re-fetch the now-existing user and return it.

function resp(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

const USERNAME_EXISTS = {
  id: "app.user.save.username_exists.app_error",
  message: "An account with that username already exists.",
  detailed_error: "",
  status_code: 400
};

async function loadModule() {
  process.env.MATTERMOST_BASE_URL = "https://chat.test/api/v4";
  process.env.MATTERMOST_ADMIN_TOKEN = "admin-token";
  process.env.MATTERMOST_TEAM_ID = "team-1";
  vi.resetModules();
  return await import("@/server/mattermost");
}

describe("ensureMattermostUser — idempotency / concurrent-create race", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the existing user when create races into username_exists", async () => {
    const { ensureMattermostUser } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(404, "user not found")) // GET /users/username
      .mockResolvedValueOnce(resp(400, USERNAME_EXISTS)) // POST /users (lost the race)
      .mockResolvedValueOnce(
        resp(200, { id: "u-1", username: "alice", email: "a", delete_at: 0 })
      ); // GET /users/username (re-fetch)

    const user = await ensureMattermostUser("alice");

    expect(user).toEqual({ id: "u-1", username: "alice", email: "a", delete_at: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reactivates the existing user if the raced-in account was deactivated", async () => {
    const { ensureMattermostUser } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(404, "nf"))
      .mockResolvedValueOnce(resp(400, USERNAME_EXISTS))
      .mockResolvedValueOnce(
        resp(200, { id: "u-2", username: "carol", email: "c", delete_at: 1700000000000 })
      )
      .mockResolvedValueOnce(resp(200, "")); // PUT /users/u-2/active

    const user = await ensureMattermostUser("carol");

    expect(user.id).toBe("u-2");
    expect(user.delete_at).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toContain("/users/u-2/active");
  });

  it("does not create when the user already exists (happy path unchanged)", async () => {
    const { ensureMattermostUser } = await loadModule();
    fetchMock.mockResolvedValueOnce(
      resp(200, { id: "u-9", username: "bob", email: "b", delete_at: 0 })
    );

    const user = await ensureMattermostUser("bob");

    expect(user.id).toBe("u-9");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no POST /users
  });

  // Deactivation on its own is undone by the next login, so a moderation
  // action that deactivates + bans used to be silently reverted here: the
  // account came back active and held a live session, with only the post-time
  // ban still enforcing. Reactivation must refuse while the ban is live.
  it("refuses to reactivate a deactivated account with a live ban", async () => {
    const { ensureMattermostUser, ChatBannedError } = await loadModule();
    const bannedUntil = Date.now() + 60_000;
    fetchMock.mockResolvedValueOnce(
      resp(200, {
        id: "u-3",
        username: "spammer",
        email: "s",
        delete_at: 1700000000000,
        props: { ecency_chat_banned_until: String(bannedUntil) }
      })
    );

    const err = await ensureMattermostUser("spammer").catch((e) => e);

    expect(err).toBeInstanceOf(ChatBannedError);
    expect(err.bannedUntil).toBe(bannedUntil);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no PUT /active
  });

  it("reactivates once the ban has expired", async () => {
    const { ensureMattermostUser } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(
        resp(200, {
          id: "u-4",
          username: "reformed",
          email: "r",
          delete_at: 1700000000000,
          props: { ecency_chat_banned_until: String(Date.now() - 60_000) }
        })
      )
      .mockResolvedValueOnce(resp(200, "")); // PUT /users/u-4/active

    const user = await ensureMattermostUser("reformed");

    expect(user.delete_at).toBe(0);
    expect(fetchMock.mock.calls[1][0]).toContain("/users/u-4/active");
  });

  it("leaves a banned but still-active account alone", async () => {
    const { ensureMattermostUser } = await loadModule();
    fetchMock.mockResolvedValueOnce(
      resp(200, {
        id: "u-5",
        username: "muted",
        email: "m",
        delete_at: 0,
        props: { ecency_chat_banned_until: String(Date.now() + 60_000) }
      })
    );

    // The ban blocks posting, not reading — bootstrap stays available.
    const user = await ensureMattermostUser("muted");

    expect(user.id).toBe("u-5");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses reactivation on the username_exists race path too", async () => {
    const { ensureMattermostUser, ChatBannedError } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(404, "nf"))
      .mockResolvedValueOnce(resp(400, USERNAME_EXISTS))
      .mockResolvedValueOnce(
        resp(200, {
          id: "u-6",
          username: "racer",
          email: "r",
          delete_at: 1700000000000,
          props: { ecency_chat_banned_until: String(Date.now() + 60_000) }
        })
      );

    await expect(ensureMattermostUser("racer")).rejects.toBeInstanceOf(ChatBannedError);
    expect(fetchMock).toHaveBeenCalledTimes(3); // no PUT /active
  });

  it("still throws on non-username_exists create errors", async () => {
    const { ensureMattermostUser } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(404, "nf"))
      .mockResolvedValueOnce(
        resp(400, { id: "app.user.save.email_exists.app_error", message: "email exists" })
      );

    await expect(ensureMattermostUser("dave")).rejects.toThrow(
      /Mattermost request failed \(400\)/
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // no idempotent re-fetch
  });
});

// The bootstrap path (route.ts:104-107) also adds the user to the team after
// create — same unguarded GET→POST race; the loser's add can error "team
// member already exists" and previously bubbled to the same 502 catch.
describe("ensureUserInTeam — idempotency / concurrent-join race", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("no-ops when already a team member (happy path)", async () => {
    const { ensureUserInTeam } = await loadModule();
    fetchMock.mockResolvedValueOnce(resp(200, { team_id: "team-1", user_id: "u-1" }));
    await expect(ensureUserInTeam("u-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no POST add
  });

  it("treats a raced 'member exists' add as success via end-state recheck", async () => {
    const { ensureUserInTeam } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(404, "not a member")) // GET membership
      .mockResolvedValueOnce(
        resp(400, { id: "app.team.join_user_to_team.exists", message: "team member exists" })
      ) // POST add (lost the race)
      .mockResolvedValueOnce(resp(200, { team_id: "team-1", user_id: "u-1" })); // re-check → is a member
    await expect(ensureUserInTeam("u-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rethrows when the add fails and the user is still not a member", async () => {
    const { ensureUserInTeam } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(404, "nf"))
      .mockResolvedValueOnce(resp(403, { id: "api.context.permissions.app_error" }))
      .mockResolvedValueOnce(resp(404, "still not a member"));
    await expect(ensureUserInTeam("u-1")).rejects.toThrow(/Mattermost request failed \(403\)/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("ensureUserInChannel / ensureChannelForCommunity — idempotency", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("ensureUserInChannel tolerates a raced channel-join", async () => {
    const { ensureUserInChannel } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(404, "not a member")) // GET channel membership
      .mockResolvedValueOnce(resp(400, { id: "store.sql_channel.save_member.exists.app_error" })) // POST add raced
      .mockResolvedValueOnce(resp(200, { channel_id: "c-1", user_id: "u-1" })); // re-check → member
    await expect(ensureUserInChannel("u-1", "c-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ensureChannelForCommunity reuses a concurrently-created channel", async () => {
    const { ensureChannelForCommunity } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(404, "no such channel")) // GET channel by name
      .mockResolvedValueOnce(resp(400, { id: "store.sql_channel.save_channel.exists.app_error" })) // POST create raced
      .mockResolvedValueOnce(resp(200, { id: "ch-1", name: "hive-1" })); // re-fetch by name
    await expect(ensureChannelForCommunity("hive-1", "Hive One")).resolves.toBe("ch-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
