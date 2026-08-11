import { describe, expect, it } from "vitest";
import {
  collectRequestedOperations,
  getHiveAssetTransactionsQueryOptions,
  getNextAccountHistoryPageParam,
  resolveAccountHistoryLimit,
} from "./get-hive-asset-transactions-query-options";
import { getHbdAssetTransactionsQueryOptions } from "./get-hbd-asset-transactions-query-options";
import { ALL_ACCOUNT_OPERATIONS, ACCOUNT_OPERATION_GROUPS } from "../../accounts";
import type { HiveTransaction } from "../types";

const page = (nums: number[]) =>
  nums.map((num) => ({ num, type: "transfer", timestamp: "", trx_id: "" })) as
    unknown as HiveTransaction[];

describe("getNextAccountHistoryPageParam", () => {
  // condenser_api.get_account_history returns each page in ASCENDING num order, so the
  // OLDEST row is at index 0. Reading the last element instead advances the window by a
  // single operation per page.
  it("walks backwards from the oldest row on the page", () => {
    expect(getNextAccountHistoryPageParam(page([8842005, 8842006, 8842054]))).toBe(
      8842004
    );
  });

  it("does not overlap the page it just returned", () => {
    const first = page([100, 101, 102]);
    const next = getNextAccountHistoryPageParam(first)!;
    expect(next).toBeLessThan(Math.min(...first.map((x) => Number(x.num))));
  });

  it("terminates at the start of history instead of returning the -1 sentinel", () => {
    // -1 is initialPageParam ("give me the newest"), so returning it here would restart
    // the walk at the head of the history and never finish.
    expect(getNextAccountHistoryPageParam(page([0, 1, 2]))).toBeUndefined();
  });

  it("terminates on an empty or missing page", () => {
    expect(getNextAccountHistoryPageParam([])).toBeUndefined();
    expect(getNextAccountHistoryPageParam(undefined)).toBeUndefined();
  });
});

describe("resolveAccountHistoryLimit", () => {
  it("passes the newest-page sentinel through untouched", () => {
    expect(resolveAccountHistoryLimit(-1, 1000)).toBe(1000);
  });

  it("leaves a full window alone", () => {
    expect(resolveAccountHistoryLimit(5000, 1000)).toBe(1000);
  });

  // The node asserts `start >= limit - 1`, so the short window before the start of
  // history has to be asked for at its real size. Requesting the full limit there
  // fails the assert instead of returning the rows that are left.
  it("narrows the last window to what is left", () => {
    expect(resolveAccountHistoryLimit(500, 1000)).toBe(501);
    expect(resolveAccountHistoryLimit(0, 1000)).toBe(1);
  });

  it("satisfies start >= limit - 1 for every cursor the walk can emit", () => {
    for (const start of [0, 1, 18, 19, 499, 500, 998, 999, 1000, 12345]) {
      expect(start).toBeGreaterThanOrEqual(
        resolveAccountHistoryLimit(start, 1000) - 1
      );
    }
  });
});

describe("per-asset filtering of fill_transfer_from_savings", () => {
  const savingsPage = () =>
    [
      {
        num: 0,
        type: "fill_transfer_from_savings",
        timestamp: "",
        trx_id: "",
        amount: "1.000 HIVE",
        from: "alice",
        to: "bob",
        request_id: 1,
      },
      {
        num: 1,
        type: "fill_transfer_from_savings",
        timestamp: "",
        trx_id: "",
        amount: "2.000 HBD",
        from: "alice",
        to: "bob",
        request_id: 2,
      },
    ] as unknown as HiveTransaction[];

  const amountsAfterSelect = (options: {
    select?: (data: any) => { pages: HiveTransaction[][] };
  }) =>
    options
      .select!({ pages: [savingsPage()], pageParams: [-1] })
      .pages[0].map((item) => (item as unknown as { amount: string }).amount);

  // The op carries either asset, so without a case of its own it reaches the default,
  // which keeps anything the caller named and never checks the symbol.
  it("keeps only HIVE on the HIVE wallet", () => {
    expect(
      amountsAfterSelect(
        getHiveAssetTransactionsQueryOptions("alice", 1000, [
          "fill_transfer_from_savings",
        ])
      )
    ).toEqual(["1.000 HIVE"]);
  });

  it("keeps only HBD on the HBD wallet", () => {
    expect(
      amountsAfterSelect(
        getHbdAssetTransactionsQueryOptions("alice", 1000, [
          "fill_transfer_from_savings",
        ])
      )
    ).toEqual(["2.000 HBD"]);
  });
});

describe("collectRequestedOperations", () => {
  it("collects an explicit list", () => {
    expect(collectRequestedOperations(["transfer", "fill_transfer_from_savings"])).toEqual(
      new Set(["transfer", "fill_transfer_from_savings"])
    );
  });

  it("accepts a single value", () => {
    expect(collectRequestedOperations("transfer")).toEqual(new Set(["transfer"]));
  });

  // An empty set is what keeps the unfiltered per-asset views behaving exactly as
  // before: the asset's own allow-list decides and nothing extra leaks in.
  it("is empty for no filter and for the all-operations alias", () => {
    expect(collectRequestedOperations([])).toEqual(new Set());
    expect(collectRequestedOperations("")).toEqual(new Set());
    expect(collectRequestedOperations(["", "transfer"])).toEqual(new Set(["transfer"]));
  });
});

describe("ALL_ACCOUNT_OPERATIONS", () => {
  it("lists every id once", () => {
    expect(new Set(ALL_ACCOUNT_OPERATIONS).size).toBe(ALL_ACCOUNT_OPERATIONS.length);
  });

  it("covers every group", () => {
    Object.values(ACCOUNT_OPERATION_GROUPS)
      .flat()
      .forEach((id) => expect(ALL_ACCOUNT_OPERATIONS).toContain(id));
  });

  // 59 used to be missing because fill_recurrent_transfer was listed twice, so a
  // completed savings withdrawal never came back from the transfers group.
  it("includes fill_transfer_from_savings in the transfers group", () => {
    expect(ACCOUNT_OPERATION_GROUPS.transfers).toContain(59);
    expect(ALL_ACCOUNT_OPERATIONS).toContain(59);
  });

  // Web's profile transaction list renders producer_reward, so the unfiltered default
  // must keep returning it.
  it("still includes producer_reward", () => {
    expect(ALL_ACCOUNT_OPERATIONS).toContain(64);
  });
});
