import { describe, it, expect, vi, beforeEach, expectTypeOf } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getAccountNotificationsInfiniteQueryOptions } from "./get-account-notifications-infinite-query-options";
import type { AccountNotification } from "../types";

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/hive-tx")>();
  return { ...actual, callRPC: mockCallRPC };
});

// bridge.account_notifications returns ids as strings, above 2^53: the cursor must
// travel back exactly as received, never through a number (#2100).
const BIG_ID = "90191769311903745";
const row = (id: string): AccountNotification => ({
  date: "2026-11-16T00:00:00",
  id,
  msg: "@a voted on @b/p",
  score: 50,
  type: "vote",
  url: "@b/p"
});

describe("getAccountNotificationsInfiniteQueryOptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("types the id as the bridge returns it, a string", () => {
    expectTypeOf<AccountNotification["id"]>().toEqualTypeOf<string>();
  });

  it("pages from the last row's string id unchanged", async () => {
    mockCallRPC.mockResolvedValueOnce([row("90191769311903749"), row(BIG_ID)]).mockResolvedValueOnce([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = getAccountNotificationsInfiniteQueryOptions("alice", 2);

    const data = await client.fetchInfiniteQuery({ ...options, pages: 2 });

    expect(data.pageParams).toEqual([null, BIG_ID]);
    expect(mockCallRPC).toHaveBeenLastCalledWith("bridge.account_notifications", {
      account: "alice",
      limit: 2,
      last_id: BIG_ID
    });
  });
});
