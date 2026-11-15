import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { setupModalContainers } from "@/specs/test-utils";
import { ChatAccountInactiveError } from "@/features/chat/chat-session-errors";

// #2023 screenshot pass: the stale tab refusal printed its English error
// text ("Another account is active in this browser") to users, left-aligned
// above a centred Retry. It is now a translated, centred message chosen by
// the error class and its reason, never by the message text.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => "/chats",
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));
vi.mock("@/api/queries", () => ({ useHydrated: () => true }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "me" } })
}));
vi.mock("@/features/shared", () => ({ LoginRequired: () => <div>login-required</div> }));
vi.mock("@/features/chat/mattermost-channel-view", () => ({ MattermostChannelView: () => null }));

let bootstrapError: Error | null = null;
const idle = { mutate: vi.fn(), reset: vi.fn(), error: null, isPending: false };
vi.mock("@/features/chat/mattermost-api", () => ({
  useMattermostBootstrap: () => ({
    data: undefined,
    isLoading: false,
    error: bootstrapError,
    refetch: vi.fn()
  }),
  useMattermostChannels: () => ({ data: undefined, isLoading: false, error: null }),
  useMattermostChannelSearch: () => ({ data: { channels: [] }, isFetching: false, error: null }),
  useMattermostMessageSearch: () => ({ data: { posts: [] }, isFetching: false, error: null }),
  useMattermostUserSearch: () => ({ data: { users: [] }, isFetching: false, error: null }),
  useMattermostDirectChannel: () => idle,
  useMattermostJoinChannel: () => idle,
  useMattermostFavoriteChannel: () => idle,
  useMattermostLeaveChannel: () => idle,
  useMattermostMuteChannel: () => idle,
  useMattermostMarkChannelViewed: () => idle,
  useMattermostUnread: () => ({ data: undefined })
}));

import { ChatsClient } from "@/app/chats/_components/chats-client";
import { ChatsPageClient } from "@/app/chats/_components/chats-page-client";

describe.each([
  ["chats list", () => <ChatsClient />],
  ["chat page", () => <ChatsPageClient />]
])("%s with a stale tab bootstrap refusal", (_name, view) => {
  beforeEach(() => {
    setupModalContainers();
  });

  it("shows the translated other-account message, centred, not the error text", () => {
    bootstrapError = new ChatAccountInactiveError("bob");
    render(view());

    const message = screen.getByText("chat.other-account-active");
    expect(message.className).toContain("text-center");
    expect(screen.queryByText(/Another account is active/)).not.toBeInTheDocument();
    // Not the session expired screen, which asks for a new login.
    expect(screen.queryByText("login-required")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "g.retry" });
    expect(retry).toHaveAttribute("type", "button");
    expect(retry.className).toContain("focus-visible:ring-2");
    expect(screen.getByRole("status")).toContainElement(message);
  });

  it("says no account is active and offers the login, not a Retry that cannot work", () => {
    bootstrapError = new ChatAccountInactiveError(undefined);
    render(view());

    expect(screen.getByText("chat.no-account-active")).toBeInTheDocument();
    expect(screen.queryByText(/No account is active/)).not.toBeInTheDocument();
    expect(screen.getByText("login-required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "g.retry" })).not.toBeInTheDocument();
  });

  it("still shows the session expired screen for an auth error", () => {
    bootstrapError = new Error("Authentication required - please log in again");
    render(view());

    expect(screen.getByText("login-required")).toBeInTheDocument();
    expect(screen.queryByText("chat.other-account-active")).not.toBeInTheDocument();
  });

  it("centres a generic bootstrap error above its Retry", () => {
    bootstrapError = new Error("Chat server error (502)");
    render(view());

    expect(screen.getByText(/Chat server error \(502\)/).className).toContain("text-center");
  });
});
