import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigManager } from "@/modules/core/config";
import { QueryKeys } from "@/modules/core/query-keys";
import { getHivePowerDelegatingsQueryOptions } from "./get-hive-power-delegatings-query-options";
import { getReceivedVestingSharesQueryOptions } from "./get-received-vesting-shares-query-options";
import {
  rawVestsToAsset,
  toReceivedVestingShares,
} from "../utils/received-vesting-shares";

const mockCallREST = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/core/hive-tx")>();
  return { ...actual, callREST: mockCallREST };
});

const DELEGATIONS = {
  outgoing_delegations: [
    {
      delegatee: "ecency",
      amount: "350000000000",
      operation_id: "1",
      block_num: 2,
    },
  ],
  incoming_delegations: [
    { delegator: "bob", amount: "1000000", operation_id: "3", block_num: 4 },
    {
      delegator: "carol",
      amount: "903311000000",
      operation_id: "5",
      block_num: 6,
    },
    {
      delegator: "dave",
      amount: "12345678901234567",
      operation_id: "7",
      block_num: 8,
    },
  ],
};

describe("rawVestsToAsset", () => {
  it("renders raw vests as the legacy asset string without losing digits", () => {
    expect(rawVestsToAsset("903311000000")).toBe("903311.000000 VESTS");
    expect(rawVestsToAsset("1000000")).toBe("1.000000 VESTS");
    expect(rawVestsToAsset("1")).toBe("0.000001 VESTS");
    expect(rawVestsToAsset("0")).toBe("0.000000 VESTS");
    expect(rawVestsToAsset("")).toBe("0.000000 VESTS");
    // above 2^53 raw units a float would round; the string does not
    expect(rawVestsToAsset("12345678901234567")).toBe(
      "12345678901.234567 VESTS",
    );
  });
});

describe("toReceivedVestingShares", () => {
  it("takes the incoming half, largest first, in the legacy shape", () => {
    expect(toReceivedVestingShares("alice", DELEGATIONS)).toEqual([
      {
        delegatee: "alice",
        delegator: "dave",
        vesting_shares: "12345678901.234567 VESTS",
      },
      {
        delegatee: "alice",
        delegator: "carol",
        vesting_shares: "903311.000000 VESTS",
      },
      {
        delegatee: "alice",
        delegator: "bob",
        vesting_shares: "1.000000 VESTS",
      },
    ]);
    expect(toReceivedVestingShares("alice", null)).toEqual([]);
    expect(
      toReceivedVestingShares("alice", {
        outgoing_delegations: [],
        incoming_delegations: [],
      }),
    ).toEqual([]);
  });
});

describe("received-delegation queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConfigManager.setQueryClient(
      new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );
  });

  it.each([
    [
      "getReceivedVestingSharesQueryOptions",
      getReceivedVestingSharesQueryOptions,
      QueryKeys.wallet.receivedVestingShares("alice"),
    ],
    [
      "getHivePowerDelegatingsQueryOptions",
      getHivePowerDelegatingsQueryOptions,
      QueryKeys.assets.hivePowerDelegatings("alice"),
    ],
  ] as const)(
    "%s reads balance-api, never the Ecency endpoint, under its own key",
    async (_name, build, key) => {
      mockCallREST.mockResolvedValueOnce(DELEGATIONS);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const options = build("alice");
      expect(options.queryKey).toEqual(key);
      expect(options.enabled).toBe(true);
      expect(build("").enabled).toBe(false);

      const result = await (options.queryFn as () => Promise<unknown>)();

      expect(mockCallREST).toHaveBeenCalledWith(
        "balance",
        "/accounts/{account-name}/delegations",
        { "account-name": "alice" },
        undefined,
        undefined,
        expect.anything(),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result).toEqual(toReceivedVestingShares("alice", DELEGATIONS));
      fetchSpy.mockRestore();
    },
  );

  it("shares one balance-api request between the totals and the list", async () => {
    mockCallREST.mockResolvedValue(DELEGATIONS);

    await (
      getReceivedVestingSharesQueryOptions("alice")
        .queryFn as () => Promise<unknown>
    )();
    await (
      getHivePowerDelegatingsQueryOptions("alice")
        .queryFn as () => Promise<unknown>
    )();

    expect(mockCallREST).toHaveBeenCalledTimes(1);
  });
});
