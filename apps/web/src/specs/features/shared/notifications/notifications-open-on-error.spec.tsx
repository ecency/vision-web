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
  list: vi.fn<(pageParam?: string) => Promise<unknown[]>>(),
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
    queryFn: ({ pageParam }: { pageParam: string }) => api.list(pageParam),
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
// A row per notification is all the paging cases need to see.
vi.mock("@/features/shared/notifications/notification-list-item", () => ({
  NotificationListItem: ({ notification }: { notification: { id: string } }) => (
    <div>row-{notification.id}</div>
  )
}));
vi.mock("@/features/shared/notifications/hooks", () => ({
  useMarkNotificationsList: () => ({ mutateAsync: vi.fn(), isPending: false })
}));

import { NavbarNotificationsButton } from "@/features/shared/navbar/navbar-notifications-button";
import { NotificationsDialog } from "@/features/shared/notifications";
import { NotificationList } from "@/features/shared/notifications/notification-list";
import { NotificationViewType } from "@/enums";

/** The panel's Retry buttons use the outline style of its other actions: the
 * filled secondary one was white on mid grey in the light theme (#2022). */
function expectOutlineRetry(button: HTMLElement) {
  expect(button.className).toContain("border-solid");
  expect(button.className).toContain("text-blue-dark-sky");
  expect(button.className).not.toContain("bg-gray-600");
}

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
    expectOutlineRetry(screen.getByRole("button", { name: "g.retry" }));

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

  // #2080: a failed "load more" keeps the rows already shown and offers a
  // retry for the next page, instead of failing silently.
  it("shows an inline retry when loading the next page fails", async () => {
    const observers: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          observers.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
    );
    const row = (id: string) => ({ id, type: "vote", read: 0, gk: "2026-11-15", gkf: false });
    api.list.mockImplementation(async (pageParam?: string) => {
      if (!pageParam) return [row("n1")];
      throw new Error("Failed to fetch notifications: 503");
    });
    try {
      renderBellAndPanel();
      fireEvent.click(await screen.findByRole("button", { name: "user-nav.notifications-unread" }));
      expect(await screen.findByText("row-n1")).toBeInTheDocument();

      // Scroll to the sentinel: the next page fails.
      await act(async () => {
        for (const cb of observers) {
          cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });
      const retry = await screen.findByRole("button", { name: "g.retry" });
      expect(screen.getByText("notifications.load-more-failed")).toBeInTheDocument();
      // A failed next page is not a failed refresh: one notice, not two.
      expect(screen.queryByText("notifications.refresh-failed")).not.toBeInTheDocument();
      expectOutlineRetry(retry);
      expect(screen.getByText("row-n1")).toBeInTheDocument();

      api.list.mockImplementation(async (pageParam?: string) =>
        pageParam === "n1" ? [row("n2")] : pageParam ? [] : [row("n1")]
      );
      await act(async () => {
        fireEvent.click(retry);
      });
      expect(await screen.findByText("row-n2")).toBeInTheDocument();
      expect(screen.queryByText("notifications.load-more-failed")).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // #2087 review: a refetch of the list (a window refocus, the panel's own
  // refetch) that fails keeps the cached rows, so the panel must still say
  // the refresh failed.
  it("says so with a Retry when a refresh fails while earlier rows are shown", async () => {
    const row = (id: string) => ({ id, type: "vote", read: 0, gk: "2026-11-15", gkf: false });
    api.list.mockImplementation(async (pageParam?: string) => (pageParam ? [] : [row("n1")]));
    const { queryClient } = renderBellAndPanel();
    fireEvent.click(await screen.findByRole("button", { name: "user-nav.notifications-unread" }));
    expect(await screen.findByText("row-n1")).toBeInTheDocument();

    api.list.mockRejectedValue(new Error("Failed to fetch notifications: 503"));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["notifications", "list"] });
    });

    expect(await screen.findByText("notifications.refresh-failed")).toBeInTheDocument();
    expect(screen.getByText("row-n1")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "g.retry" });
    expectOutlineRetry(retry);

    api.list.mockImplementation(async (pageParam?: string) =>
      pageParam ? [] : [row("n0"), row("n1")]
    );
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(await screen.findByText("row-n0")).toBeInTheDocument();
    expect(screen.queryByText("notifications.refresh-failed")).not.toBeInTheDocument();
  });

  // #2087 review: with the read/unread view empty but rows loaded, a failed
  // refresh showed "empty list" next to the refresh notice.
  it("shows only the refresh notice when the view is empty and a refresh fails", async () => {
    const observers: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          observers.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
    );
    const row = (id: string) => ({ id, type: "vote", read: 1, gk: "2026-11-15", gkf: false });
    api.list.mockImplementation(async (pageParam?: string) => (pageParam ? [] : [row("n1")]));
    try {
      const { queryClient } = renderWithQueryClient(
        <NotificationList
          currentStatus={NotificationViewType.UNREAD}
          selectNotification={() => undefined}
        />
      );
      await waitFor(() => expect(api.list).toHaveBeenCalled());
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
      // The sentinel loads the (empty) last page, so the list knows it has ended.
      await act(async () => {
        for (const cb of observers) {
          cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });
      expect(await screen.findByText("g.empty-list")).toBeInTheDocument();

      api.list.mockRejectedValue(new Error("Failed to fetch notifications: 503"));
      await act(async () => {
        await queryClient.refetchQueries({ queryKey: ["notifications", "list"] });
      });

      expect(await screen.findByText("notifications.refresh-failed")).toBeInTheDocument();
      expect(screen.queryByText("g.empty-list")).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // #2080 screenshot pass: scrolling to the retry row brought the sentinel
  // into view, which started the failed page again and hid the row.
  it("does not refetch a failed next page when the sentinel comes into view; Retry does, then scrolling loads on", async () => {
    const observers: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          observers.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
    );
    const intersect = () =>
      act(async () => {
        for (const cb of observers) {
          cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        }
      });
    const row = (id: string) => ({ id, type: "vote", read: 0, gk: "2026-11-15", gkf: false });
    api.list.mockImplementation(async (pageParam?: string) => {
      if (!pageParam) return [row("n1")];
      throw new Error("Failed to fetch notifications: 503");
    });
    const nextPageCalls = () => api.list.mock.calls.filter(([page]) => page === "n1").length;
    try {
      renderBellAndPanel();
      fireEvent.click(await screen.findByRole("button", { name: "user-nav.notifications-unread" }));
      expect(await screen.findByText("row-n1")).toBeInTheDocument();

      await intersect();
      await screen.findByText("notifications.load-more-failed");
      const failedCalls = nextPageCalls();

      // The user scrolls to the retry row: the sentinel is in view again.
      await intersect();
      await intersect();

      expect(nextPageCalls()).toBe(failedCalls);
      expect(screen.getByText("notifications.load-more-failed")).toBeInTheDocument();

      // Retry succeeds: the scroll loads the following page by itself again.
      api.list.mockImplementation(async (pageParam?: string) =>
        pageParam === "n1" ? [row("n2")] : pageParam === "n2" ? [row("n3")] : [row("n1")]
      );
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "g.retry" }));
      });
      await waitFor(() => expect(nextPageCalls()).toBe(failedCalls + 1));
      expect(await screen.findByText("row-n2")).toBeInTheDocument();
      expect(screen.queryByText("notifications.load-more-failed")).not.toBeInTheDocument();

      await intersect();
      expect(await screen.findByText("row-n3")).toBeInTheDocument();
      expect(api.list.mock.calls.filter(([page]) => page === "n2")).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
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
