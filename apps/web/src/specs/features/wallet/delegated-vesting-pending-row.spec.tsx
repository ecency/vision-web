import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";

// #2198: an undelegation pending on one row shows on that row only, and a row
// undelegated leaves the list.

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
// The real hook's isPending is one flag for the whole mutation: true while
// any row's undelegation runs.
const delegate = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: true }));
vi.mock("@/api/sdk-mutations", () => ({ useDelegateVestingSharesMutation: () => delegate }));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getDynamicPropsQueryOptions: () => ({
    queryKey: ["dynamic-props"],
    queryFn: async () => ({ hivePerMVests: 500 })
  }),
  getHivePowerDelegatesInfiniteQueryOptions: () => ({
    queryKey: ["hp-delegates", "alice"],
    queryFn: async () => [
      { delegator: "alice", delegatee: "bob", vesting_shares: "2000.000000 VESTS" },
      { delegator: "alice", delegatee: "carol", vesting_shares: "1000.000000 VESTS" }
    ]
  })
}));
vi.mock("@/features/shared", () => ({
  LinearProgress: () => null,
  ProfileLink: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserAvatar: () => null,
  error: vi.fn()
}));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry: { captureMessage: vi.fn() } }));

import { DelegatedVesting } from "@/app/(dynamicPages)/profile/[username]/wallet/(token)/hp/_components/delegated-vesting-dialog";

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DelegatedVesting username="alice" show={true} setShow={vi.fn()} totalDelegated="1.5 HP" />
    </QueryClientProvider>
  );
}

const rowOf = (name: string) => screen.getByText(name).closest(".list-item") as HTMLElement;

beforeEach(() => {
  delegate.mutateAsync.mockReset();
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: { username: "alice" },
    username: "alice",
    account: { name: "alice" },
    isLoading: false
  } as unknown as ReturnType<typeof useActiveAccount>);
});

describe("DelegatedVesting rows (#2198)", () => {
  it("shows the pending state on the row being undelegated only", async () => {
    delegate.mutateAsync.mockReturnValue(new Promise(() => {}));
    renderDialog();
    await screen.findByText("bob");

    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });

    expect(within(rowOf("bob")).getByText("...")).toBeTruthy();
    expect(within(rowOf("carol")).getByText("delegated-vesting.undelegate")).toBeTruthy();
    // A second click on the pending row broadcasts nothing more.
    fireEvent.click(within(rowOf("bob")).getByText("..."));
    expect(delegate.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("drops the row once its undelegation succeeds", async () => {
    delegate.mutateAsync.mockResolvedValue(undefined);
    renderDialog();
    await screen.findByText("bob");

    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });

    expect(screen.queryByText("bob")).toBeNull();
    expect(within(rowOf("carol")).getByText("delegated-vesting.undelegate")).toBeTruthy();
  });

  it("offers Undelegate again when the undelegation fails", async () => {
    delegate.mutateAsync.mockRejectedValue(new Error("boom"));
    renderDialog();
    await screen.findByText("bob");

    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });

    expect(within(rowOf("bob")).getByText("delegated-vesting.undelegate")).toBeTruthy();
  });
});
