import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseBroadcastMutation = vi.hoisted(() => vi.fn());
const mockInvalidate = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/mutations")>();
  return {
    ...actual,
    useBroadcastMutation: mockUseBroadcastMutation,
    invalidateAfterBroadcast: mockInvalidate
  };
});

import { useDelegateVestingShares } from "./use-delegate-vesting-shares";
import { getHivePowerDelegatesInfiniteQueryOptions } from "../queries/get-hive-power-delegates-query-options";
import { QueryKeys } from "@/modules/core";
import type { AuthContextV2, PlatformAdapter } from "@/modules/core/types";

describe("useDelegateVestingShares", () => {
  beforeEach(() => {
    mockUseBroadcastMutation.mockReset();
    mockUseBroadcastMutation.mockReturnValue({});
    mockInvalidate.mockReset();
    mockInvalidate.mockResolvedValue(undefined);
  });

  // #2198: after an undelegation the delegator's delegations list drops the
  // row, instead of offering Undelegate again on a delegation that is gone.
  it("refreshes the delegator's delegations list after the broadcast", async () => {
    const auth: AuthContextV2 = { adapter: {} as PlatformAdapter };
    useDelegateVestingShares("alice", auth, "sync");
    const onSuccess = mockUseBroadcastMutation.mock.calls[0][3];

    await onSuccess({}, { delegatee: "bob", vestingShares: "0.000000 VESTS" });

    const [, mode, keys] = mockInvalidate.mock.calls[0];
    expect(mode).toBe("sync");
    expect(keys).toContainEqual(QueryKeys.assets.hivePowerDelegates("alice"));
    // The list the HP dialog reads is under that same key.
    expect(getHivePowerDelegatesInfiniteQueryOptions("alice", 1000).queryKey).toEqual(
      QueryKeys.assets.hivePowerDelegates("alice")
    );
  });
});
