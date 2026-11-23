import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const BOB = { delegator: "alice", delegatee: "bob", vesting_shares: "2000.000000 VESTS" };
const CAROL = { delegator: "alice", delegatee: "carol", vesting_shares: "1000.000000 VESTS" };
const rows = vi.hoisted(() => ({ current: [] as unknown[], fetches: 0 }));
vi.mock("@/api/sdk-mutations", () => ({ useDelegateVestingSharesMutation: () => delegate }));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getDynamicPropsQueryOptions: () => ({
    queryKey: ["dynamic-props"],
    queryFn: async () => ({ hivePerMVests: 500 })
  }),
  getHivePowerDelegatesInfiniteQueryOptions: () => ({
    queryKey: ["hp-delegates", "alice"],
    queryFn: async () => {
      rows.fetches++;
      return rows.current;
    }
  })
}));
vi.mock("@/features/shared", () => ({
  LinearProgress: () => null,
  ProfileLink: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserAvatar: () => null,
  error: vi.fn()
}));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry: { captureMessage: vi.fn() } }));

import { notifyUnsettledSigning } from "@/providers/sdk/unsettled-signing";
import { DelegatedVesting } from "@/app/(dynamicPages)/profile/[username]/wallet/(token)/hp/_components/delegated-vesting-dialog";

// The operations the SDK builds for alice undelegating `delegatee`.
const undelegateOps = (delegatee: string, delegator = "alice") =>
  [["delegate_vesting_shares", { delegator, delegatee, vesting_shares: "0.000000 VESTS" }]] as never;

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (show: boolean) => (
    <QueryClientProvider client={queryClient}>
      <DelegatedVesting username="alice" show={show} setShow={vi.fn()} totalDelegated="1.5 HP" />
    </QueryClientProvider>
  );
  const view = render(ui(true));
  return { queryClient, setShow: (show: boolean) => view.rerender(ui(show)), unmount: view.unmount };
}

const rowOf = (name: string) => screen.getByText(name).closest(".list-item") as HTMLElement;

beforeEach(() => {
  rows.current = [BOB, CAROL];
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

  const undelegateBob = async () => {
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });
    expect(screen.queryByText("bob")).toBeNull();
  };
  const refresh = async (queryClient: QueryClient, data: unknown[]) => {
    await act(async () => {
      queryClient.setQueryData(["hp-delegates", "alice"], data);
      // The query batches its notifications: let this refresh render on its own.
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  };

  it("keeps the row hidden while the list still holds it", async () => {
    delegate.mutateAsync.mockResolvedValue(undefined);
    const { queryClient } = renderDialog();
    await screen.findByText("bob");
    await undelegateBob();

    await refresh(queryClient, [BOB, CAROL]);

    expect(await screen.findByText("carol")).toBeTruthy();
    expect(screen.queryByText("bob")).toBeNull();
  });

  it("shows a new delegation of the same amount once a refresh dropped the old one", async () => {
    delegate.mutateAsync.mockResolvedValue(undefined);
    const { queryClient } = renderDialog();
    await screen.findByText("bob");
    await undelegateBob();

    await refresh(queryClient, [CAROL]);
    await refresh(queryClient, [BOB, CAROL]);

    expect(await screen.findByText("bob")).toBeTruthy();
  });

  it("shows a new delegation of the same amount when the refresh landed before the broadcast resolved", async () => {
    // Sync mode: the SDK awaits the refetch before the mutation resolves.
    const { queryClient } = renderDialog();
    delegate.mutateAsync.mockImplementation(async () => {
      queryClient.setQueryData(["hp-delegates", "alice"], [CAROL]);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await screen.findByText("bob");
    await undelegateBob();
    // Let the broadcast resolve, after the refreshed list rendered.
    await act(async () => {
      await delegate.mutateAsync.mock.results[0].value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await refresh(queryClient, [BOB, CAROL]);

    expect(await screen.findByText("bob")).toBeTruthy();
  });

  it("shows the row again when the undelegation never lands", async () => {
    // The transaction expires 60s after signing; past that, a list that
    // still holds the delegation means it did not go through.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      delegate.mutateAsync.mockResolvedValue(undefined);
      renderDialog();
      await screen.findByText("bob");
      await undelegateBob();

      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.queryByText("bob")).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(40_000);
      });

      expect(within(await screen.findByText("bob").then(() => rowOf("bob"))).getByText("delegated-vesting.undelegate")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads nothing more once unmounted before the expiry check", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      delegate.mutateAsync.mockResolvedValue(undefined);
      const { unmount } = renderDialog();
      await screen.findByText("bob");
      await undelegateBob();
      const before = rows.fetches;

      unmount();
      vi.advanceTimersByTime(70_000);

      expect(rows.fetches).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers Undelegate again when a late success from an earlier opening never lands", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let succeed: () => void = () => {};
      delegate.mutateAsync.mockReturnValue(new Promise<void>((resolve) => (succeed = resolve)));
      const { setShow } = renderDialog();
      await screen.findByText("bob");
      await act(async () => {
        fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
      });
      await act(async () => setShow(false));
      await act(async () => setShow(true));
      await act(async () => succeed());
      expect(within(rowOf("bob")).getByText("...")).toBeTruthy();

      await act(async () => {
        vi.advanceTimersByTime(70_000);
      });

      // The query's notifications run on a timer too.
      await waitFor(() => expect(within(rowOf("bob")).getByText("delegated-vesting.undelegate")).toBeTruthy());
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a new delegation of another amount at once", async () => {
    delegate.mutateAsync.mockResolvedValue(undefined);
    const { queryClient } = renderDialog();
    await screen.findByText("bob");
    await undelegateBob();

    await refresh(queryClient, [{ ...BOB, vesting_shares: "5000.000000 VESTS" }, CAROL]);

    expect(await screen.findByText("bob")).toBeTruthy();
  });

  it("keeps the row hidden when the dialog is reopened before the list refreshes", async () => {
    delegate.mutateAsync.mockResolvedValue(undefined);
    const { setShow } = renderDialog();
    await screen.findByText("bob");
    await undelegateBob();

    await act(async () => setShow(false));
    await act(async () => setShow(true));

    expect(await screen.findByText("carol")).toBeTruthy();
    expect(screen.queryByText("bob")).toBeNull();
  });

  it("offers Undelegate again on reopening after a signing handed elsewhere, which never settles", async () => {
    // Any login: the auth upgrade can route an active op to HiveSigner.
    delegate.mutateAsync.mockImplementation(() => {
      notifyUnsettledSigning(undelegateOps("bob"));
      return new Promise(() => {});
    });
    const { setShow } = renderDialog();
    await screen.findByText("bob");
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });
    expect(within(rowOf("bob")).getByText("...")).toBeTruthy();

    await act(async () => setShow(false));
    await act(async () => setShow(true));

    expect(within(await screen.findByText("bob").then(() => rowOf("bob"))).getByText("delegated-vesting.undelegate")).toBeTruthy();
  });

  it("keeps a request in flight pending across a reopen", async () => {
    delegate.mutateAsync.mockReturnValue(new Promise(() => {}));
    const { setShow } = renderDialog();
    await screen.findByText("bob");
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });

    await act(async () => setShow(false));
    await act(async () => setShow(true));

    await screen.findByText("bob");
    expect(within(rowOf("bob")).getByText("...")).toBeTruthy();
    fireEvent.click(within(rowOf("bob")).getByText("..."));
    expect(delegate.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("does not let an earlier opening's success change a later opening", async () => {
    let succeed: () => void = () => {};
    delegate.mutateAsync.mockReturnValue(new Promise<void>((resolve) => (succeed = resolve)));
    const { queryClient, setShow } = renderDialog();
    await screen.findByText("bob");
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });
    await act(async () => setShow(false));
    await act(async () => setShow(true));
    await screen.findByText("bob");
    const subtitle = document.querySelector(".text-gray-600")?.textContent;

    await act(async () => succeed());

    // Still listed, still not offered, the subtitle as it was.
    expect(within(rowOf("bob")).getByText("...")).toBeTruthy();
    expect(document.querySelector(".text-gray-600")?.textContent).toBe(subtitle);
    // A refresh without it ends the wait; a later delegation shows as usual.
    await refresh(queryClient, [CAROL]);
    expect(screen.queryByText("bob")).toBeNull();
    await refresh(queryClient, [BOB, CAROL]);
    expect(within(await screen.findByText("bob").then(() => rowOf("bob"))).getByText("delegated-vesting.undelegate")).toBeTruthy();
  });

  it("keeps the row pending when another operation is handed elsewhere", async () => {
    delegate.mutateAsync.mockReturnValue(new Promise(() => {}));
    const { setShow } = renderDialog();
    await screen.findByText("bob");
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });

    await act(async () => {
      notifyUnsettledSigning(undelegateOps("carol"));
      notifyUnsettledSigning(undelegateOps("bob", "mallory"));
      notifyUnsettledSigning([["vote", { voter: "alice", author: "bob", permlink: "p", weight: 1 }]] as never);
      // Another operation naming the same delegator and delegatee.
      notifyUnsettledSigning([["custom_op", { delegator: "alice", delegatee: "bob" }]] as never);
    });
    await act(async () => setShow(false));
    await act(async () => setShow(true));

    await screen.findByText("bob");
    expect(within(rowOf("bob")).getByText("...")).toBeTruthy();
  });

  it("releases only the row whose undelegation was handed elsewhere", async () => {
    delegate.mutateAsync.mockReturnValue(new Promise(() => {}));
    const { setShow } = renderDialog();
    await screen.findByText("bob");
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
      fireEvent.click(within(rowOf("carol")).getByText("delegated-vesting.undelegate"));
    });

    await act(async () => notifyUnsettledSigning(undelegateOps("bob")));
    await act(async () => setShow(false));
    await act(async () => setShow(true));

    await screen.findByText("bob");
    expect(within(rowOf("bob")).getByText("delegated-vesting.undelegate")).toBeTruthy();
    expect(within(rowOf("carol")).getByText("...")).toBeTruthy();
  });

  it("offers Undelegate on the next opening when the hand-off came after closing", async () => {
    delegate.mutateAsync.mockReturnValue(new Promise(() => {}));
    const { setShow } = renderDialog();
    await screen.findByText("bob");
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });
    await act(async () => setShow(false));

    await act(async () => notifyUnsettledSigning(undelegateOps("bob")));
    await act(async () => setShow(true));

    await screen.findByText("bob");
    expect(within(rowOf("bob")).getByText("delegated-vesting.undelegate")).toBeTruthy();
  });

  it("keeps a retry pending when the abandoned attempt settles late", async () => {
    let failFirst: (e: Error) => void = () => {};
    delegate.mutateAsync
      .mockImplementationOnce(() => {
        notifyUnsettledSigning(undelegateOps("bob"));
        return new Promise((_, reject) => (failFirst = reject));
      })
      .mockReturnValueOnce(new Promise(() => {}));
    const { setShow } = renderDialog();
    await screen.findByText("bob");
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });
    await act(async () => setShow(false));
    await act(async () => setShow(true));
    await act(async () => {
      fireEvent.click(within(rowOf("bob")).getByText("delegated-vesting.undelegate"));
    });

    await act(async () => failFirst(new Error("closed")));

    expect(within(rowOf("bob")).getByText("...")).toBeTruthy();
  });

  it("moves back a page when the last row of the last page is undelegated", async () => {
    delegate.mutateAsync.mockResolvedValue(undefined);
    rows.current = Array.from({ length: 9 }, (_, i) => ({
      delegator: "alice",
      delegatee: `user${i}`,
      vesting_shares: `${9000 - i * 100}.000000 VESTS`
    }));
    renderDialog();
    await screen.findByText("user0");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "2" }));
    });
    await screen.findByText("user8");

    await act(async () => {
      fireEvent.click(within(rowOf("user8")).getByText("delegated-vesting.undelegate"));
    });

    expect(screen.queryByText("user8")).toBeNull();
    expect(await screen.findByText("user0")).toBeTruthy();
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
