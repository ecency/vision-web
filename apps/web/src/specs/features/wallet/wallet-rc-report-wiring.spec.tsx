import { useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";

// #2196: the wallet dialogs report a broadcast rejected for RC, as `transfer`.

const rcRejection = () =>
  new Error("Account: alice has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
// The form and the signer stand in for the user: submit the form, then the
// broadcast fails for RC.
vi.mock("@/features/wallet/operations", () => ({
  WalletOperationsTransfer: ({ onSubmit }: { onSubmit: (d: Record<string, unknown>) => void }) => {
    useEffect(() => {
      onSubmit({ from: "alice", to: "bob", amount: "1.000 HIVE" });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  },
  WalletOperationSign: ({ onSignError }: { onSignError: (e: Error) => void }) => {
    useEffect(() => {
      onSignError(rcRejection());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  },
  WalletOperationError: () => <div>sign-error</div>,
  WalletOperationPowerDown: () => null,
  WalletOperationSuccess: () => null,
  WalletOperationWithdrawRoutes: () => null,
  WalletOperationWithdrawRoutesForm: () => null
}));
vi.mock("@/features/market", () => ({ MarketSwapForm: () => null }));
vi.mock("@/features/shared/purchase-stripe/stripe-tiers", () => ({ isStripeEnabled: () => false }));

const delegate = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("@/api/sdk-mutations", () => ({ useDelegateVestingSharesMutation: () => delegate }));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getDynamicPropsQueryOptions: () => ({
    queryKey: ["dynamic-props"],
    queryFn: async () => ({ hivePerMVests: 500 })
  }),
  getHivePowerDelegatesInfiniteQueryOptions: () => ({
    queryKey: ["hp-delegates", "alice"],
    // Delegations made BY the profile owner (alice) to bob.
    queryFn: async () => [{ delegator: "alice", delegatee: "bob", vesting_shares: "1000.000000 VESTS" }]
  })
}));
vi.mock("@/features/shared", () => ({
  LinearProgress: () => null,
  ProfileLink: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserAvatar: () => null,
  error: vi.fn()
}));
// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { AssetOperation } from "@ecency/sdk";
import { ErrorTypes } from "@/enums";
import { error } from "@/features/shared";
import { WalletOperationsDialog } from "@/features/wallet/wallet-operations-dialog";
import { DelegatedVesting } from "@/app/(dynamicPages)/profile/[username]/wallet/(token)/hp/_components/delegated-vesting-dialog";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function expectOneTransferReport() {
  expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall", {
    level: "info",
    fingerprint: ["rc-shortfall"],
    tags: { "rc.stage": "rejected", "rc.op": "transfer" },
    user: { username: "alice" }
  });
}

beforeEach(() => {
  sentry.captureMessage.mockReset();
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: { username: "alice" },
    username: "alice",
    account: { name: "alice" },
    isLoading: false
  } as unknown as ReturnType<typeof useActiveAccount>);
});

describe("WalletOperationsDialog", () => {
  it("reports a signing rejected for RC as a transfer by the sending account", async () => {
    renderWithClient(
      <WalletOperationsDialog
        operation={AssetOperation.Transfer}
        asset="HIVE"
        to="bob"
        controlled={{ show: true, onHide: vi.fn() }}
      />
    );

    expect(await screen.findByText("sign-error")).toBeTruthy();
    expectOneTransferReport();
  });
});

describe("DelegatedVesting dialog", () => {
  // #2197: only the profile owner (the delegator) can undelegate these rows.
  it("shows Undelegate to the profile owner on the delegatee's row", async () => {
    delegate.mutateAsync.mockResolvedValue(undefined);
    renderWithClient(
      <DelegatedVesting username="alice" show={true} setShow={vi.fn()} totalDelegated="1 HP" />
    );

    await act(async () => {
      fireEvent.click(await screen.findByText("delegated-vesting.undelegate"));
    });

    expect(delegate.mutateAsync).toHaveBeenCalledWith({
      delegatee: "bob",
      vestingShares: "0.000000 VESTS"
    });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("does not show Undelegate to the delegatee viewing the owner's list", async () => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "bob" },
      username: "bob",
      account: { name: "bob" },
      isLoading: false
    } as unknown as ReturnType<typeof useActiveAccount>);
    renderWithClient(
      <DelegatedVesting username="alice" show={true} setShow={vi.fn()} totalDelegated="1 HP" />
    );

    expect(await screen.findByText("bob")).toBeTruthy();
    expect(screen.queryByText("delegated-vesting.undelegate")).toBeNull();
  });

  it("reports an undelegation rejected for RC as a transfer", async () => {
    delegate.mutateAsync.mockRejectedValue(rcRejection());
    renderWithClient(
      <DelegatedVesting username="alice" show={true} setShow={vi.fn()} totalDelegated="1 HP" />
    );

    const undelegate = await screen.findByText("delegated-vesting.undelegate");
    await act(async () => {
      fireEvent.click(undelegate);
    });

    expect(delegate.mutateAsync).toHaveBeenCalledWith({
      delegatee: "bob",
      vestingShares: "0.000000 VESTS"
    });
    expectOneTransferReport();
    // The failure is shown instead of being dropped as an unhandled rejection.
    expect(error).toHaveBeenCalledWith(
      "chain-error.insufficient-resource",
      ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS
    );
  });
});
