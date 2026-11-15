import { afterEach, describe, expect, it, vi } from "vitest";
import { getNotificationsInfiniteQueryOptions } from "./get-notifications-infinite-query-options";
import {
  getHbdAssetTransactionsQueryOptions,
  getHiveAssetTransactionsQueryOptions,
  getHivePowerAssetTransactionsQueryOptions,
} from "../../wallet";

// An empty `initialData: { pages: [], pageParams: [] }` seed counts as fresh data for the
// whole staleTime (there is no initialDataUpdatedAt), so any consumer with a non-zero
// default staleTime reads it instead of fetching and renders an empty list with no
// loading state. The seed was removed from the wallet asset options first, then from the
// notifications options; this pins the absence for all of them so it is not reintroduced.
describe("infinite query options carry no initialData seed", () => {
  const factories: [string, () => object][] = [
    ["notifications", () => getNotificationsInfiniteQueryOptions("alice", "code")],
    ["HIVE transactions", () => getHiveAssetTransactionsQueryOptions("alice", 20)],
    ["HBD transactions", () => getHbdAssetTransactionsQueryOptions("alice", 20)],
    ["HP transactions", () => getHivePowerAssetTransactionsQueryOptions("alice", 20)],
  ];

  it.each(factories)("%s", (_name, factory) => {
    expect(factory()).not.toHaveProperty("initialData");
  });
});

// Issue #2080: a failed request must reach the caller as an error, and an empty
// page must end the list, or the panel never shows its error or empty state.
describe("getNotificationsInfiniteQueryOptions (#2080)", () => {
  const options = () => getNotificationsInfiniteQueryOptions("alice", "code");
  const run = (pageParam = "") =>
    (options().queryFn as (ctx: { pageParam: string }) => Promise<unknown>)({ pageParam });
  const nextPage = (lastPage: { id: string }[] | undefined) =>
    (options().getNextPageParam as (p: unknown) => unknown)(lastPage);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects when the endpoint answers 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("oops", { status: 500 }))
    );
    await expect(run()).rejects.toThrow(/500/);
  });

  it("resolves the page on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "n1" }]), { status: 200 }))
    );
    await expect(run()).resolves.toEqual([{ id: "n1" }]);
  });

  it("has no next page after an empty page", () => {
    expect(nextPage([])).toBeUndefined();
    expect(nextPage(undefined)).toBeUndefined();
  });

  it("continues from the last id after a non-empty page", () => {
    expect(nextPage([{ id: "a" }, { id: "b" }])).toBe("b");
  });
});
