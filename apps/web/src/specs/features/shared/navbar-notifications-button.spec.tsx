import { vi } from "vitest";
import React from "react";
import { act, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";

// The unread count options as the SDK ships them after vision-web#1851: a placeholder 0
// while loading, then the server's count. Mocked here because web specs load the
// committed SDK build; the SDK's own spec covers the options themselves.
const unread = vi.hoisted(() => ({ fetch: vi.fn<() => Promise<number>>() }));
vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ecency/sdk")>()),
  getNotificationsUnreadCountQueryOptions: (username?: string) => ({
    queryKey: ["notifications", "unread", username],
    queryFn: () => unread.fetch(),
    placeholderData: 0
  })
}));
vi.mock("@/core/hooks", () => ({
  useActiveAccount: () => ({ activeUser: { username: "tester" } })
}));

import { NavbarNotificationsButton } from "@/features/shared/navbar/navbar-notifications-button";

const UNREAD_KEY = ["notifications", "unread", "tester"];

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const bell = (name: string) => screen.getByRole("button", { name });
const isRinging = (button: HTMLElement) => button.querySelector(".animate-bell-ring") !== null;

describe("NavbarNotificationsButton", () => {
  beforeEach(() => {
    unread.fetch.mockReset();
  });

  it("does not ring for the count loaded with the page", async () => {
    const first = deferred<number>();
    unread.fetch.mockReturnValue(first.promise);

    renderWithQueryClient(<NavbarNotificationsButton />);
    // The placeholder 0 is on screen while the request runs: no badge.
    expect(bell("user-nav.notifications")).toBeInTheDocument();

    await act(async () => first.resolve(5));

    const button = await waitFor(() => bell("user-nav.notifications-unread"));
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(isRinging(button)).toBe(false);
  });

  it("rings when the count rises while the page is open", async () => {
    unread.fetch.mockResolvedValue(5);
    const { queryClient } = renderWithQueryClient(<NavbarNotificationsButton />);
    const button = await waitFor(() => bell("user-nav.notifications-unread"));
    expect(isRinging(button)).toBe(false);

    act(() => {
      queryClient.setQueryData(UNREAD_KEY, 6);
    });

    expect(await screen.findByText("6")).toBeInTheDocument();
    expect(isRinging(bell("user-nav.notifications-unread"))).toBe(true);
  });

  it("shows no badge before the first count arrives", () => {
    unread.fetch.mockReturnValue(deferred<number>().promise);
    renderWithQueryClient(<NavbarNotificationsButton />);

    expect(bell("user-nav.notifications")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
