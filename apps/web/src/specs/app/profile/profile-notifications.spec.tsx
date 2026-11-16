import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";

// #395: the /@username/notifications section lists the account's on-chain
// notifications from Hive's bridge.account_notifications, the same source as a
// community's activity tab. It is public data: no sign-in, no Ecency notification
// API, the same list for every viewer.
const api = vi.hoisted(() => ({
  bridge: vi.fn<(account: string, lastId: string | null) => Promise<unknown[]>>(),
  // Pages after the first: getNextPageParam hands out "p1", "p2", ... while they last.
  morePages: 0,
  ecency: vi.fn()
}));

vi.mock("@ecency/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecency/sdk")>();
  return {
    ...actual,
    getNotifications: (...args: unknown[]) => api.ecency(...args),
    getNotificationsInfiniteQueryOptions: (...args: unknown[]) => {
      api.ecency(...args);
      return { queryKey: ["ecency-notifications"], queryFn: async () => [], initialPageParam: "", getNextPageParam: () => undefined };
    },
    getAccountNotificationsInfiniteQueryOptions: (account: string, limit: number) => ({
      queryKey: ["bridge-notifications", account, limit],
      queryFn: ({ pageParam }: { pageParam: string | null }) => api.bridge(account, pageParam),
      initialPageParam: null,
      getNextPageParam: (_last: unknown, all: unknown[]) => (all.length <= api.morePages ? `p${all.length}` : null)
    })
  };
});

const activeAccount: { activeUser: { username: string } | null } = { activeUser: null };
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => activeAccount }));
vi.mock("@/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils")>()),
  dateToFullRelative: (date: string) => date
}));

import { ProfileNotifications } from "@/app/(dynamicPages)/profile/[username]/notifications/_page";

// Shapes as the API returns them: ids are strings (above 2^53), a community row's
// url is "c/<name>" and its msg names the community by title.
const rows = [
  { id: "90191769311903747", type: "vote", score: 60, date: "2026-11-15T10:00:00", msg: "@carol voted on your post ($0.10)", url: "@bob/hello" },
  { id: "90191769311903746", type: "reply", score: 55, date: "2026-11-15T09:00:00", msg: "@dave replied to your post", url: "@dave/re-hello" },
  { id: "90191769311903745", type: "subscribe", score: 40, date: "2026-11-15T08:00:00", msg: "@erin subscribed to Town Square", url: "c/hive-125125" }
];
const mentionRows = (n: number, from: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(from - i),
    type: "mention",
    score: 50,
    date: `2026-11-14T0${i % 10}:00:00`,
    msg: `@m${from - i} mentioned you`,
    url: `@m${from - i}/post-${from - i}`
  }));

describe("profile notifications section (#395)", () => {
  beforeEach(() => {
    api.bridge.mockReset();
    api.ecency.mockReset();
    api.bridge.mockResolvedValue(rows);
    api.morePages = 0;
    activeAccount.activeUser = null;
  });

  it("lists the account's bridge notifications to a signed-out viewer", async () => {
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect(await screen.findByText("@carol")).toBeInTheDocument();
    expect(api.bridge).toHaveBeenCalledWith("bob", null);
    expect(api.ecency).not.toHaveBeenCalled();
    expect(screen.queryByText("notifications.auth-required-desc")).toBeNull();
  });

  it("uses the same source for the owner as for anyone else", async () => {
    activeAccount.activeUser = { username: "bob" };
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect(await screen.findByText("@carol")).toBeInTheDocument();
    expect(api.bridge).toHaveBeenCalledWith("bob", null);
    expect(api.ecency).not.toHaveBeenCalled();
  });

  it("links the account in the message and the post it points at", async () => {
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect((await screen.findByText("@carol")).closest("a")).toHaveAttribute("href", "/@carol");
    // Bridge messages name the post as "your post"; its path only comes in `url`,
    // so the row's date links to it.
    expect(screen.getByText("2026-11-15T09:00:00").closest("a")?.getAttribute("href")).toContain("/@dave/re-hello");
    // A community row's url is the community (c/<name>), not a post: no post link.
    expect(screen.getByText("2026-11-15T08:00:00").closest("a")).toBeNull();
  });

  it("filters by notification type", async () => {
    renderWithQueryClient(<ProfileNotifications username="bob" />);
    await screen.findByText("@carol");

    fireEvent.click(screen.getByText("notifications.type-all"));
    fireEvent.click(await screen.findByText("notifications.type-replies"));

    expect(await screen.findByText("@dave")).toBeInTheDocument();
    expect(screen.queryByText("@carol")).toBeNull();
    expect(screen.queryByText("@erin")).toBeNull();

    fireEvent.click(screen.getByText("notifications.type-replies"));
    fireEvent.click(await screen.findByText("notifications.type-communities"));

    expect(await screen.findByText("@erin")).toBeInTheDocument();
    expect(screen.queryByText("@dave")).toBeNull();
  });

  it("does not link the date when the message already links the post", async () => {
    api.bridge.mockResolvedValue([
      { id: "9", type: "mute_post", score: 70, date: "2026-11-15T07:00:00", msg: "@mod muted @bob/hello - spam", url: "@bob/hello" }
    ]);
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect((await screen.findByText("@bob/hello")).closest("a")?.getAttribute("href")).toContain("/@bob/hello");
    expect(screen.getByText("2026-11-15T07:00:00").closest("a")).toBeNull();
  });

  it("shows a row whose message names no account", async () => {
    api.bridge.mockResolvedValue([
      { id: "8", type: "error", score: 100, date: "2026-11-15T06:00:00", msg: "error: invalid custom_json", url: "" }
    ]);
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect(await screen.findByText("error: invalid custom_json")).toBeInTheDocument();
  });

  it("keeps loading pages while a filter matches nothing loaded, then says it is empty", async () => {
    api.morePages = 2;
    api.bridge.mockImplementation(async (_account, lastId) =>
      lastId === null ? mentionRows(50, 1000) : lastId === "p1" ? mentionRows(50, 900) : [rows[0]]
    );
    renderWithQueryClient(<ProfileNotifications username="bob" />);
    await screen.findByText("@m1000");

    fireEvent.click(screen.getByText("notifications.type-all"));
    fireEvent.click(await screen.findByText("notifications.type-rvotes"));

    // The vote is on the third page: it is fetched without a Load More click.
    expect(await screen.findByText("@carol")).toBeInTheDocument();
    expect(api.bridge).toHaveBeenCalledWith("bob", "p2");

    fireEvent.click(screen.getByText("notifications.type-rvotes"));
    fireEvent.click(await screen.findByText("notifications.type-follows"));
    expect(await screen.findByText("g.empty-list")).toBeInTheDocument();
  });

  it("stops auto-loading after a bounded number of pages and leaves Load More", async () => {
    api.morePages = 100;
    api.bridge.mockImplementation(async (_account, lastId) =>
      mentionRows(50, lastId === null ? 10000 : 10000 - 100 * Number(lastId.slice(1)))
    );
    renderWithQueryClient(<ProfileNotifications username="bob" />);
    await screen.findByText("@m10000");

    fireEvent.click(screen.getByText("notifications.type-all"));
    fireEvent.click(await screen.findByText("notifications.type-rvotes"));

    expect(await screen.findByText("g.load-more")).toBeInTheDocument();
    expect(api.bridge).toHaveBeenCalledTimes(6);
    // Pages remain, so the list does not claim to be empty.
    expect(screen.queryByText("g.empty-list")).toBeNull();
  });

  it("never shows the empty text while auto-loading between pages", async () => {
    api.morePages = 2;
    let release: () => void = () => {};
    api.bridge.mockImplementation(async (_account, lastId) => {
      if (lastId === null) return mentionRows(50, 1000);
      if (lastId === "p1") return mentionRows(50, 900);
      await new Promise<void>((r) => (release = r));
      return [rows[0]];
    });
    renderWithQueryClient(<ProfileNotifications username="bob" />);
    await screen.findByText("@m1000");

    fireEvent.click(screen.getByText("notifications.type-all"));
    fireEvent.click(await screen.findByText("notifications.type-rvotes"));
    await vi.waitFor(() => expect(api.bridge).toHaveBeenCalledWith("bob", "p2"));

    expect(screen.queryByText("g.empty-list")).toBeNull();
    expect(screen.queryByText("g.load-more")).toBeNull();
    release();
    expect(await screen.findByText("@carol")).toBeInTheDocument();
  });

  it("says the log is empty instead of rendering a blank box", async () => {
    api.bridge.mockResolvedValue([]);
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect(await screen.findByText("g.empty-list")).toBeInTheDocument();
  });

  it("filter opens from a focusable button and picks a type from the keyboard", async () => {
    renderWithQueryClient(<ProfileNotifications username="bob" />);
    await screen.findByText("@carol");

    // A native button is focusable and turns Enter/Space into a click.
    const toggle = screen.getByRole("button", { name: /notifications\.type-all/ });
    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);

    const item = await screen.findByRole("menuitem", { name: "notifications.type-replies" });
    fireEvent.keyDown(item, { key: "Enter" });

    expect(await screen.findByText("@dave")).toBeInTheDocument();
    expect(screen.queryByText("@carol")).toBeNull();
  });

  it("shows a retry instead of an empty list when the request fails", async () => {
    api.bridge.mockRejectedValue(new Error("rpc down"));
    renderWithQueryClient(<ProfileNotifications username="bob" />);

    expect(await screen.findByText("g.retry")).toBeInTheDocument();
  });
});
