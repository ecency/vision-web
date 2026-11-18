import "@testing-library/jest-dom";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AssetOperation } from "@ecency/sdk";
import { renderWithQueryClient } from "@/specs/test-utils";
import { WalletOperationsTransfer } from "@/features/wallet/operations/wallet-operations-transfer";

// The engine token details (and so its precision) arrive when this resolves.
const details = vi.hoisted(() => {
  let resolve: (v: unknown) => void = () => {};
  return {
    promise: undefined as Promise<unknown> | undefined,
    reset() {
      this.promise = new Promise((r) => (resolve = r));
    },
    resolve: (v: unknown) => resolve(v)
  };
});

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getAccountWalletAssetInfoQueryOptions: () => ({
      queryKey: ["spec", "asset-info"],
      queryFn: () => ({
        name: "ENG",
        title: "Engine token",
        price: 1,
        layer: "engine",
        accountBalance: 1.23456789,
        parts: [{ name: "liquid", balance: 1.23456789 }]
      })
    }),
    getDynamicPropsQueryOptions: () => ({
      queryKey: ["spec", "dynamic-props"],
      queryFn: () => actual.DEFAULT_DYNAMIC_PROPS
    }),
    getHiveEngineBalancesWithUsdQueryOptions: () => ({
      queryKey: ["spec", "engine-balances"],
      queryFn: () => details.promise
    })
  };
});

// The card's balance is a button that fills the amount.
vi.mock("@/features/wallet/operations/wallet-opearation-card", () => ({
  WalletOperationCard: ({ label, onBalanceClick }: { label: string; onBalanceClick?: () => void }) => (
    <button type="button" disabled={!onBalanceClick} onClick={() => onBalanceClick?.()}>
      {`balance-${label}`}
    </button>
  )
}));

function renderTransfer() {
  return renderWithQueryClient(
    <WalletOperationsTransfer
      asset="ENG"
      username="alice"
      to="bob"
      operation={AssetOperation.Transfer}
      showSubmit={true}
      onSubmit={() => {}}
    />
  );
}

describe("WalletOperationsTransfer: Hive Engine precision", () => {
  test("does not fill the amount before the token's precision is known, then fills it in full", async () => {
    details.reset();
    renderTransfer();
    const amount = (await screen.findByRole("spinbutton")) as HTMLInputElement;

    // Details still loading: the status says so and the balance cannot be used,
    // since a fallback of 3 decimals would cut 1.23456789 to 1.234.
    expect(await screen.findByText("transfer.token-details-loading")).toBeInTheDocument();
    fireEvent.click(screen.getByText("balance-from"));
    expect(Number(amount.value || 0)).toBe(0);

    await act(async () => {
      details.resolve([{ symbol: "ENG", precision: 8 }]);
    });
    await waitFor(() => expect(screen.queryByText("transfer.token-details-loading")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("balance-from")).toBeEnabled());

    fireEvent.click(screen.getByText("balance-from"));
    await waitFor(() => expect(Number(amount.value)).toBe(1.23456789));
  });

  test("says the details are unavailable when the lookup ends without the token", async () => {
    details.reset();
    renderTransfer();

    await act(async () => {
      details.resolve([]);
    });
    expect(await screen.findByText("transfer.token-details-unavailable")).toBeInTheDocument();
    expect(screen.getByText("balance-from")).toBeDisabled();
  });
});
