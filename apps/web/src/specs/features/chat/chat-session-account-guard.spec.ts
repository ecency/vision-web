import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Cookies from "js-cookie";
import { useGlobalStore } from "@/core/global-store";
import type { ActiveUser } from "@/entities";
import {
  CHAT_ACCOUNT_HEADER,
  chatSessionFetch,
  chatSessionSettled,
  resetChatSession
} from "@/features/chat/chat-session";
import { ChatAccountInactiveError } from "@/features/chat/chat-session-errors";

// #2087 review: two follow-ups to the per-account chat session (#2023).
// 1. Every outstanding reset holds chat requests back, and a reset that times
//    out is aborted, so a late expiry cannot wipe a newer account's session.
// 2. A tab whose account is no longer the browser's active one sends nothing,
//    and every chat request names its account so the server can refuse a
//    session issued to another one.

let headerValues: Record<string, string> = {};
let jar: Record<string, string> = {};

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues[name.toLowerCase()] ?? null }),
  cookies: async () => ({
    get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined),
    set: () => undefined
  })
}));

const SESSION_URL = "/api/mattermost/session";

function ok() {
  return new Response("{}", { status: 200 });
}

function setTabAccount(username: string | null) {
  useGlobalStore.setState({
    activeUser: username ? ({ username } as ActiveUser) : null
  });
}

describe("chat session resets in quick succession (#2087 review)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("holds chat requests until every reset settles, not only the newest", async () => {
    const finishers: Array<() => void> = [];
    fetchMock.mockImplementation((input: string) => {
      if (input === SESSION_URL) {
        return new Promise<Response>((resolve) => finishers.push(() => resolve(ok())));
      }
      return Promise.resolve(ok());
    });

    // A -> B, then B -> A: two DELETEs in flight.
    void resetChatSession();
    void resetChatSession();
    expect(finishers).toHaveLength(2);

    let settled = false;
    const wait = chatSessionSettled().then(() => {
      settled = true;
    });

    // The second DELETE answers first.
    finishers[1]();
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);

    finishers[0]();
    await wait;
    expect(settled).toBe(true);
  });

  it("aborts a reset that outlives its wait, so its expiry cannot land later", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      if (input === SESSION_URL && init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => undefined);
    });

    void resetChatSession();
    const wait = chatSessionSettled();
    await vi.advanceTimersByTimeAsync(10_000);
    await wait;

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
  });
});

describe("chat requests from a tab whose account is not the active one (#2087 review)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Cookies.remove("active_user");
    setTabAccount(null);
  });

  it("sends nothing when another tab made another account active", async () => {
    setTabAccount("alice");
    Cookies.set("active_user", "bob");

    await expect(
      chatSessionFetch("/api/mattermost/channels/c1/posts", { method: "POST", body: "{}" })
    ).rejects.toBeInstanceOf(ChatAccountInactiveError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when another tab logged out", async () => {
    setTabAccount("alice");

    const error = await chatSessionFetch("/api/mattermost/channels").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ChatAccountInactiveError);
    expect((error as ChatAccountInactiveError).reason).toBe("no-account");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names this tab's account on every chat request", async () => {
    setTabAccount("alice");
    Cookies.set("active_user", "alice");

    await chatSessionFetch("/api/mattermost/channels/c1/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const sent = new Headers(init.headers);
    expect(sent.get(CHAT_ACCOUNT_HEADER)).toBe("alice");
    expect(sent.get("Content-Type")).toBe("application/json");
    expect(init.method).toBe("POST");
  });

  it("a tab without an account sends no account header", async () => {
    await chatSessionFetch("/api/mattermost/channels/unreads");

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(new Headers(init?.headers).has(CHAT_ACCOUNT_HEADER)).toBe(false);
  });
});

describe("server token reader and the request's account (#2087 review)", () => {
  beforeEach(() => {
    headerValues = {};
    jar = { mm_pat: "tok-bob", mm_owner: "bob", active_user: "bob" };
  });

  async function reader() {
    vi.resetModules();
    const { getMattermostTokenFromCookies } = await import("@/server/mattermost");
    return getMattermostTokenFromCookies;
  }

  it("refuses the session when the request names another account (stale tab)", async () => {
    headerValues["x-chat-account"] = "alice";
    expect(await (await reader())()).toBeNull();
  });

  it("honours the session when the request names its owner", async () => {
    headerValues["x-chat-account"] = "Bob";
    expect(await (await reader())()).toBe("tok-bob");
  });

  it("is unchanged for requests without the header", async () => {
    expect(await (await reader())()).toBe("tok-bob");
  });

  it("is unchanged for mobile clients sending their token", async () => {
    headerValues["x-mm-token"] = "tok-mobile";
    headerValues["x-chat-account"] = "alice";
    expect(await (await reader())()).toBe("tok-mobile");
  });
});
