import React from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getAccountRcQueryOptions, getRcStatsQueryOptions } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ResourceCreditsInfo } from "@/app/(dynamicPages)/profile/[username]/_components/rc-info";
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

    await waitFor(() => expect(screen.getByText(`: ${ALICE_RC}`)).toBeInTheDocument());
    expect(screen.queryByText(`: ${BOB_RC}`)).not.toBeInTheDocument();
  });

  it("rejects an amount above the sender's RC even when the visited account has it", async () => {
    await openDelegateOnBobsProfile();
    await screen.findByText(`: ${ALICE_RC}`);

    fireEvent.change(screen.getByPlaceholderText("transfer.amount-placeholder"), {
      target: { value: String(ALICE_RC * 2) }
    });

    expect(screen.getByText("rc-info.insufficient-rc-error")).toBeInTheDocument();
  });

  it("defaults the recipient to the profile being visited", async () => {
    await openDelegateOnBobsProfile();

    expect(screen.getByPlaceholderText("transfer.to-placeholder")).toHaveValue("bob");
  });

  // #2073
  it("does not crash when the user logs out while the delegate form is open", async () => {
    const view = await openDelegateOnBobsProfile();
    await screen.findByText(`: ${ALICE_RC}`);

    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: null,
      username: null
    } as unknown as ActiveAccount);
    view.rerender(<ResourceCreditsInfo rcPercent={50} account={mockFullAccount({ name: "bob" })} />);

    expect(screen.queryByPlaceholderText("transfer.amount-placeholder")).not.toBeInTheDocument();
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
    await screen.findByText(`: ${ALICE_RC}`);
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("transfer.amount-placeholder"), {
        target: { value: "10000000000" }
      });
    });

    expect(screen.getByPlaceholderText("transfer.to-placeholder")).toHaveValue("");
    expect(screen.getByText("g.next").closest("button")).toBeDisabled();
  });
});
