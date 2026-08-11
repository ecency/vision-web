import { describe, expect, it } from "vitest";
import {
  collectRequestedOperations,
  getNextAccountHistoryPageParam,
} from "./get-hive-asset-transactions-query-options";
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
