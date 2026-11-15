import React from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getAccountRcQueryOptions, getRcStatsQueryOptions } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ResourceCreditsInfo } from "@/app/(dynamicPages)/profile/[username]/_components/rc-info";
import {
  DELEGATE_RC_TX_RESERVE,
  getDelegatableRc
} from "@/app/(dynamicPages)/profile/[username]/_components/rc-delegation/delegatable-rc";
import { formatError } from "@/api/format-error";
import { mockFullAccount, renderWithQueryClient, setupModalContainers } from "@/specs/test-utils";

// Visiting someone else's profile, RC info -> "Delegate": the form signs as the
// logged in user but showed and checked against the VISITED account's RC. You
// can only delegate your own RC, so the balance is the sender's, and the
// recipient defaults to the profile you are on.

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@/api/sdk-mutations", () => ({
  useDelegateRcMutation: () => ({ mutateAsync: vi.fn() })
}));

vi.mock("@/app/(dynamicPages)/profile/[username]/_components/claim-account-credit", () => ({
  ClaimAccountCredit: () => null
}));

// The setters rc-info hands the delegations list.
interface ListProps {
  showDelegation: () => void;
  setShowDelegationsList: (v: boolean) => void;
  setAmountFromList: (v: string) => void;
  setToFromList: (v: string) => void;
  setDelegateeData: (v: unknown) => void;
}

type ActiveAccount = ReturnType<typeof useActiveAccount>;

// The list's own "edit" action, as rc-delegations-list calls it on a row.
vi.mock("@/app/(dynamicPages)/profile/[username]/_components/rc-delegations-list", () => ({
  RcDelegationsList: (props: ListProps) => (
    <button
      onClick={() => {
        props.setShowDelegationsList(false);
        props.showDelegation();
        props.setAmountFromList("30000000000");
        props.setToFromList("carol");
        props.setDelegateeData({ name: "carol" });
      }}
    >
      edit-carol
    </button>
  ),
  ConfirmDelete: () => null
}));

const ALICE_RC = 20_000_000_000; // the logged in sender
// Her mana is full and all her own: current mana is the binding term, so the
// transaction's RC reserve comes off it.
const ALICE_DELEGATABLE = ALICE_RC - DELEGATE_RC_TX_RESERVE;
const BOB_RC = 900_000_000_000; // the visited profile

function rcAccount(account: string, mana: number) {
  return [
    {
      account,
      rc_manabar: { current_mana: String(mana), last_update_time: 0 },
      max_rc: String(mana),
      delegated_rc: 0,
      received_delegated_rc: 0
    }
  ];
}

describe("RC delegate from another user's profile", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "alice" },
      username: "alice"
    } as unknown as ActiveAccount);
    vi.mocked(getAccountRcQueryOptions).mockImplementation(
      (username: string) =>
        ({
          queryKey: ["resource-credits", "account", username],
          queryFn: async () => rcAccount(username, username === "alice" ? ALICE_RC : BOB_RC)
        }) as unknown as ReturnType<typeof getAccountRcQueryOptions>
    );
    vi.mocked(getRcStatsQueryOptions).mockImplementation(
      () =>
        ({
          queryKey: ["resource-credits", "stats"],
          queryFn: async () => ({
            ops: {
              comment_operation: { avg_cost: 1 },
              transfer_operation: { avg_cost: 1 },
              vote_operation: { avg_cost: 1 },
              custom_json_operation: { avg_cost: 1 },
              claim_account_operation: { avg_cost: 1 }
            }
          })
        }) as unknown as ReturnType<typeof getRcStatsQueryOptions>
    );
  });

  function renderProfile(name: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderWithQueryClient(
      <ResourceCreditsInfo rcPercent={50} account={mockFullAccount({ name })} />,
      { queryClient }
    );
  }

  async function openDelegateOnBobsProfile() {
    const view = renderProfile("bob");
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByText("rc-info.delegation-button"));
    return view;
  }

  it("shows the logged in user's RC as the balance, not the visited account's", async () => {
    await openDelegateOnBobsProfile();

    await waitFor(() => expect(screen.getByText(`: ${ALICE_DELEGATABLE}`)).toBeInTheDocument());
    expect(screen.queryByText(`: ${BOB_RC}`)).not.toBeInTheDocument();
  });

  it("rejects an amount above the sender's RC even when the visited account has it", async () => {
    await openDelegateOnBobsProfile();
    await screen.findByText(`: ${ALICE_DELEGATABLE}`);

    fireEvent.change(screen.getByPlaceholderText("transfer.amount-placeholder"), {
      target: { value: String(ALICE_RC * 2) }
    });

    expect(screen.getByText("rc-info.insufficient-rc-error")).toBeInTheDocument();
  });

  // Screenshot pass (#2075): the amount input showed no invalid border next to
  // the error, and the error sat out of line with the balance line.
  it("marks the amount invalid and lines the error up with the balance", async () => {
    await openDelegateOnBobsProfile();
    const balance = await screen.findByText(`: ${ALICE_DELEGATABLE}`);
    const input = screen.getByPlaceholderText("transfer.amount-placeholder");
    expect(input).not.toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: String(ALICE_RC * 2) } });

    expect(input).toHaveAttribute("aria-invalid", "true");
    const errorColumn = screen.getByText("rc-info.insufficient-rc-error").parentElement!;
    const balanceColumn = balance.closest(".balance")!.parentElement!;
    expect(errorColumn.className).toBe(balanceColumn.className);

    fireEvent.change(input, { target: { value: "" } });
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("defaults the recipient to the profile being visited", async () => {
    await openDelegateOnBobsProfile();

    expect(screen.getByPlaceholderText("transfer.to-placeholder")).toHaveValue("bob");
  });

  // #2073
  it("does not crash when the user logs out while the delegate form is open", async () => {
    const view = await openDelegateOnBobsProfile();
    await screen.findByText(`: ${ALICE_DELEGATABLE}`);

    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: null,
      username: null
    } as unknown as ActiveAccount);
    view.rerender(<ResourceCreditsInfo rcPercent={50} account={mockFullAccount({ name: "bob" })} />);

    expect(screen.queryByPlaceholderText("transfer.amount-placeholder")).not.toBeInTheDocument();
  });

  // #2073: logging out must close the form, not just hide it, or signing in
  // again on the same mounted page reopens it with the old recipient/amount.
  // Pins the Modal onHide reset that the `show && activeUser` guard relies on.
  it("stays closed when the user signs in again after logging out", async () => {
    const view = await openDelegateOnBobsProfile();
    await screen.findByText(`: ${ALICE_DELEGATABLE}`);
    fireEvent.change(screen.getByPlaceholderText("transfer.amount-placeholder"), {
      target: { value: "10000000000" }
    });

    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: null,
      username: null
    } as unknown as ActiveAccount);
    view.rerender(<ResourceCreditsInfo rcPercent={50} account={mockFullAccount({ name: "bob" })} />);

    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "alice" },
      username: "alice"
    } as unknown as ActiveAccount);
    view.rerender(<ResourceCreditsInfo rcPercent={50} account={mockFullAccount({ name: "bob" })} />);

    // The modal unmounts after its exit transition; without the fix it never
    // closes, because the open flag survived the logout.
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("transfer.amount-placeholder")).not.toBeInTheDocument()
    );

    // Opening Delegate again starts clean.
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByText("rc-info.delegation-button"));
    expect(await screen.findByPlaceholderText("transfer.amount-placeholder")).toHaveValue("");
  });

  // #2075: hived's delegate_rc evaluator caps a delegation at
  //   min(get_maximum_rc(only_delegable=true), rc_manabar.current_mana)
  // where only_delegable leaves out rc_adjustment and received_rc. RC that others
  // delegated to the sender can not be delegated on.
  describe("delegatable balance (#2075)", () => {
    const B = 1_000_000_000;
    const NOW_S = 1_800_000_000;

    // Mana was last updated "now": no regeneration on top of current_mana.
    beforeEach(() => {
      vi.spyOn(Date, "now").mockReturnValue(NOW_S * 1000);
    });
    afterEach(() => {
      vi.mocked(Date.now).mockRestore();
    });

    function senderRc(rc: { mana: number; maxRc: number; received: number; adjustment?: number }) {
      vi.mocked(getAccountRcQueryOptions).mockImplementation(
        (username: string) =>
          ({
            queryKey: ["resource-credits", "account", username],
            queryFn: async () =>
              username === "alice"
                ? [
                    {
                      account: "alice",
                      rc_manabar: { current_mana: String(rc.mana), last_update_time: NOW_S },
                      max_rc: String(rc.maxRc),
                      max_rc_creation_adjustment: {
                        amount: String(rc.adjustment ?? 0),
                        precision: 6,
                        nai: "@@000000037"
                      },
                      delegated_rc: 0,
                      received_delegated_rc: rc.received
                    }
                  ]
                : rcAccount(username, BOB_RC)
          }) as unknown as ReturnType<typeof getAccountRcQueryOptions>
      );
    }

    it("leaves received RC and the creation adjustment out of the balance", async () => {
      // Own 20B, plus 5B received and 2B creation adjustment; mana is full.
      senderRc({ mana: 27 * B, maxRc: 27 * B, received: 5 * B, adjustment: 2 * B });
      await openDelegateOnBobsProfile();

      expect(await screen.findByText(`: ${20 * B}`)).toBeInTheDocument();
      expect(screen.queryByText(`: ${32 * B}`)).not.toBeInTheDocument();
    });

    it("is capped by current mana, less the transaction's RC, when that is lower than own RC", async () => {
      senderRc({ mana: 12 * B, maxRc: 25 * B, received: 5 * B });
      await openDelegateOnBobsProfile();

      expect(await screen.findByText(`: ${12 * B - DELEGATE_RC_TX_RESERVE}`)).toBeInTheDocument();
    });

    // Delegating all of current mana leaves nothing to pay for the
    // custom_json itself, and the broadcast fails.
    it("rejects delegating every last unit of current mana", async () => {
      senderRc({ mana: 12 * B, maxRc: 25 * B, received: 5 * B });
      await openDelegateOnBobsProfile();
      await screen.findByText(`: ${12 * B - DELEGATE_RC_TX_RESERVE}`);
      const amountInput = screen.getByPlaceholderText("transfer.amount-placeholder");

      fireEvent.change(amountInput, { target: { value: String(12 * B) } });
      expect(screen.getByText("rc-info.insufficient-rc-error")).toBeInTheDocument();

      fireEvent.change(amountInput, { target: { value: String(12 * B - DELEGATE_RC_TX_RESERVE) } });
      expect(screen.queryByText("rc-info.insufficient-rc-error")).not.toBeInTheDocument();
    });

    it("keeps no reserve off own RC when mana is well above it", async () => {
      // Own 20B, mana 25B: 5B of mana is left after the delegation.
      senderRc({ mana: 25 * B, maxRc: 25 * B, received: 5 * B });
      await openDelegateOnBobsProfile();

      expect(await screen.findByText(`: ${20 * B}`)).toBeInTheDocument();
    });

    // hived sums the delegation over every delegatee of a comma separated list.
    it("checks the amount times the number of delegatees against the limit", async () => {
      senderRc({ mana: 25 * B, maxRc: 25 * B, received: 5 * B });
      await openDelegateOnBobsProfile();
      await screen.findByText(`: ${20 * B}`);

      fireEvent.change(screen.getByPlaceholderText("transfer.to-placeholder"), {
        target: { value: "carol,dave" }
      });
      fireEvent.change(screen.getByPlaceholderText("transfer.amount-placeholder"), {
        target: { value: String(15 * B) }
      });
      expect(screen.getByText("rc-info.insufficient-rc-error")).toBeInTheDocument();
      expect(screen.getByText("g.next").closest("button")).toBeDisabled();

      fireEvent.change(screen.getByPlaceholderText("transfer.amount-placeholder"), {
        target: { value: String(10 * B) }
      });
      expect(screen.queryByText("rc-info.insufficient-rc-error")).not.toBeInTheDocument();

      // A third delegatee makes the same amount too much.
      fireEvent.change(screen.getByPlaceholderText("transfer.to-placeholder"), {
        target: { value: "carol,dave,erin" }
      });
      expect(screen.getByText("rc-info.insufficient-rc-error")).toBeInTheDocument();
    });

    it("rejects an amount between the delegatable RC and the old inflated balance", async () => {
      senderRc({ mana: 25 * B, maxRc: 25 * B, received: 5 * B });
      await openDelegateOnBobsProfile();
      await screen.findByText(`: ${20 * B}`);

      fireEvent.change(screen.getByPlaceholderText("transfer.amount-placeholder"), {
        target: { value: String(25 * B) }
      });

      expect(screen.getByText("rc-info.insufficient-rc-error")).toBeInTheDocument();
    });
  });

  describe("getDelegatableRc (#2075)", () => {
    const rc = (mana: number, maxRc: number, received: number, lastUpdate: number) => ({
      rc_manabar: { current_mana: String(mana), last_update_time: lastUpdate },
      max_rc: String(maxRc),
      max_rc_creation_adjustment: { amount: "0", precision: 6, nai: "@@000000037" },
      received_delegated_rc: received
    });

    it("regenerates mana to now, never past max_rc, then caps at own RC", () => {
      // Half a regeneration window (2.5 days) after 0 mana: half of max_rc.
      expect(getDelegatableRc(rc(0, 100, 0, 0), 216_000 * 1000, 0)).toBe(50);
      // Long after: full, capped at max_rc, then at own RC (100 - 30 received).
      expect(getDelegatableRc(rc(0, 100, 30, 0), 10_000_000 * 1000, 0)).toBe(70);
    });

    it("keeps the reserve in current mana", () => {
      expect(getDelegatableRc(rc(50, 100, 0, 1000), 1000 * 1000, 10)).toBe(40);
      // Own RC binds and leaves more than the reserve in mana: no change.
      expect(getDelegatableRc(rc(100, 100, 50, 1000), 1000 * 1000, 10)).toBe(50);
    });

    it("is never negative", () => {
      expect(getDelegatableRc(rc(0, 10, 50, 1000), 1000 * 1000)).toBe(0);
    });

    it("maps hived's delegate_rc shortfall to the insufficient RC message", () => {
      const [message] = formatError(
        new Error("Assert Exception:from_delegable_rc >= delta_total: Account alice has insufficient RC (have 1, needs 2)")
      );
      expect(message).toBe("chain-error.insufficient-resource");
    });
  });

  // Changing an existing delegation needs only the difference (hived subtracts
  // the RC already delegated to that recipient from the new amount).
  it("lets an edit raise a delegation by up to the delegatable RC", async () => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "alice" },
      username: "alice"
    } as unknown as ActiveAccount);
    renderProfile("alice");
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByText(/rc-info.delegated/));
    fireEvent.click(await screen.findByText("edit-carol"));
    await screen.findByText(`: ${ALICE_DELEGATABLE}`);
    const amountInput = screen.getByPlaceholderText("transfer.amount-placeholder");

    // carol has 30B, alice can delegate 19B more: 49B is the most.
    const most = 30_000_000_000 + ALICE_DELEGATABLE;
    fireEvent.change(amountInput, { target: { value: String(most) } });
    expect(screen.queryByText("rc-info.insufficient-rc-error")).not.toBeInTheDocument();

    fireEvent.change(amountInput, { target: { value: String(most + 1) } });
    expect(screen.getByText("rc-info.insufficient-rc-error")).toBeInTheDocument();
  });

  // Editing carol's 30B delegation into "carol,dave": carol needs only the
  // difference, dave the full amount.
  it("counts the existing delegation of the edited delegatee in a list", async () => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "alice" },
      username: "alice"
    } as unknown as ActiveAccount);
    renderProfile("alice");
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByText(/rc-info.delegated/));
    fireEvent.click(await screen.findByText("edit-carol"));
    await screen.findByText(`: ${ALICE_DELEGATABLE}`);

    fireEvent.change(screen.getByPlaceholderText("transfer.to-placeholder"), {
      target: { value: "carol,dave" }
    });
    const amountInput = screen.getByPlaceholderText("transfer.amount-placeholder");
    // 2 x amount - 30B <= 19B  =>  amount <= 24.5B
    const most = (30_000_000_000 + ALICE_DELEGATABLE) / 2;
    fireEvent.change(amountInput, { target: { value: String(most) } });
    expect(screen.queryByText("rc-info.insufficient-rc-error")).not.toBeInTheDocument();
    fireEvent.change(amountInput, { target: { value: String(most + 1) } });
    expect(screen.getByText("rc-info.insufficient-rc-error")).toBeInTheDocument();
  });

  // #2074
  it("starts a fresh delegation with no recipient after editing one from the list", async () => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "alice" },
      username: "alice"
    } as unknown as ActiveAccount);
    renderProfile("alice");

    // RC info -> outgoing list -> edit carol's delegation -> close the form.
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByText(/rc-info.delegated/));
    fireEvent.click(await screen.findByText("edit-carol"));
    expect(await screen.findByPlaceholderText("transfer.to-placeholder")).toHaveValue("carol");
    const delegateDialog = screen
      .getByPlaceholderText("transfer.to-placeholder")
      .closest(".transfer-dialog") as HTMLElement;
    fireEvent.click(within(delegateDialog).getByLabelText("g.close"));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("transfer.to-placeholder")).not.toBeInTheDocument()
    );

    // A fresh Delegate from RC info.
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByText("rc-info.delegation-button"));
    await screen.findByText(`: ${ALICE_DELEGATABLE}`);
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("transfer.amount-placeholder"), {
        target: { value: "10000000000" }
      });
    });

    expect(screen.getByPlaceholderText("transfer.to-placeholder")).toHaveValue("");
    expect(screen.getByText("g.next").closest("button")).toBeDisabled();
  });
});
