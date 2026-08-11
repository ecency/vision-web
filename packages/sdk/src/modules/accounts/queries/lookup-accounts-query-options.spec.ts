import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { lookupAccountsQueryOptions } from "./lookup-accounts-query-options";
import { getAccountReputationsQueryOptions } from "./get-account-reputations-query-options";

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/hive-tx")>();
  return {
    ...actual,
    callRPC: mockCallRPC
  };
});

const runQuery = (options: any) =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } }).fetchQuery(options);

describe("account prefix lookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks up a normal prefix", async () => {
    mockCallRPC.mockResolvedValue(["good-karma"]);

    await expect(runQuery(lookupAccountsQueryOptions("good", 5))).resolves.toEqual([
      "good-karma"
    ]);
    expect(mockCallRPC).toHaveBeenCalledWith("condenser_api.lookup_accounts", ["good", 5]);
  });

  // Regression: #1403. lower_bound_name is an account_name_type, so hived asserts on
  // the byte length while parsing the argument. The editor's `@` autocomplete feeds
  // this whatever follows the `@`, so `@aliveandthriving,` in prose arrives intact.
  it("answers with no matches instead of asking the node about an unqueryable prefix", async () => {
    for (const token of [
      "aliveandthriving,",
      "minismallholding!",
      "isaacmartiubeda(64)",
      "вцпк33ппп43"
    ]) {
      await expect(runQuery(lookupAccountsQueryOptions(token, 5))).resolves.toEqual([]);
    }

    expect(mockCallRPC).not.toHaveBeenCalled();
  });

  it("applies the same guard to reputations", async () => {
    await expect(
      runQuery(getAccountReputationsQueryOptions("aliveandthriving,", 20))
    ).resolves.toEqual([]);
    expect(mockCallRPC).not.toHaveBeenCalled();

    mockCallRPC.mockResolvedValue([{ account: "good-karma", reputation: 1 }]);
    await runQuery(getAccountReputationsQueryOptions("good", 20));
    expect(mockCallRPC).toHaveBeenCalledWith("condenser_api.get_account_reputations", [
      "good",
      20
    ]);
  });
});
