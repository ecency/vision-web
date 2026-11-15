import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthenticationActions } from "@/core/global-store/modules/authentication-module";
import { chatApiFetch, resetChatApiGuard } from "@/features/chat/chat-api-guard";
import * as ls from "@/utils/local-storage";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useMattermostBootstrap,
  useMattermostChannels,
  useMattermostMarkChannelViewed
} from "@/features/chat/mattermost-api";
import { MattermostWebSocket } from "@/features/chat/mattermost-websocket";
import { getQueryClient } from "@/core/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { waitFor } from "@testing-library/react";

vi.mock("@/core/sentry/lazy-sentry", () => ({
  sentry: { setUser: vi.fn() }
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  getRefreshToken: vi.fn(() => "")
}));

const SESSION_URL = "/api/mattermost/session";

function actionsFor(currentUsername: string | null) {
  const state = { activeUser: currentUsername ? ({ username: currentUsername } as any) : null };
  return createAuthenticationActions(
    (patch) => Object.assign(state, patch),
    () => state as any
  );
}

function ok() {
  return { status: 200, ok: true, headers: new Headers() } as Response;
}

function urlOf(call: unknown[]) {
  return String(call[0]);
}

describe("chat session on logout and account switch (#2023)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetChatApiGuard();
    window.localStorage.clear();
    ls.set("user_alice", "x");
    ls.set("user_bob", "x");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("expires the chat session cookie when the account logs out", async () => {
    fetchMock.mockResolvedValue(ok());

    actionsFor("alice").setActiveUser(null);

    const resets = fetchMock.mock.calls.filter((c) => urlOf(c) === SESSION_URL);
    expect(resets).toHaveLength(1);
    expect((resets[0][1] as RequestInit).method).toBe("DELETE");
  });

  it("does not drop the session when a page load restores the persisted account", () => {
    fetchMock.mockResolvedValue(ok());

    actionsFor(null).setActiveUser("alice");

    expect(fetchMock.mock.calls.filter((c) => urlOf(c) === SESSION_URL)).toHaveLength(0);
  });

  it("sends no unread request with the previous account's session after a switch", async () => {
    const order: string[] = [];
    let finishReset: () => void = () => {};
    fetchMock.mockImplementation((input: string) => {
      if (input === SESSION_URL) {
        return new Promise<Response>((resolve) => {
          finishReset = () => {
            order.push("session-expired");
            resolve(ok());
          };
        });
      }
      order.push(input);
      return Promise.resolve(ok());
    });

    actionsFor("alice").setActiveUser("bob");

    // The navbar badge refetches under bob's query key straight away.
    const unread = chatApiFetch("/api/mattermost/channels/unreads");
    await new Promise((r) => setTimeout(r, 0));

    // While alice's cookie is still set, nothing may reach the chat API.
    expect(order).not.toContain("/api/mattermost/channels/unreads");

    finishReset();
    await unread;

    expect(order).toEqual(["session-expired", "/api/mattermost/channels/unreads"]);
  });

  it("still lets chat calls through when the reset request fails", async () => {
    fetchMock.mockImplementation((input: string) =>
      input === SESSION_URL ? Promise.reject(new TypeError("network")) : Promise.resolve(ok())
    );

    actionsFor("alice").setActiveUser("bob");

    await expect(chatApiFetch("/api/mattermost/channels/unreads")).resolves.toBeTruthy();
  });
});

describe("DELETE /api/mattermost/session", () => {
  it("expires the httpOnly chat cookie", async () => {
    const { DELETE } = await import("@/app/api/mattermost/session/route");
    const res = await DELETE();
    const setCookie = res.headers.get("set-cookie") ?? "";

    expect(res.status).toBe(200);
    expect(setCookie).toMatch(/mm_pat=;/);
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie).toContain("Path=/");
  });

  it("expires the session owner cookie too", async () => {
    const { DELETE } = await import("@/app/api/mattermost/session/route");
    const res = await DELETE();
    const setCookie = res.headers.get("set-cookie") ?? "";

    expect(setCookie).toMatch(/mm_owner=;/);
  });
});

// #2023 review: when the expiry request fails or times out, or another tab or
// a late Set-Cookie puts the previous account's cookie back, the server must
// still not answer chat calls for the new account as the previous one.
describe("chat session bound to the active account (#2023)", () => {
  const jar = (cookies: Record<string, string>) => (name: string) => cookies[name];

  it("is the session when its owner is the active account", async () => {
    const { mattermostCookieToken } = await import("@/server/mattermost-session-cookie");
    expect(
      mattermostCookieToken(jar({ mm_pat: "tok-a", mm_owner: "alice", active_user: "alice" }))
    ).toBe("tok-a");
    // Case and URI encoding of the client-set cookie do not matter.
    expect(
      mattermostCookieToken(jar({ mm_pat: "tok-a", mm_owner: "alice", active_user: "Alice" }))
    ).toBe("tok-a");
  });

  it("is no session when another account is active", async () => {
    const { mattermostCookieToken } = await import("@/server/mattermost-session-cookie");
    expect(
      mattermostCookieToken(jar({ mm_pat: "tok-a", mm_owner: "alice", active_user: "bob" }))
    ).toBeNull();
  });

  it("is no session after a logout, or without an owner", async () => {
    const { mattermostCookieToken } = await import("@/server/mattermost-session-cookie");
    expect(mattermostCookieToken(jar({ mm_pat: "tok-a", mm_owner: "alice" }))).toBeNull();
    expect(mattermostCookieToken(jar({ mm_pat: "tok-a", active_user: "alice" }))).toBeNull();
    expect(mattermostCookieToken(jar({ mm_owner: "alice", active_user: "alice" }))).toBeNull();
  });

  it("the API routes' token reader honours the binding", async () => {
    const source = readFileSync(resolve(__dirname, "../../../server/mattermost.ts"), "utf8");
    const reader = source.slice(source.indexOf("export async function getMattermostTokenFromCookies"));
    expect(reader.slice(0, reader.indexOf("\n}\n"))).toContain("mattermostCookieToken(");
    const ws = readFileSync(
      resolve(__dirname, "../../../app/api/mattermost/websocket/route.ts"),
      "utf8"
    );
    expect(ws).toContain("mattermostCookieToken(");
    expect(ws).not.toMatch(/cookies\.get\(MATTERMOST_TOKEN_COOKIE\)/);
  });

  it("the bootstrap names the owner next to the session cookie", async () => {
    const { NextResponse } = await import("next/server");
    const { withMattermostTokenCookie } = await import("@/server/mattermost");
    const res = withMattermostTokenCookie(NextResponse.json({ ok: true }), "tok-a", "Alice");
    const setCookie = res.headers.get("set-cookie") ?? "";

    expect(setCookie).toMatch(/mm_pat=tok-a/);
    expect(setCookie).toMatch(/mm_owner=alice/);
    expect(setCookie.toLowerCase().match(/httponly/g)).toHaveLength(2);
  });
});

describe("chat page requests after a switch (#2023 follow-up)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetChatApiGuard();
    window.localStorage.clear();
    ls.set("user_alice", "x");
    ls.set("user_bob", "x");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks a channel viewed only after the previous account's session is expired", async () => {
    const order: string[] = [];
    let finishReset: () => void = () => {};
    fetchMock.mockImplementation((input: string) => {
      if (input === SESSION_URL) {
        return new Promise<Response>((resolve) => {
          finishReset = () => {
            order.push("session-expired");
            resolve(ok());
          };
        });
      }
      order.push(input);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useMattermostMarkChannelViewed(), {
      wrapper: ({ children }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)
    });

    actionsFor("alice").setActiveUser("bob");
    const viewed = result.current.mutateAsync("ch1");
    await new Promise((r) => setTimeout(r, 0));

    expect(order).not.toContain("/api/mattermost/channels/ch1/view");

    finishReset();
    await viewed;

    expect(order).toEqual(["session-expired", "/api/mattermost/channels/ch1/view"]);
  });

  it("sends no chat API request from mattermost-api.ts around the reset wait", () => {
    // Every request in the chat page's API module must wait for a pending
    // session reset. A bare fetch( there would skip it.
    const source = readFileSync(
      resolve(__dirname, "../../../features/chat/mattermost-api.ts"),
      "utf8"
    );
    expect(source.match(/[^A-Za-z.]fetch\(/g) ?? []).toEqual([]);
  });
});

// #2023 review: switching A -> B -> A within the bootstrap's 5 minute
// staleTime found A's cached bootstrap still fresh. Nothing set A's chat cookie
// again after the second switch expired it, so every chat call answered 401.
describe("chat client state on an account switch (#2023)", () => {
  const fetchMock = vi.fn();
  let user = "alice";

  beforeEach(() => {
    resetChatApiGuard();
    window.localStorage.clear();
    ls.set("user_alice", "x");
    ls.set("user_bob", "x");
    getQueryClient().clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: string) =>
      input === SESSION_URL
        ? ok()
        : new Response(JSON.stringify({ ok: true, userId: "u1", channelId: "c1" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(useActiveAccount).mockImplementation(
      () => ({ activeUser: { username: user }, username: user }) as any
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getQueryClient().clear();
  });

  function calls() {
    return fetchMock.mock.calls.map(([input, init]) => {
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      const body = (init as RequestInit | undefined)?.body;
      const who = body ? ` ${JSON.parse(String(body)).username}` : "";
      return `${method} ${input}${who}`;
    });
  }

  it("bootstraps A again after A -> B -> A", async () => {
    const queryClient = getQueryClient();
    const { rerender } = renderHook(() => useMattermostBootstrap(), {
      wrapper: ({ children }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)
    });
    await waitFor(() => expect(calls()).toHaveLength(1));

    actionsFor("alice").setActiveUser("bob");
    user = "bob";
    rerender();
    await waitFor(() => expect(calls()).toHaveLength(3));

    actionsFor("bob").setActiveUser("alice");
    user = "alice";
    rerender();
    await waitFor(() => expect(calls()).toHaveLength(5));

    expect(calls()).toEqual([
      "POST /api/mattermost/bootstrap alice",
      `DELETE ${SESSION_URL}`,
      "POST /api/mattermost/bootstrap bob",
      `DELETE ${SESSION_URL}`,
      "POST /api/mattermost/bootstrap alice"
    ]);
  });

  it("sends no bootstrap for B after a fast A -> B -> A (#2023 review)", async () => {
    const pending: Array<() => void> = [];
    fetchMock.mockImplementation((input: string) =>
      input === SESSION_URL
        ? new Promise<Response>((resolve) => pending.push(() => resolve(ok())))
        : Promise.resolve(
            new Response(JSON.stringify({ ok: true, userId: "u1", channelId: "c1" }), { status: 200 })
          )
    );
    const queryClient = getQueryClient();

    actionsFor("alice").setActiveUser("bob");
    user = "bob";
    const { rerender } = renderHook(() => useMattermostBootstrap(), {
      wrapper: ({ children }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)
    });
    // B's bootstrap is now waiting for the A -> B reset.
    await new Promise((r) => setTimeout(r, 0));

    actionsFor("bob").setActiveUser("alice");
    user = "alice";
    rerender();
    await new Promise((r) => setTimeout(r, 0));

    pending.forEach((finish) => finish());
    await waitFor(() =>
      expect(calls().filter((c) => c.startsWith("POST /api/mattermost/bootstrap"))).not.toHaveLength(0)
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(calls().filter((c) => c.startsWith("POST /api/mattermost/bootstrap"))).toEqual([
      "POST /api/mattermost/bootstrap alice"
    ]);
  });

  it("drops every cached chat query and keeps the rest", () => {
    const queryClient = getQueryClient();
    queryClient.setQueryData(["mattermost-bootstrap", "alice", undefined], { ok: true });
    queryClient.setQueryData(["mattermost-unread", "alice"], { total: 1 });
    queryClient.setQueryData(["mattermost-posts-infinite", "c1"], { pages: [] });
    queryClient.setQueryData(["mattermost", "dm-privacy"], "all");
    queryClient.setQueryData(["posts", "entry", "/@a/p"], { author: "a" });

    actionsFor("alice").setActiveUser("bob");

    expect(queryClient.getQueryData(["mattermost-bootstrap", "alice", undefined])).toBeUndefined();
    expect(queryClient.getQueryData(["mattermost-unread", "alice"])).toBeUndefined();
    expect(queryClient.getQueryData(["mattermost-posts-infinite", "c1"])).toBeUndefined();
    expect(queryClient.getQueryData(["mattermost", "dm-privacy"])).toBeUndefined();
    expect(queryClient.getQueryData(["posts", "entry", "/@a/p"])).toEqual({ author: "a" });
  });

  it("closes the open chat websocket", () => {
    const socket = new MattermostWebSocket();
    const disconnect = vi.spyOn(socket, "disconnect");

    actionsFor("alice").setActiveUser(null);

    expect(disconnect).toHaveBeenCalled();
  });

  it("keeps the websocket out of the module graph of every page (#2023 review)", () => {
    // chat-session is imported by the global store's authentication module,
    // so a static import of the websocket here would ship it on every page.
    const source = readFileSync(resolve(__dirname, "../../../features/chat/chat-session.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["']\.\/mattermost-websocket["']/);
    expect(source).not.toMatch(/import\(\s*["']\.\/mattermost-websocket["']/);
  });

  it("asks the bootstrap again when a chat call answers 401", async () => {
    const queryClient = getQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));

    await chatApiFetch("/api/mattermost/channels/unreads");

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mattermost-bootstrap"] });
  });

  it("recovers the channel list once the bootstrap after a 401 succeeds (#2023 review)", async () => {
    const queryClient = getQueryClient();
    const defaults = queryClient.getDefaultOptions();
    queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retryDelay: 5 } });
    // The bootstrap is cached and fresh, but the chat cookie is gone.
    queryClient.setQueryData(["mattermost-bootstrap", "alice", undefined], {
      ok: true,
      userId: "u1",
      channelId: "c1"
    });
    let cookieSet = false;
    fetchMock.mockImplementation(async (input: string) => {
      if (input === "/api/mattermost/bootstrap") {
        // The new cookie lands with the bootstrap response, after the
        // channel list's single retry has already failed.
        await new Promise((r) => setTimeout(r, 50));
        cookieSet = true;
        return new Response(JSON.stringify({ ok: true, userId: "u1", channelId: "c1" }), {
          status: 200
        });
      }
      if (input === "/api/mattermost/channels") {
        return cookieSet
          ? new Response(JSON.stringify({ channels: [] }), { status: 200 })
          : new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      }
      return ok();
    });

    try {
      const { result } = renderHook(
        () => ({ bootstrap: useMattermostBootstrap(), channels: useMattermostChannels(true) }),
        {
          wrapper: ({ children }) =>
            React.createElement(QueryClientProvider, { client: queryClient }, children)
        }
      );

      await waitFor(() => expect(cookieSet).toBe(true));
      await waitFor(() => expect(result.current.channels.isSuccess).toBe(true), { timeout: 2000 });
      expect(result.current.channels.data).toEqual({ channels: [] });
    } finally {
      queryClient.setDefaultOptions(defaults);
    }
  });
});

// #2023 review: AbortSignal.timeout is missing on older Safari, and a sync
// throw from the reset must not abort the logout.
describe("chat session reset robustness (#2023)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("settles a hung reset after its timeout without AbortSignal.timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("AbortSignal", { ...AbortSignal, timeout: undefined });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const { resetChatSession, chatSessionSettled } = await import("@/features/chat/chat-session");

    void resetChatSession();
    let settled = false;
    void chatSessionSettled().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(settled).toBe(true);
  });

  it("logs out even when fetch throws synchronously", () => {
    window.localStorage.clear();
    ls.set("user_alice", "x");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new TypeError("sync");
      })
    );
    const state = { activeUser: { username: "alice" } as any };
    const actions = createAuthenticationActions(
      (patch) => Object.assign(state, patch),
      () => state as any
    );

    expect(() => actions.setActiveUser(null)).not.toThrow();
    expect(state.activeUser).toBeNull();
  });
});
