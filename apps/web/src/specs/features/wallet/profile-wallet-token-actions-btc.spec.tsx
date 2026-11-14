import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";

let account: Record<string, unknown> | null = null;
let activeUser: { username: string } | null = null;
let routeToken = "btc";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: routeToken, username: "alice" }),
  usePathname: () => `/@alice/wallet/${routeToken}`
}));

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getAccountFullQueryOptions: (username: string) => ({
      ...actual.getAccountFullQueryOptions(username),
      queryFn: async () => account
    })
  };
});

vi.mock("@ecency/sdk/wallets", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk/wallets")>("@ecency/sdk/wallets");
  return {
    ...actual,
    getTokenOperationsQueryOptions: () => ({
      queryKey: ["test", "token-operations"],
      queryFn: async () => []
    })
  };
});

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser })
}));

vi.mock("@/utils/user-token", () => ({
  getLoginType: () => "metamask"
}));

// The dialog itself is out of scope; render a marker so the test can see it mount.
vi.mock("@/features/wallet", () => ({
  ExternalTransferDialog: () => <div data-testid="external-transfer-dialog" />,
  WalletOperationsDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const { ProfileWalletTokenActions } = await import(
  "@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/profile-wallet-token-actions"
);

function linkWallet(symbol: string, address: string) {
  account = {
    name: "alice",
    profile: { tokens: [{ symbol, type: "CHAIN", meta: { address } }] }
  };
}

describe("ProfileWalletTokenActions: BTC send", () => {
  beforeEach(() => {
    activeUser = { username: "alice" };
    routeToken = "btc";
  });

  test("enables Send for a MetaMask user's own linked BTC wallet", async () => {
    linkWallet("BTC", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");

    renderWithQueryClient(<ProfileWalletTokenActions />);

    // i18n is not initialised in specs, so labels render as their keys.
    const send = await screen.findByRole("button", { name: /external\.transfer-button/ });
    expect(send).toBeEnabled();
    expect(await screen.findByTestId("external-transfer-dialog")).toBeInTheDocument();
  });

  test("keeps Send disabled when viewing someone else's BTC wallet", async () => {
    activeUser = { username: "bob" };
    linkWallet("BTC", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");

    renderWithQueryClient(<ProfileWalletTokenActions />);

    const send = await screen.findByRole("button", { name: /external\.transfer-soon/ });
    expect(send).toBeDisabled();
    expect(screen.queryByTestId("external-transfer-dialog")).not.toBeInTheDocument();
  });
});
