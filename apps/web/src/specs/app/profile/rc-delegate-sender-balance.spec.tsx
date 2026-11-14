import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/app/(dynamicPages)/profile/[username]/_components/rc-delegations-list", () => ({
  RcDelegationsList: () => null,
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
    } as any);
    vi.mocked(getAccountRcQueryOptions).mockImplementation(
      (username: string) =>
        ({
          queryKey: ["resource-credits", "account", username],
          queryFn: async () => rcAccount(username, username === "alice" ? ALICE_RC : BOB_RC)
        }) as any
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
        }) as any
    );
  });

  async function openDelegateOnBobsProfile() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithQueryClient(
      <ResourceCreditsInfo rcPercent={50} account={mockFullAccount({ name: "bob" })} />,
      { queryClient }
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByText("rc-info.delegation-button"));
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
});
