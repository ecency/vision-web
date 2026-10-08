import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ensurePersonalToken returns BOTH the PAT and the user record it already
// fetched (the bootstrap route reads user.props for left-channels). The token
// itself is stored sealed and bound to its owner. These run the real module
// against a small stateful stand-in for the Mattermost endpoints it uses.

const ENV_KEYS = ["MATTERMOST_BASE_URL", "MATTERMOST_ADMIN_TOKEN", "MATTERMOST_TEAM_ID"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function resp(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

async function loadModule(adminToken = "admin-token") {
  process.env.MATTERMOST_BASE_URL = "https://chat.test/api/v4";
  process.env.MATTERMOST_ADMIN_TOKEN = adminToken;
  process.env.MATTERMOST_TEAM_ID = "team-1";
  vi.resetModules();
  return await import("@/server/mattermost");
}

interface FakeToken {
  id: string;
  userId: string;
  secret: string;
  description: string;
  active: boolean;
}

/** Just enough of Mattermost: users with props, tokens, /users/me, revoke. */
class FakeMattermost {
  users = new Map<string, { id: string; username: string; props: Record<string, string> }>();
  tokens: FakeToken[] = [];
  failMe: number | null = null;
  calls: string[] = [];
  private seq = 0;

  addUser(id: string, props: Record<string, string> = {}) {
    this.users.set(id, { id, username: `name-${id}`, props: { ...props } });
  }

  issue(userId: string, description = "ecency-auto") {
    const token = {
      id: `t${++this.seq}`,
      userId,
      secret: `secret-${this.seq}`,
      description,
      active: true
    };
    this.tokens.push(token);
    return token;
  }

  active(userId: string) {
    return this.tokens.filter((t) => t.userId === userId && t.active).map((t) => t.secret);
  }

  handle = async (url: string, init?: RequestInit) => {
    const path = String(url).replace("https://chat.test/api/v4", "");
    const method = init?.method ?? "GET";
    this.calls.push(`${method} ${path}`);
    await Promise.resolve(); // let concurrent requests interleave

    if (path === "/users/me") {
      if (this.failMe) return resp(this.failMe, "mm exploded");
      const bearer = String((init?.headers as Record<string, string>).Authorization).slice(7);
      const token = this.tokens.find((t) => t.secret === bearer && t.active);
      return token ? resp(200, { id: token.userId }) : resp(401, { id: "api.context.session_expired" });
    }
    if (path === "/users/tokens/revoke") {
      const { token_id } = JSON.parse(String(init?.body));
      // Mattermost deletes the row on revoke; a second revoke is a 404.
      const index = this.tokens.findIndex((t) => t.id === token_id);
      if (index < 0) return resp(404, { id: "app.user_access_token.get_by_user.app_error" });
      this.tokens.splice(index, 1);
      return resp(200, { status: "OK" });
    }

    const tokens = path.match(/^\/users\/([^/?]+)\/tokens(\?page=(\d+)&per_page=(\d+))?$/);
    if (tokens) {
      const [, userId, , page, perPage] = tokens;
      if (method === "POST") return resp(200, { token: this.issue(userId).secret });
      const all = this.tokens
        .filter((t) => t.userId === userId)
        .map((t) => ({ id: t.id, description: t.description, is_active: t.active }));
      const size = Number(perPage);
      return resp(200, all.slice(Number(page) * size, (Number(page) + 1) * size));
    }

    const patch = path.match(/^\/users\/([^/]+)\/patch$/);
    if (patch) {
      this.users.get(patch[1])!.props = { ...JSON.parse(String(init?.body)).props };
      return resp(200, "");
    }

    const user = path.match(/^\/users\/([^/]+)$/);
    if (user && this.users.has(user[1])) {
      const record = this.users.get(user[1])!;
      return resp(200, { ...record, email: "x", delete_at: 0, props: { ...record.props } });
    }

    throw new Error(`unexpected ${method} ${path}`);
  };
}

let mm: FakeMattermost;

beforeEach(() => {
  mm = new FakeMattermost();
  vi.stubGlobal("fetch", vi.fn(mm.handle));
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("ensurePersonalToken", () => {
  it("reuses the stored token and returns the user it read", async () => {
    const { ensurePersonalToken, sealSessionToken } = await loadModule();
    const token = mm.issue("u-1");
    mm.addUser("u-1", {
      ecency_pat_sealed: sealSessionToken(token.secret, "u-1"),
      ecency_left_channels: JSON.stringify(["hive-old"])
    });

    const result = await ensurePersonalToken("u-1");

    expect(result.token).toBe(token.secret);
    expect(result.user.props?.ecency_left_channels).toBe(JSON.stringify(["hive-old"]));
    expect(mm.calls).toEqual(["GET /users/u-1", "GET /users/me"]);
  });

  it("issues a sealed token when none is stored and never stores it as plaintext", async () => {
    const { ensurePersonalToken, openSessionToken } = await loadModule();
    mm.addUser("u-2", { ecency_left_channels: JSON.stringify(["hive-x"]) });

    const result = await ensurePersonalToken("u-2");

    const props = mm.users.get("u-2")!.props;
    expect(JSON.stringify(props)).not.toContain(result.token);
    expect(openSessionToken(props.ecency_pat_sealed, "u-2")).toBe(result.token);
    expect(props.ecency_left_channels).toBe(JSON.stringify(["hive-x"]));
    expect(result.user.props?.ecency_left_channels).toBe(JSON.stringify(["hive-x"]));
  });

  it("issues a new token when the stored one was revoked", async () => {
    const { ensurePersonalToken, sealSessionToken } = await loadModule();
    const stale = mm.issue("u-3");
    mm.tokens = mm.tokens.filter((t) => t !== stale); // revoked = deleted
    mm.addUser("u-3", { ecency_pat_sealed: sealSessionToken(stale.secret, "u-3") });

    const result = await ensurePersonalToken("u-3");

    expect(result.token).not.toBe(stale.secret);
    expect(mm.active("u-3")).toEqual([result.token]);
  });

  it("surfaces non-auth errors from token validation without issuing", async () => {
    const { ensurePersonalToken, sealSessionToken } = await loadModule();
    const token = mm.issue("u-4");
    mm.addUser("u-4", { ecency_pat_sealed: sealSessionToken(token.secret, "u-4") });
    mm.failMe = 500;

    await expect(ensurePersonalToken("u-4")).rejects.toThrow(/500|mm exploded/);
    expect(mm.calls.some((c) => c.startsWith("POST /users/u-4/tokens"))).toBe(false);
  });

  it("retires a plaintext token: revokes what was issued and stores a sealed one", async () => {
    const { ensurePersonalToken, openSessionToken } = await loadModule();
    const old = mm.issue("u-6");
    const other = mm.issue("u-6", "someone-else");
    mm.addUser("u-6", { ecency_pat: old.secret, ecency_dm_privacy: "followers" });

    const result = await ensurePersonalToken("u-6");

    expect(mm.active("u-6").sort()).toEqual([other.secret, result.token].sort());
    const props = mm.users.get("u-6")!.props;
    expect(props.ecency_pat).toBeUndefined();
    expect(props.ecency_dm_privacy).toBe("followers");
    expect(openSessionToken(props.ecency_pat_sealed, "u-6")).toBe(result.token);
    // The old plaintext token is never validated or reused.
    expect(mm.calls).not.toContain("GET /users/me");
  });

  it("never hands out a working token that belongs to another user, and revokes it", async () => {
    // A value sealed for u-7 that resolves to u-8 cannot be produced without
    // the key; this pins the owner check behind the crypto anyway.
    const { ensurePersonalToken, sealSessionToken } = await loadModule();
    const foreign = mm.issue("u-8");
    mm.addUser("u-7", { ecency_pat_sealed: sealSessionToken(foreign.secret, "u-7") });

    const result = await ensurePersonalToken("u-7");

    expect(result.token).not.toBe(foreign.secret);
    expect(mm.active("u-8")).toEqual([]);
    expect(mm.active("u-7")).toEqual([result.token]);
  });

  it("revokes what was issued when the stored value cannot be opened", async () => {
    const { ensurePersonalToken, sealSessionToken } = await loadModule();
    const orphan = mm.issue("u-9");
    // Sealed for someone else, as if copied into u-9's props.
    mm.addUser("u-9", { ecency_pat_sealed: sealSessionToken(orphan.secret, "u-1") });

    const result = await ensurePersonalToken("u-9");

    expect(mm.active("u-9")).toEqual([result.token]);
  });

  // Two bootstraps for one user at once must not revoke each other's token.
  it("serialises concurrent bootstraps so both end up with the same live token", async () => {
    const { ensurePersonalToken } = await loadModule();
    const old = mm.issue("u-12");
    mm.addUser("u-12", { ecency_pat: old.secret });

    const [a, b] = await Promise.all([ensurePersonalToken("u-12"), ensurePersonalToken("u-12")]);

    expect(a.token).toBe(b.token);
    expect(mm.active("u-12")).toEqual([a.token]);
  });
});

describe("ensurePersonalToken across app instances", () => {
  afterEach(() => {
    vi.doUnmock("@/server/chat-dm-fanout");
    delete process.env.CHAT_TOKEN_LOCK_WAIT_MS;
  });

  // Two instances share Redis and Mattermost but not memory. While one is
  // slowly migrating a user, the other must not proceed unlocked and revoke
  // the token the first is about to return.
  it("never hands out a token another instance has revoked", async () => {
    const { FakeLockRedis } = await import("./helpers/fake-lock-redis");
    const redis = new FakeLockRedis();
    vi.doMock("@/server/chat-dm-fanout", () => ({ getChatRedis: () => redis }));
    process.env.CHAT_TOKEN_LOCK_WAIT_MS = "200";

    const instanceA = await loadModule();
    const instanceB = await loadModule(); // fresh module graph: own memory

    const old = mm.issue("u-20");
    mm.addUser("u-20", { ecency_pat: old.secret });

    // Instance A's token creation is slow (still inside each call's timeout).
    let releaseA!: () => void;
    const gate = new Promise<void>((resolve) => (releaseA = resolve));
    const realHandle = mm.handle;
    let slowed = false;
    mm.handle = async (url, init) => {
      if (!slowed && init?.method === "POST" && String(url).endsWith("/users/u-20/tokens")) {
        slowed = true;
        await gate;
      }
      return realHandle(url, init);
    };
    vi.stubGlobal("fetch", vi.fn(mm.handle));

    const a = instanceA.ensurePersonalToken("u-20");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const b = instanceB.ensurePersonalToken("u-20");

    await expect(b).rejects.toBeInstanceOf(instanceB.ChatUserBusyError);
    releaseA();
    const tokenA = (await a).token;

    expect(mm.active("u-20")).toEqual([tokenA]);
    // B's retry reuses A's token instead of revoking it.
    expect((await instanceB.ensurePersonalToken("u-20")).token).toBe(tokenA);
    expect(mm.active("u-20")).toEqual([tokenA]);
  });
});

describe("retirePlaintextSessionToken", () => {
  it("pages through every issued token", async () => {
    const { retirePlaintextSessionToken } = await loadModule();
    for (let i = 0; i < 201; i++) mm.issue("u-10");
    mm.addUser("u-10", { ecency_pat: "old" });

    expect(await retirePlaintextSessionToken("u-10")).toBe(true);
    expect(mm.active("u-10")).toEqual([]);
    expect(mm.users.get("u-10")!.props.ecency_pat).toBeUndefined();
  });

  it("treats a token already revoked by someone else as done", async () => {
    const { retirePlaintextSessionToken } = await loadModule();
    const token = mm.issue("u-13");
    mm.addUser("u-13", { ecency_pat: token.secret });
    const realHandle = mm.handle;
    // Another request revokes it between our listing and our revoke call.
    mm.handle = async (url, init) => {
      if (String(url).endsWith("/users/tokens/revoke")) {
        mm.tokens = mm.tokens.filter((t) => t !== token);
      }
      return realHandle(url, init);
    };
    vi.stubGlobal("fetch", vi.fn(mm.handle));

    expect(await retirePlaintextSessionToken("u-13")).toBe(true);
    expect(mm.users.get("u-13")!.props.ecency_pat).toBeUndefined();
  });

  it("keeps a sealed token another request stored in the meantime", async () => {
    const { retirePlaintextSessionToken, sealSessionToken } = await loadModule();
    mm.addUser("u-14", { ecency_pat: "old" });
    const realHandle = mm.handle;
    let stored = "";
    mm.handle = async (url, init) => {
      const res = await realHandle(url, init);
      // After our revocation, a bootstrap elsewhere stores a fresh token.
      if (String(url).endsWith("/tokens?page=0&per_page=200") && !stored) {
        const fresh = mm.issue("u-14");
        stored = sealSessionToken(fresh.secret, "u-14");
        mm.users.get("u-14")!.props.ecency_pat_sealed = stored;
      }
      return res;
    };
    vi.stubGlobal("fetch", vi.fn(mm.handle));

    await retirePlaintextSessionToken("u-14");

    expect(mm.users.get("u-14")!.props.ecency_pat_sealed).toBe(stored);
  });

  it("does nothing for a user without a plaintext token", async () => {
    const { retirePlaintextSessionToken } = await loadModule();
    mm.addUser("u-15", {});

    expect(await retirePlaintextSessionToken("u-15")).toBe(false);
    expect(mm.calls).toEqual(["GET /users/u-15"]);
  });
});

describe("props writers", () => {
  // Removing the marker without revoking would leave the old token valid and
  // hide the user from the migration, so writers leave it as found.
  it("keep the plaintext marker until retirement has revoked the token", async () => {
    const { addUserLeftChannel, setUserDmPrivacy, retirePlaintextSessionToken } =
      await loadModule();
    const old = mm.issue("u-11");
    mm.addUser("u-11", { ecency_pat: old.secret });

    await addUserLeftChannel("u-11", "hive-1");
    await setUserDmPrivacy("u-11", "followers");

    const props = mm.users.get("u-11")!.props;
    expect(props.ecency_pat).toBe(old.secret);
    expect(props.ecency_left_channels).toBe(JSON.stringify(["hive-1"]));
    expect(props.ecency_dm_privacy).toBe("followers");

    await retirePlaintextSessionToken("u-11");
    expect(mm.active("u-11")).toEqual([]);
  });
});

describe("session token sealing", () => {
  it("round-trips and uses a fresh IV each time", async () => {
    const { sealSessionToken, openSessionToken } = await loadModule();
    const sealed = sealSessionToken("secret-pat", "u-1");

    expect(sealed).not.toContain("secret-pat");
    expect(openSessionToken(sealed, "u-1")).toBe("secret-pat");
    expect(sealSessionToken("secret-pat", "u-1")).not.toBe(sealed);
  });

  // Copying someone's sealed value into your own props must not open it.
  it("opens only for the user it was sealed for", async () => {
    const { sealSessionToken, openSessionToken } = await loadModule();

    expect(openSessionToken(sealSessionToken("secret-pat", "u-1"), "u-2")).toBeNull();
  });

  it("refuses tampered, foreign or missing values", async () => {
    const { sealSessionToken, openSessionToken } = await loadModule();
    const sealed = sealSessionToken("secret-pat", "u-1");
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BA" : "AA");

    expect(openSessionToken(flipped, "u-1")).toBeNull();
    expect(openSessionToken("plain-token", "u-1")).toBeNull();
    expect(openSessionToken(undefined, "u-1")).toBeNull();

    const rotated = await loadModule("rotated-admin-token");
    expect(rotated.openSessionToken(sealed, "u-1")).toBeNull();
  });
});

describe("toPublicChatUser", () => {
  it("drops private fields and keeps the profile", async () => {
    const { toPublicChatUser, toPublicChatUserMap } = await loadModule();
    const user = {
      id: "u",
      username: "gina",
      nickname: "G",
      last_picture_update: 1,
      delete_at: 0,
      email: "g@x",
      props: { anything: "x" },
      notify_props: { email: "true" },
      auth_data: "",
      auth_service: "",
      timezone: {}
    };

    expect(toPublicChatUser(user)).toEqual({
      id: "u",
      username: "gina",
      nickname: "G",
      last_picture_update: 1,
      delete_at: 0
    });
    expect(toPublicChatUserMap({ u: user }).u).not.toHaveProperty("props");
  });
});
