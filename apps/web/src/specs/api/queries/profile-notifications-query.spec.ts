import { beforeEach, describe, expect, it, vi } from "vitest";

// #395: /@username/notifications lists ANY account's notifications. The panel's
// SDK builder only reads the signed-in account's own list, so the profile
// section asks the same endpoint for another account through its `user` field
// (the deck notifications column does the same), keyed apart from the panel.
const getNotifications = vi.hoisted(() => vi.fn());

vi.mock("@ecency/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecency/sdk")>();
  return { ...actual, getNotifications };
});

import { getNotificationsInfiniteQueryOptions } from "@ecency/sdk";
import { getProfileNotificationsQueryOptions } from "@/api/queries";
import { NotificationFilter } from "@/enums";

type QueryFn = (ctx: { pageParam: string }) => Promise<unknown>;

describe("getProfileNotificationsQueryOptions (#395)", () => {
  beforeEach(() => {
    getNotifications.mockReset();
    getNotifications.mockResolvedValue([]);
  });

  it("reuses the panel's query for the signed-in account's own profile", () => {
    const own = getProfileNotificationsQueryOptions("alice", "code", "Alice");
    const panel = getNotificationsInfiniteQueryOptions("alice", "code");

    expect(own.queryKey).toEqual(panel.queryKey);
  });

  it("keys another account's list apart from the panel's", () => {
    const other = getProfileNotificationsQueryOptions("alice", "code", "bob", NotificationFilter.VOTES);
    const panel = getNotificationsInfiniteQueryOptions("alice", "code", NotificationFilter.VOTES as never);

    expect(other.queryKey).not.toEqual(panel.queryKey);
    expect(other.queryKey).toContain("bob");
  });

  it("asks for the profile account's notifications, paging by the last id", async () => {
    const other = getProfileNotificationsQueryOptions("alice", "code", "bob", NotificationFilter.VOTES);

    await (other.queryFn as unknown as QueryFn)({ pageParam: "" });
    expect(getNotifications).toHaveBeenLastCalledWith("code", "rvotes", null, "bob");

    await (other.queryFn as unknown as QueryFn)({ pageParam: "n-42" });
    expect(getNotifications).toHaveBeenLastCalledWith("code", "rvotes", "n-42", "bob");
  });

  it("does not run without a signed-in viewer", () => {
    expect(getProfileNotificationsQueryOptions(undefined, undefined, "bob").enabled).toBe(false);
    expect(getProfileNotificationsQueryOptions("alice", undefined, "bob").enabled).toBe(false);
    expect(getProfileNotificationsQueryOptions("alice", "code", "bob").enabled).toBe(true);
  });
});
