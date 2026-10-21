import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { AccountRecovery } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/account-recovery";

const state = vi.hoisted(() => ({
  // Accounts the mocked chain lookup reports as existing.
  existing: new Set<string>(),
  updateRecovery: vi.fn(async () => undefined)
}));

vi.mock("@/utils", () => ({
  getAccessToken: () => "token",
  getSdkAuthContext: () => undefined,
  getUser: () => undefined
}));
vi.mock("@/utils/hs-callback", () => ({ buildHsCallbackUrl: () => "/cb" }));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/features/shared/key-or-hot", () => ({
  KeyOrHot: ({ onKc }: any) => <button onClick={onKc}>sign-with-keychain</button>
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getAccountFullQueryOptions: (u: string) => ({
    queryKey: ["acc", u],
    queryFn: async () => ({ name: u, recovery_account: "leo.voter" })
  }),
  getAccountRecoveriesQueryOptions: (u: string) => ({
    queryKey: ["recoveries", u],
    queryFn: async () => []
  }),
  getAccountPendingRecoveryQueryOptions: (u: string) => ({
    queryKey: ["pending", u],
    queryFn: async () => null
  }),
  getAccountsQueryOptions: (names: string[]) => ({
    queryKey: ["accounts", ...names],
    queryFn: async () =>
      names.filter((name) => state.existing.has(name)).map((name) => ({ name }))
  }),
  useAccountUpdateRecovery: () => ({ mutateAsync: state.updateRecovery, isPending: false })
}));

describe("AccountRecovery form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.existing = new Set(["melinda010100"]);
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "krk101" },
      username: "krk101"
    } as unknown as ReturnType<typeof useActiveAccount>);
  });

  const typeAndSubmit = async (value: string) => {
    const input = await screen.findByDisplayValue("leo.voter");
    fireEvent.change(input, { target: { value } });
    fireEvent.click(await screen.findByRole("button", { name: "g.update" }));
  };

  it("broadcasts the bare name when typed with @ and capitals", async () => {
    renderWithQueryClient(<AccountRecovery />);

    await typeAndSubmit("@Melinda010100");
    fireEvent.click(await screen.findByText("sign-with-keychain"));

    await waitFor(() =>
      expect(state.updateRecovery).toHaveBeenCalledWith({
        type: "keychain",
        key: undefined,
        accountName: "melinda010100"
      })
    );
  });

  it("shows an error and never opens the sign dialog for an invalid name", async () => {
    renderWithQueryClient(<AccountRecovery />);

    await typeAndSubmit("alice%40bob");

    expect(await screen.findByText("validation.invalid-account-name")).toBeInTheDocument();
    expect(screen.queryByText("sign-with-keychain")).not.toBeInTheDocument();
  });

  it("shows an error and never opens the sign dialog for an account that does not exist", async () => {
    renderWithQueryClient(<AccountRecovery />);

    await typeAndSubmit("nosuchuser");

    expect(await screen.findByText("validation.account-not-found")).toBeInTheDocument();
    expect(screen.queryByText("sign-with-keychain")).not.toBeInTheDocument();
    expect(state.updateRecovery).not.toHaveBeenCalled();
  });
});
