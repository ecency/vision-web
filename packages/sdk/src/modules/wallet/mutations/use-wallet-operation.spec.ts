import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseBroadcastMutation = vi.hoisted(() => vi.fn());
const invalidateQueries = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/mutations")>();
  return { ...actual, useBroadcastMutation: mockUseBroadcastMutation };
});

vi.mock("@/modules/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core")>();
  return { ...actual, getQueryClient: () => ({ invalidateQueries }) };
});

vi.mock("@/modules/analytics", () => ({
  EcencyAnalytics: { useRecordActivity: () => ({ mutateAsync: vi.fn() }) },
}));

import { QueryKeys } from "@/modules/core";
import { AssetOperation } from "../types";
import { useWalletOperation } from "./use-wallet-operation";

// #1973: the wallet links to pending savings withdrawals. After a withdrawal
// the list must refetch, or the new one only shows after a reload.
describe("useWalletOperation invalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseBroadcastMutation.mockReset();
    mockUseBroadcastMutation.mockReturnValue({});
    invalidateQueries.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function succeed(asset: string, operation: AssetOperation) {
    useWalletOperation("alice", asset, operation);
    const onSuccess = mockUseBroadcastMutation.mock.calls[0][3] as () => void;
    onSuccess();
    vi.runAllTimers();
    return invalidateQueries.mock.calls.map(([arg]) => arg.queryKey);
  }

  it.each(["HIVE", "HBD"])("refetches the pending withdrawals after a %s savings withdrawal", (asset) => {
    expect(succeed(asset, AssetOperation.WithdrawFromSavings)).toContainEqual(
      QueryKeys.wallet.savingsWithdraw("alice")
    );
  });

  it("leaves them alone for a plain transfer", () => {
    expect(succeed("HIVE", AssetOperation.Transfer)).not.toContainEqual(
      QueryKeys.wallet.savingsWithdraw("alice")
    );
  });
});
