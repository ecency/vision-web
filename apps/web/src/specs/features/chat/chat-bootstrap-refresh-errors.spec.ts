import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import Cookies from "js-cookie";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/core/react-query";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { CHAT_BOOTSTRAP_QUERY_PREFIX, resetChatSession } from "@/features/chat/chat-session";

const hsTokenRenew = vi.hoisted(() => vi.fn());

vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hsTokenRenew
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "access"),
  getRefreshToken: vi.fn(() => "refresh")
}));

import { useMattermostBootstrap } from "@/features/chat/mattermost-api";

// #2023 review: the token refresh path's catch turned the stale tab refusal
// and the session-changed bail into "Authentication required - please log in
// again", which shows the session expired screen and asks for a new login.
describe("bootstrap token refresh keeps the session guard errors", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    getQueryClient().clear();
    fetchMock.mockReset();
    hsTokenRenew.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // The first bootstrap answers 401, so the hook refreshes the tokens.
    fetchMock.mockImplementation(async (input: string) =>
      input === "/api/mattermost/bootstrap"
        ? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
        : new Response("{}", { status: 200 })
    );
    vi.mocked(useActiveAccount).mockImplementation(
      () => ({ activeUser: { username: "alice" }, username: "alice" }) as unknown as ReturnType<typeof useActiveAccount>
    );
    Cookies.set("active_user", "alice");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Cookies.remove("active_user");
    getQueryClient().clear();
  });

  function mount() {
    const queryClient = getQueryClient();
    return renderHook(() => useMattermostBootstrap(), {
      wrapper: ({ children }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children)
    });
  }

  const renewed = { username: "alice", access_token: "a2", refresh_token: "r2", expires_in: 1 };

  it("another tab switching account during the refresh is not a lost login", async () => {
    hsTokenRenew.mockImplementation(async () => {
      Cookies.set("active_user", "bob");
      return renewed;
    });
    const { result } = mount();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.name).toBe("ChatAccountInactiveError");
    expect(result.current.error?.message).toBe("Another account is active in this browser");
  });

  it("a logout in another tab during the refresh says no account is active", async () => {
    hsTokenRenew.mockImplementation(async () => {
      Cookies.remove("active_user");
      return renewed;
    });
    const { result } = mount();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.name).toBe("ChatAccountInactiveError");
    expect(result.current.error?.message).toBe("No account is active in this browser");
  });

  it("a session reset during the refresh is not reported as a lost login", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    hsTokenRenew.mockImplementation(async () => {
      // An account switch away and back in this tab, while refreshing.
      fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
      void resetChatSession();
      return renewed;
    });
    // A fresh cached bootstrap, so mounting runs nothing: the reset removes
    // the query, so its own rejection is not observable through the hook.
    // Run its query function directly instead.
    const queryKey = [...CHAT_BOOTSTRAP_QUERY_PREFIX, "alice", undefined];
    getQueryClient().setQueryData(queryKey, { ok: true, userId: "u1", channelId: "c1" });
    mount();
    const queryFn = getQueryClient().getQueryCache().find({ queryKey })?.options.queryFn as (
      context: unknown
    ) => Promise<unknown>;

    const bailed = await queryFn({
      queryKey,
      signal: new AbortController().signal,
      meta: undefined,
      client: getQueryClient()
    }).catch((error: unknown) => error);

    expect(bailed).toBeInstanceOf(Error);
    expect((bailed as Error).name).toBe("ChatSessionChangedError");
    expect((bailed as Error).message).not.toMatch(/log in again/);
    expect(consoleError).not.toHaveBeenCalledWith("Failed to refresh tokens:", expect.anything());
  });
});
