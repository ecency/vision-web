import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticationState } from "@/core/global-store/modules/authentication-module";
import type { ActiveUser } from "@/entities";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import Cookies from "js-cookie";
import { useGlobalStore } from "@/core/global-store";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ChatAccountInactiveError } from "@/features/chat/chat-session-errors";
import { ChatAccountInactiveNotice } from "@/features/chat/components/chat-account-inactive-notice";
import { createAuthenticationActions } from "@/core/global-store/modules/authentication-module";
import * as ls from "@/utils/local-storage";

vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry: { setUser: vi.fn() } }));

// #2023 micro-review: the chat pages reach this notice only while this tab's
// store still holds an account (a stale tab), and LoginRequired renders
// nothing then. The no-account notice showed no button at all. Real store and
// real active-account shape here, no mocked shared components.
describe("stale tab notice with no account active in the browser", () => {
  beforeEach(() => {
    vi.mocked(useActiveAccount).mockImplementation(
      () => ({ activeUser: { username: "alice" }, username: "alice" }) as unknown as ReturnType<typeof useActiveAccount>
    );
    useGlobalStore.setState({ login: false });
    Cookies.remove("active_user");
  });

  afterEach(() => {
    useGlobalStore.setState({ login: false });
    Cookies.remove("active_user");
  });

  it("offers a login that opens the login dialog, and a Retry", () => {
    const onRetry = vi.fn();
    render(<ChatAccountInactiveNotice error={new ChatAccountInactiveError(undefined)} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "g.login" }));
    expect(useGlobalStore.getState().login).toBe(true);
    expect(screen.getByRole("button", { name: "g.retry" })).toBeInTheDocument();
  });

  it("asks the bootstrap again when the login dialog closes", () => {
    const onRetry = vi.fn();
    render(<ChatAccountInactiveNotice error={new ChatAccountInactiveError(undefined)} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "g.login" }));
    expect(onRetry).not.toHaveBeenCalled();
    act(() => useGlobalStore.getState().setLogin(false));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("logging in again as this tab's account makes it the browser's active account", () => {
    window.localStorage.clear();
    ls.set("user_alice", "x");
    const state: AuthenticationState = { activeUser: { username: "alice" } as ActiveUser };
    const actions = createAuthenticationActions(
      (patch) => Object.assign(state, patch),
      () => state
    );

    // The login dialog ends in setActiveUser for the same account.
    actions.setActiveUser("alice");

    expect(Cookies.get("active_user")).toBe("alice");
  });
});
