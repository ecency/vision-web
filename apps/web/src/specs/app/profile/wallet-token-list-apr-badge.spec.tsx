import { vi, describe, it, expect } from "vitest";
import React from "react";
import { screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";

// #1973: the APR badge in the wallet token list was hard-coded English.
vi.mock("@/utils", async () => ({ ...(await vi.importActual<object>("@/utils")) }));
vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => ({ activeUser: null }) }));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (select: (s: { currency: string }) => unknown) => select({ currency: "usd" })
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<object>("@ecency/sdk")),
  getAccountWalletAssetInfoQueryOptions: () => ({
    queryKey: ["asset", "hbd"],
    queryFn: () => ({ name: "HBD", title: "Hive Dollar", price: 1, accountBalance: 10, apr: "15" }),
    staleTime: Infinity
  })
}));
vi.mock("@ecency/sdk/wallets", async () => ({
  ...(await vi.importActual<object>("@ecency/sdk/wallets")),
  getAllTokensListQueryOptions: () => ({ queryKey: ["tokens"], queryFn: () => ({}), staleTime: Infinity }),
  getTokenOperationsQueryOptions: () => ({ queryKey: ["ops"], queryFn: () => [], staleTime: Infinity })
}));
vi.mock("@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/profile-wallet-claim-points-button", () => ({
  ProfileWalletClaimPointsButton: () => null,
  useProfileWalletPointsClaimState: () => ({})
}));
vi.mock("@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/profile-wallet-hp-claim-rewards-button", () => ({
  ProfileWalletHpClaimRewardsButton: () => null,
  useProfileWalletHpClaimState: () => ({})
}));
vi.mock("@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/profile-wallet-hbd-claim-rewards-button", () => ({
  ProfileWalletHbdClaimRewardsButton: () => null,
  useProfileWalletHbdClaimState: () => ({})
}));
vi.mock("@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/profile-wallet-hive-claim-rewards-button", () => ({
  ProfileWalletHiveClaimRewardsButton: () => null,
  useProfileWalletHiveClaimState: () => ({})
}));
vi.mock("@/app/(dynamicPages)/profile/[username]/wallet/(token)/[token]/_components/hive-engine-claim-rewards-button", () => ({
  HiveEngineClaimRewardsButton: () => null,
  useHiveEngineClaimRewardsState: () => ({})
}));

import { ProfileWalletTokensListItem } from "@/app/(dynamicPages)/profile/[username]/wallet/_components/profile-wallet-tokens-list-item";

describe("wallet token list APR badge", () => {
  it("labels the APR through i18n, not hard-coded English", async () => {
    renderWithQueryClient(<ProfileWalletTokensListItem asset="hbd" username="alice" />);

    const badge = await screen.findByText(/profile-wallet\.summary-apr/);
    expect(badge.textContent).toMatch(/^15(\.0+)?% profile-wallet\.summary-apr$/);
    expect(screen.queryByText(/% APR$/)).toBeNull();
  });
});
