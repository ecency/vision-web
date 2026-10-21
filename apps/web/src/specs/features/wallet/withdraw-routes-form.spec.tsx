import { vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient } from "@/specs/test-utils";
import { WalletOperationWithdrawRoutesForm } from "@/features/wallet/operations/wallet-operation-withdraw-routes-form";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useQuery } from "@tanstack/react-query";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn()
  };
});

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual("@ecency/sdk");
  return {
    ...actual,
    getBadActorsQueryOptions: vi.fn(() => ({
      queryKey: ["bad-actors"],
      queryFn: vi.fn()
    }))
  };
});

describe("WalletOperationWithdrawRoutesForm", () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useActiveAccount as any).mockReturnValue({
      activeUser: { username: "testuser" },
      username: "testuser",
      account: { name: "testuser" }
    });

    (useQuery as any).mockReturnValue({ data: undefined });
  });

  test("shows bad-actor warning when account matches bad actors list", async () => {
    const badActors = new Set(["baduser"]);
    (useQuery as any).mockReturnValue({ data: badActors });

    renderWithQueryClient(
      <WalletOperationWithdrawRoutesForm onSubmit={onSubmit} initialValues={{ account: "baduser" }} />
    );

    expect(screen.getByText("transfer.to-bad-actor")).toBeInTheDocument();
  });

  test("does not show bad-actor warning when account is not in bad actors list", () => {
    const badActors = new Set(["baduser"]);
    (useQuery as any).mockReturnValue({ data: badActors });

    renderWithQueryClient(
      <WalletOperationWithdrawRoutesForm onSubmit={onSubmit} initialValues={{ account: "gooduser" }} />
    );

    expect(screen.queryByText("transfer.to-bad-actor")).not.toBeInTheDocument();
  });

  test("bad-actor check is case-insensitive", () => {
    const badActors = new Set(["baduser"]);
    (useQuery as any).mockReturnValue({ data: badActors });

    renderWithQueryClient(
      <WalletOperationWithdrawRoutesForm onSubmit={onSubmit} initialValues={{ account: "BadUser" }} />
    );

    expect(screen.getByText("transfer.to-bad-actor")).toBeInTheDocument();
  });

  test("does not show bad-actor warning when bad actors list is empty", () => {
    (useQuery as any).mockReturnValue({ data: undefined });

    renderWithQueryClient(
      <WalletOperationWithdrawRoutesForm onSubmit={onSubmit} initialValues={{ account: "anyuser" }} />
    );

    expect(screen.queryByText("transfer.to-bad-actor")).not.toBeInTheDocument();
  });

  test("submits the bare account name when typed with @, spaces and capitals", async () => {
    const { container } = renderWithQueryClient(
      <WalletOperationWithdrawRoutesForm onSubmit={onSubmit} initialValues={{ account: " @Alice " }} />
    );

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].to_account).toBe("alice");
  });

  test("does not submit a name the chain would reject", async () => {
    const { container } = renderWithQueryClient(
      <WalletOperationWithdrawRoutesForm onSubmit={onSubmit} initialValues={{ account: "bad_name" }} />
    );

    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByText("validation.invalid-account-name")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
