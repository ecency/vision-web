import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthenticationActions } from "@/core/global-store/modules/authentication-module";
import { chatApiFetch, resetChatApiGuard } from "@/features/chat/chat-api-guard";
import * as ls from "@/utils/local-storage";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMattermostMarkChannelViewed } from "@/features/chat/mattermost-api";

vi.mock("@/core/sentry/lazy-sentry", () => ({
  sentry: { setUser: vi.fn() }
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
