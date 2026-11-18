import "@testing-library/jest-dom";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { WalletOperationPowerDown } from "@/features/wallet/operations/wallet-operation-power-down";

// 1 MVESTS = 500 HP, so 1 VESTS = 0.0005 HP.
const HIVE_PER_MVESTS = 500;

// The SDK fallback (no portfolio) rounds each HP figure to 3 decimals on its
// own: 100.0008 HP held shows as 100.001 and 20.0003 HP delegated as 20.000.
const fallbackParts = vi.hoisted(() => ({
  name: "HP",
  title: "Hive Power",
  price: 0.3,
  accountBalance: 100.001,
  parts: [
    { name: "hp_balance", balance: 100.001 },
    { name: "outgoing_delegations", balance: 20 }
  ]
}));

const account = vi.hoisted(() => ({
  name: "alice",
  vesting_shares: "200001.600000 VESTS", // 100.0008 HP
  delegated_vesting_shares: "40000.600000 VESTS", // 20.0003 HP
  received_vesting_shares: "0.000000 VESTS",
  vesting_withdraw_rate: "0.000000 VESTS",
  to_withdraw: "0",
  withdrawn: "0",
  next_vesting_withdrawal: "1969-12-31T23:59:59"
}));

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getAccountWalletAssetInfoQueryOptions: () => ({
      queryKey: ["spec", "asset-info"],
      queryFn: () => fallbackParts
    }),
    getDynamicPropsQueryOptions: () => ({
      queryKey: ["spec", "dynamic-props"],
      queryFn: () => ({ ...actual.DEFAULT_DYNAMIC_PROPS, hivePerMVests: HIVE_PER_MVESTS })
    }),
    getAccountFullQueryOptions: () => ({
      queryKey: ["spec", "account"],
      queryFn: () => account
    })
  };
});

vi.mock("@/features/wallet/operations/wallet-opearation-card", () => ({
  WalletOperationCard: () => null
}));

describe("WalletOperationPowerDown", () => {
  test("caps the amount from the account's VESTS, not the separately rounded HP parts", async () => {
    renderWithQueryClient(
      <WalletOperationPowerDown username="alice" asset="HP" showSubmit={true} onSubmit={() => {}} />
    );

    // 100.0008 - 20.0003 = 80.0005 HP: the largest 0.001 step within it is
    // 80.000. The rounded parts would give 80.001, more than is available.
    const input = (await screen.findByRole("spinbutton")) as HTMLInputElement;
    await waitFor(() => expect(Number(input.value)).toBe(80));
  });
});
