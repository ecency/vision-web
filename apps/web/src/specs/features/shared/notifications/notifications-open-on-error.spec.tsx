import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useGlobalStore } from "@/core/global-store";

// Issue #2022: the bell must open the panel whatever happens to the
// notifications request, and a failed request must say so with a retry
// instead of leaving the panel blank.
const api = vi.hoisted(() => ({
  list: vi.fn<() => Promise<unknown[]>>(),
  unread: vi.fn<() => Promise<number>>()
}));

vi.mock("@ecency/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecency/sdk")>();
  // The SDK's own paging rule, so the empty-list case runs against the real one.
  const sdkGetNextPageParam = actual.getNotificationsInfiniteQueryOptions("tester", "token")
    .getNextPageParam as (lastPage: unknown) => unknown;
  return {
  ...actual,
  getNotificationsUnreadCountQueryOptions: (username?: string) => ({
    queryKey: ["notifications", "unread", username],
    queryFn: () => api.unread(),
    placeholderData: 0
  }),
  getNotificationsInfiniteQueryOptions: (username?: string, _code?: string, filter?: string) => ({
    queryKey: ["notifications", "list", username, filter],
    queryFn: () => api.list(),
    initialPageParam: "",
    getNextPageParam: sdkGetNextPageParam,
    enabled: !!username
  })
  };
});

const activeAccount = { activeUser: { username: "tester" } };
vi.mock("@/core/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/hooks")>()),
  useActiveAccount: () => activeAccount
}));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => activeAccount
}));
vi.mock("@/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils")>()),
  getAccessToken: () => "token"
}));

// The header actions and mark-as-read wiring pull in the broadcast stack and
// have nothing to do with opening the panel.
vi.mock("@/features/shared/notifications/notifications-actions", () => ({
  NotificationsActions: () => null
}));
vi.mock("@/features/shared/notifications/hooks", () => ({
  useMarkNotificationsList: () => ({ mutateAsync: vi.fn(), isPending: false })
}));

import { NavbarNotificationsButton } from "@/features/shared/navbar/navbar-notifications-button";
import { NotificationsDialog } from "@/features/shared/notifications";

function renderBellAndPanel() {
  return renderWithQueryClient(
    <>
      <NavbarNotificationsButton />
      <NotificationsDialog />
    </>
  );
}

describe("notifications bell (#2022)", () => {
  beforeEach(() => {
    api.list.mockReset();
    api.unread.mockReset();
    api.unread.mockResolvedValue(3);
    useGlobalStore.setState({ uiNotifications: false });
  });

  afterEach(() => {
    useGlobalStore.setState({ uiNotifications: false });
  });

  it("opens the panel and shows an error with retry when the request is blocked", async () => {
    // A blocked request (content blocker, offline) rejects the fetch itself.
    api.list.mockRejectedValue(new TypeError("Failed to fetch"));
    renderBellAndPanel();

    fireEvent.click(await screen.findByRole("button", { name: "user-nav.notifications-unread" }));

    await waitFor(() => expect(document.querySelector(".notification-list")).toBeInTheDocument());
    expect(await screen.findByText("notifications.load-failed")).toBeInTheDocument();

    api.list.mockResolvedValue([]);
    const callsBefore = api.list.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "g.retry" }));
    });

    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.queryByText("notifications.load-failed")).not.toBeInTheDocument());
  });

  it("opens the panel while the request is still pending", async () => {
    api.list.mockReturnValue(new Promise(() => undefined));
    renderBellAndPanel();

    fireEvent.click(await screen.findByRole("button", { name: "user-nav.notifications-unread" }));

    await waitFor(() => expect(document.querySelector(".notification-list")).toBeInTheDocument());
  });

  it("shows the empty-list message for an account with no notifications (#2080)", async () => {
    api.list.mockResolvedValue([]);
    renderBellAndPanel();

    fireEvent.click(await screen.findByRole("button", { name: "user-nav.notifications-unread" }));

    expect(await screen.findByText("g.empty-list")).toBeInTheDocument();
  });

  it("lets a click on the unread badge through to the bell", async () => {
    // The badge is drawn over the bell's top-right corner, where a user aims
    // when there is a count. It must not swallow the click. jsdom applies no
    // CSS, so this pins the class that does it in a browser.
    api.list.mockResolvedValue([]);
    renderBellAndPanel();

    const badge = await screen.findByText("3");
    expect(badge).toHaveClass("pointer-events-none");
  });
});
