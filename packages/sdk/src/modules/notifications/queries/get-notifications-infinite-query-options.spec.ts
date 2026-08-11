import { describe, expect, it } from "vitest";
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
