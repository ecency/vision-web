import { vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { WitnessesProxy } from "@/app/witnesses/_components/witness-proxy";

const mutateAsync = vi.fn();
// Accounts the mocked chain lookup reports as existing.
const existingAccounts = new Set<string>();

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual("@ecency/sdk");
  return {
    ...actual,
    getAccountsQueryOptions: vi.fn((names: string[]) => ({
      queryKey: ["accounts", ...names],
      queryFn: async () =>
        names.filter((name) => existingAccounts.has(name)).map((name) => ({ name }))
    }))
  };
});

vi.mock("@/api/sdk-mutations", () => ({
  useWitnessProxyMutation: () => ({ mutateAsync, isPending: false })
}));

describe("WitnessesProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue(undefined);
    existingAccounts.clear();
    existingAccounts.add("melinda010100");
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: "testuser" },
      username: "testuser"
    } as unknown as ReturnType<typeof useActiveAccount>);
  });

  const typeName = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText("witnesses.username-placeholder"), {
      target: { value }
    });

  test("sends the bare account name when typed with @ and capitals", async () => {
    const onDone = vi.fn();
    renderWithQueryClient(<WitnessesProxy onDone={onDone} />);

    typeName("@Melinda010100");
    fireEvent.click(screen.getByRole("button", { name: "witnesses.proxy-btn-label" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ proxy: "melinda010100" }));
    expect(onDone).toHaveBeenCalled();
  });

  test("keeps the button disabled for a name the chain would reject", () => {
    renderWithQueryClient(<WitnessesProxy onDone={vi.fn()} />);

    typeName("bad_name");

    expect(screen.getByRole("button", { name: "witnesses.proxy-btn-label" })).toBeDisabled();
  });

  test("blocks proxying to yourself, even typed with @ and capitals", () => {
    renderWithQueryClient(<WitnessesProxy onDone={vi.fn()} />);

    typeName("@TestUser");

    expect(screen.getByText("witnesses.proxy-self-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "witnesses.proxy-btn-label" })).toBeDisabled();
  });

  test("shows an error instead of broadcasting when the account does not exist", async () => {
    renderWithQueryClient(<WitnessesProxy onDone={vi.fn()} />);

    typeName("nosuchuser");
    fireEvent.click(screen.getByRole("button", { name: "witnesses.proxy-btn-label" }));

    expect(await screen.findByText("validation.account-not-found")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
