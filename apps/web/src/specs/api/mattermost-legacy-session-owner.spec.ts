import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// #2023 review: a chat cookie set before the owner cookie existed (mm_pat
// without mm_owner) must keep working for the account it belongs to, or the
// navbar badge reads 0 everywhere but /chats after the deploy. The reader
// resolves the token's chat user and honours it when it is the active account's.

let jar: Record<string, string> = {};
const setCookie = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
  cookies: async () => ({
    get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined),
    set: (...args: unknown[]) => setCookie(...args)
  })
}));

const fetchMock = vi.fn();

function meAnswers(username: string | null, status = 200) {
  fetchMock.mockImplementation(async () =>
    status === 200
      ? new Response(JSON.stringify({ id: "u1", username }), { status })
      : new Response(JSON.stringify({ message: "nope" }), { status })
  );
}

async function reader() {
  vi.resetModules();
  vi.stubEnv("MATTERMOST_BASE_URL", "https://mm.test/api/v4");
  const { getMattermostTokenFromCookies } = await import("@/server/mattermost");
  return getMattermostTokenFromCookies;
}

describe("legacy chat session without an owner cookie (#2023)", () => {
  beforeEach(() => {
    jar = {};
    setCookie.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // #2089: the check runs inside an ordinary chat request, and its Set-Cookie
  // lands whenever the answer arrives, possibly after a switch made the cookies
  // another account's. So it writes no cookie at all, and remembers the answer
  // for the token in the process instead.
  it("is the session when the token belongs to the active account, and writes no cookie", async () => {
    jar = { mm_pat: "tok-a", active_user: "Alice" };
    meAnswers("alice");
    const read = await reader();

    expect(await read()).toBe("tok-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://mm.test/api/v4/users/me");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBe("Bearer tok-a");
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("asks chat once per token, not on every request", async () => {
    jar = { mm_pat: "tok-a", active_user: "alice" };
    meAnswers("alice");
    const read = await reader();

    expect(await read()).toBe("tok-a");
    expect(await read()).toBe("tok-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The remembered owner is checked against the account active now.
    jar = { mm_pat: "tok-a", active_user: "bob" };
    expect(await read()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is no session, and writes no cookie, when the token belongs to another account", async () => {
    jar = { mm_pat: "tok-a", active_user: "bob" };
    meAnswers("alice");
    const read = await reader();

    expect(await read()).toBeNull();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("is no session, writes no cookie and asks once, when the token is no longer valid", async () => {
    jar = { mm_pat: "tok-a", active_user: "alice" };
    meAnswers(null, 401);
    const read = await reader();

    expect(await read()).toBeNull();
    expect(await read()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("is no session, writes no cookie, and asks again, when chat is unreachable", async () => {
    jar = { mm_pat: "tok-a", active_user: "alice" };
    const read = await reader();
    meAnswers(null, 502);
    expect(await read()).toBeNull();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await read()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("asks chat nothing for a session that already names its owner, or without an active account", async () => {
    const read = await reader();

    jar = { mm_pat: "tok-a", mm_owner: "alice", active_user: "alice" };
    expect(await read()).toBe("tok-a");

    jar = { mm_pat: "tok-a", mm_owner: "alice", active_user: "bob" };
    expect(await read()).toBeNull();

    jar = { mm_pat: "tok-a" };
    expect(await read()).toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("asks chat once for concurrent requests with the same token", async () => {
    jar = { mm_pat: "tok-a", active_user: "alice" };
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => {
        answer = resolve;
      })
    );
    const read = await reader();

    const first = read();
    const second = read();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    answer(new Response(JSON.stringify({ id: "u1", username: "alice" }), { status: 200 }));

    expect(await first).toBe("tok-a");
    expect(await second).toBe("tok-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks chat again once the remembered answer is ten minutes old", async () => {
    vi.useFakeTimers();
    try {
      jar = { mm_pat: "tok-a", active_user: "alice" };
      meAnswers("alice");
      const read = await reader();

      expect(await read()).toBe("tok-a");
      vi.advanceTimersByTime(9 * 60 * 1000);
      expect(await read()).toBe("tok-a");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(await read()).toBe("tok-a");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("remembers at most 1000 tokens, dropping the oldest", async () => {
    meAnswers("alice");
    const read = await reader();

    for (let i = 0; i <= 1000; i++) {
      jar = { mm_pat: `tok-${i}`, active_user: "alice" };
      await read();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1001);

    // The newest is still known; the first one was dropped and is asked again.
    jar = { mm_pat: "tok-1000", active_user: "alice" };
    await read();
    expect(fetchMock).toHaveBeenCalledTimes(1001);
    jar = { mm_pat: "tok-0", active_user: "alice" };
    await read();
    expect(fetchMock).toHaveBeenCalledTimes(1002);
  });

  it("does not keep the raw token as a cache key", async () => {
    jar = { mm_pat: "tok-secret", active_user: "alice" };
    meAnswers("alice");
    vi.resetModules();
    vi.stubEnv("MATTERMOST_BASE_URL", "https://mm.test/api/v4");
    const mod = await import("@/server/mattermost");
    await mod.getMattermostTokenFromCookies();
    expect([...mod.legacyOwnerCacheKeysForTest()]).not.toContain("tok-secret");
    expect([...mod.legacyOwnerCacheKeysForTest()]).toHaveLength(1);
  });
});
