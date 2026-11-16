import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useGlobalStore } from "@/core/global-store";

// #395: the /@username/notifications section shows the same rows as the
// notifications panel, for any profile. It is read-only for another account:
// no mark-as-read (that would mark the VIEWER's rows), no self-only filters,
// and a link click must not pop the navbar panel open.
const api = vi.hoisted(() => ({
  other: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  own: vi.fn<(pageParam?: string) => Promise<unknown[]>>(),
  mark: vi.fn()
}));

vi.mock("@ecency/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecency/sdk")>();
  return {
    ...actual,
    getNotifications: (...args: unknown[]) => api.other(...args),
    getNotificationsInfiniteQueryOptions: (username?: string, code?: string, filter?: string) => ({
      queryKey: ["notifications", username, filter],
      queryFn: ({ pageParam }: { pageParam: string }) => api.own(pageParam),
      initialPageParam: "",
      getNextPageParam: () => undefined,
      enabled: !!username && !!code
    })
  };
});

const activeAccount: { activeUser: { username: string } | null } = {
  activeUser: { username: "alice" }
};
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
vi.mock("@/api/sdk-mutations", () => ({
  useMarkNotificationsMutation: () => ({ mutateAsync: api.mark })
}));

import { ProfileNotifications } from "@/app/(dynamicPages)/profile/[username]/notifications/_page";

// An unrecognised type renders through the panel item's generic branch, which
// is all these cases need: the source link, the unread state, the controls.
const row = {
  id: "n-1",
  type: "custom_kind",
  source: "carol",
  read: 0,
  timestamp: "2026-11-15T10:00:00",
  ts: 1763200800,
  gk: "2026-11-15",
  gkf: true
};

describe("profile notifications section (#395)", () => {
  beforeEach(() => {
    api.other.mockReset();
    api.own.mockReset();
    api.mark.mockReset();
    api.other.mockResolvedValue([row]);
    api.own.mockResolvedValue([row]);
    activeAccount.activeUser = { username: "alice" };
    useGlobalStore.setState({ uiNotifications: false });
  });

  it("lists another account's notifications from that account", async () => {
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect(await screen.findByText("@carol")).toBeInTheDocument();
    expect(api.other).toHaveBeenCalledWith("token", null, null, "bob");
    expect(api.own).not.toHaveBeenCalled();
  });

  it("is read-only for another account", async () => {
    const { container } = renderWithQueryClient(<ProfileNotifications username="bob" />);
    await screen.findByText("@carol");

    expect(container.querySelector(".mark-read")).toBeNull();
    expect(container.querySelector(".not-read")).toBeNull();

    fireEvent.click(screen.getAllByRole("link", { name: "@carol" })[0]);
    expect(api.mark).not.toHaveBeenCalled();
    expect(useGlobalStore.getState().uiNotifications).toBe(false);
  });

  it("does not offer the filters another account's list never returns", async () => {
    renderWithQueryClient(<ProfileNotifications username="bob" />);
    await screen.findByText("@carol");

    fireEvent.click(screen.getByText("notifications.type-all"));

    expect(await screen.findByText("notifications.type-rvotes")).toBeInTheDocument();
    expect(screen.queryByText("notifications.type-nfavorites")).toBeNull();
    expect(screen.queryByText("notifications.type-nbookmarks")).toBeNull();
    expect(screen.queryByText("notifications.type-tags")).toBeNull();
    expect(screen.queryByText("notifications.type-scheduled_published")).toBeNull();
  });

  it("shows the owner their own list with mark-as-read, without opening the panel", async () => {
    const { container } = renderWithQueryClient(<ProfileNotifications username="Alice" />);
    await screen.findByText("@carol");

    expect(api.own).toHaveBeenCalled();
    expect(api.other).not.toHaveBeenCalled();
    expect(container.querySelector(".mark-read")).not.toBeNull();

    fireEvent.click(screen.getAllByRole("link", { name: "@carol" })[0]);
    expect(api.mark).toHaveBeenCalledWith({ id: "n-1" });
    expect(useGlobalStore.getState().uiNotifications).toBe(false);
  });

  it("asks a signed-out viewer to sign in instead of loading", async () => {
    activeAccount.activeUser = null;
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect(await screen.findByText("notifications.auth-required-desc")).toBeInTheDocument();
    expect(api.other).not.toHaveBeenCalled();
  });
});
