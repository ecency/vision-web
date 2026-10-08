import { describe, it, expect, vi, beforeEach } from "vitest";

// ensurePersonalToken now returns BOTH the PAT and the user record it
// already fetched internally. The bootstrap route reads user.props for
// left-channels — folding the read in here saves an extra MM round-trip
// on the hot path, where stacked sequential calls used to push past the
// upstream timeout for users with many community subscriptions.

function resp(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

async function loadModule() {
  process.env.MATTERMOST_BASE_URL = "https://chat.test/api/v4";
  process.env.MATTERMOST_ADMIN_TOKEN = "admin-token";
  process.env.MATTERMOST_TEAM_ID = "team-1";
  vi.resetModules();
  return await import("@/server/mattermost");
}

describe("ensurePersonalToken — returns token + user (parallelization contract)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the stored token alongside the user when the PAT is still valid", async () => {
    const { ensurePersonalToken, sealSessionToken } = await loadModule();
    const userWithPat = {
      id: "u-1",
      username: "alice",
      email: "a",
      delete_at: 0,
      props: {
        ecency_pat_sealed: sealSessionToken("stored-pat"),
        ecency_left_channels: JSON.stringify(["hive-old"])
      }
    };
    fetchMock
      .mockResolvedValueOnce(resp(200, userWithPat)) // GET /users/u-1
      .mockResolvedValueOnce(resp(200, { id: "u-1" })); // GET /users/me (isTokenValid)

    const result = await ensurePersonalToken("u-1");

    expect(result.token).toBe("stored-pat");
    expect(result.user).toEqual(userWithPat);
    // Caller relies on this user to feed getUserLeftChannels without a
    // separate GET /users/{id} — regression-guard the shape.
    expect(result.user.props?.ecency_left_channels).toBe(JSON.stringify(["hive-old"]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates a new token and still returns the user when no PAT is stored", async () => {
    const { ensurePersonalToken } = await loadModule();
    const userWithoutPat = {
      id: "u-2",
      username: "bob",
      email: "b",
      delete_at: 0,
      props: { ecency_left_channels: JSON.stringify(["hive-x"]) }
    };
    fetchMock
      .mockResolvedValueOnce(resp(200, userWithoutPat)) // initial GET in ensurePersonalToken
      .mockResolvedValueOnce(resp(200, { token: "new-pat" })) // POST /users/u-2/tokens
      .mockResolvedValueOnce(resp(200, userWithoutPat)) // GET again (createToken re-reads for prop merge)
      .mockResolvedValueOnce(resp(200, "")); // PUT /users/u-2/patch

    const result = await ensurePersonalToken("u-2");

    expect(result.token).toBe("new-pat");
    // The returned user predates the prop merge, which is intentional: the
    // only consumer (getUserLeftChannels) doesn't read the PAT prop.
    expect(result.user.id).toBe("u-2");
    expect(result.user.props?.ecency_left_channels).toBe(JSON.stringify(["hive-x"]));
  });

  it("creates a new token when the stored PAT is rejected as 401", async () => {
    const { ensurePersonalToken, sealSessionToken } = await loadModule();
    const userWithStalePat = {
      id: "u-3",
      username: "carol",
      email: "c",
      delete_at: 0,
      props: { ecency_pat_sealed: sealSessionToken("stale") }
    };
    fetchMock
      .mockResolvedValueOnce(resp(200, userWithStalePat)) // GET /users/u-3
      .mockResolvedValueOnce(resp(401, { id: "api.auth" })) // isTokenValid → 401
      .mockResolvedValueOnce(resp(200, { token: "fresh-pat" })) // POST tokens
      .mockResolvedValueOnce(resp(200, userWithStalePat)) // createToken re-read
      .mockResolvedValueOnce(resp(200, "")); // PUT patch

    const result = await ensurePersonalToken("u-3");

    expect(result.token).toBe("fresh-pat");
    expect(result.user.id).toBe("u-3");
  });

  it("surfaces non-auth errors from token validation (5xx must not silently re-create)", async () => {
    const { ensurePersonalToken, sealSessionToken } = await loadModule();
    fetchMock
      .mockResolvedValueOnce(resp(200, {
        id: "u-4",
        username: "dave",
        email: "d",
        delete_at: 0,
        props: { ecency_pat_sealed: sealSessionToken("some-pat") }
      }))
      .mockResolvedValueOnce(resp(500, "mm exploded"));

    await expect(ensurePersonalToken("u-4")).rejects.toThrow(/500|mm exploded/);
    // No POST /users/u-4/tokens should fire — a 5xx on isTokenValid is NOT
    // grounds to mint a duplicate token.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("session token storage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  function patchedProps() {
    const patch = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/patch"));
    return JSON.parse(patch![1].body).props as Record<string, string>;
  }

  it("round-trips a sealed token and never stores it as plaintext", async () => {
    const { sealSessionToken, openSessionToken } = await loadModule();
    const sealed = sealSessionToken("secret-pat");

    expect(sealed).not.toContain("secret-pat");
    expect(openSessionToken(sealed)).toBe("secret-pat");
    expect(sealSessionToken("secret-pat")).not.toBe(sealed); // fresh IV each time
  });

  it("refuses tampered, foreign or missing values", async () => {
    const { sealSessionToken, openSessionToken } = await loadModule();
    const sealed = sealSessionToken("secret-pat");
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BA" : "AA");

    expect(openSessionToken(flipped)).toBeNull();
    expect(openSessionToken("plain-token")).toBeNull();
    expect(openSessionToken(undefined)).toBeNull();

    process.env.MATTERMOST_ADMIN_TOKEN = "rotated-admin-token";
    vi.resetModules();
    const other = await import("@/server/mattermost");
    expect(other.openSessionToken(sealed)).toBeNull();
  });

  it("stores a new token sealed", async () => {
    const { ensurePersonalToken, openSessionToken } = await loadModule();
    const user = { id: "u-5", username: "erin", email: "e", delete_at: 0, props: {} };
    fetchMock
      .mockResolvedValueOnce(resp(200, user))
      .mockResolvedValueOnce(resp(200, { token: "new-pat" }))
      .mockResolvedValueOnce(resp(200, user))
      .mockResolvedValueOnce(resp(200, ""));

    await ensurePersonalToken("u-5");

    const props = patchedProps();
    expect(JSON.stringify(props)).not.toContain("new-pat");
    expect(openSessionToken(props.ecency_pat_sealed)).toBe("new-pat");
  });

  it("retires a plaintext token: revokes issued tokens, drops it and issues a sealed one", async () => {
    const { ensurePersonalToken, openSessionToken } = await loadModule();
    const legacy = {
      id: "u-6",
      username: "finn",
      email: "f",
      delete_at: 0,
      props: { ecency_pat: "old-pat", ecency_dm_privacy: "followers" }
    };
    const cleaned = { ...legacy, props: { ecency_dm_privacy: "followers" } };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url).replace("https://chat.test/api/v4", "");
      if (path === "/users/u-6") {
        const patched = fetchMock.mock.calls.some(([u]) => String(u).endsWith("/patch"));
        return Promise.resolve(resp(200, patched ? cleaned : legacy));
      }
      if (path.startsWith("/users/u-6/tokens?")) {
        return Promise.resolve(
          resp(200, [
            { id: "t1", description: "ecency-auto", is_active: true },
            { id: "t2", description: "ecency-auto", is_active: false },
            { id: "t3", description: "someone-else", is_active: true }
          ])
        );
      }
      if (path === "/users/tokens/revoke") return Promise.resolve(resp(200, { status: "OK" }));
      if (path === "/users/u-6/tokens" && init?.method === "POST") {
        return Promise.resolve(resp(200, { token: "fresh-pat" }));
      }
      if (path === "/users/u-6/patch") return Promise.resolve(resp(200, ""));
      return Promise.reject(new Error(`unexpected ${path}`));
    });

    const result = await ensurePersonalToken("u-6");

    expect(result.token).toBe("fresh-pat");
    const revoked = fetchMock.mock.calls
      .filter(([u]) => String(u).endsWith("/users/tokens/revoke"))
      .map(([, init]) => JSON.parse(init.body).token_id);
    expect(revoked).toEqual(["t1"]);

    const patches = fetchMock.mock.calls
      .filter(([u]) => String(u).endsWith("/patch"))
      .map(([, init]) => JSON.parse(init.body).props);
    for (const props of patches) expect(props.ecency_pat).toBeUndefined();
    const last = patches[patches.length - 1];
    expect(openSessionToken(last.ecency_pat_sealed)).toBe("fresh-pat");
    expect(last.ecency_dm_privacy).toBe("followers");
    // The old plaintext token is never validated or reused.
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/users/me"))).toBe(false);
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
