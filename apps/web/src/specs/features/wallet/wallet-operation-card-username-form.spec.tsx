import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// #2122: Hive Engine and POINTS operations are custom_json, which the chain
// accepts whatever the recipient. A mistyped name must be caught here, before
// the user signs, or the tokens go to an account nobody controls.

const h = vi.hoisted(() => ({ exists: vi.fn(async (_qc: unknown, _name: string) => true) }));

vi.mock("@/utils/hive-account-name", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/hive-account-name")>()),
  accountExists: h.exists
}));
vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ecency/sdk")>()),
  getBadActorsQueryOptions: () => ({ queryKey: ["bad"], queryFn: async () => new Set<string>() }),
  lookupAccountsQueryOptions: () => ({ queryKey: ["lookup"], queryFn: async () => [], enabled: false })
}));

import { WalletOperationCardUsernameForm } from "@/features/wallet/operations/wallet-operation-card-username-form";

function setup() {
  const onUsernameSubmit = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <WalletOperationCardUsernameForm onUsernameSubmit={onUsernameSubmit} />
    </QueryClientProvider>
  );
  return { onUsernameSubmit, input: screen.getByRole("textbox") };
}

beforeEach(() => h.exists.mockReset());

describe("WalletOperationCardUsernameForm", () => {
  it("does not submit an account that does not exist", async () => {
    h.exists.mockResolvedValue(false);
    const { onUsernameSubmit, input } = setup();
    fireEvent.change(input, { target: { value: "ecencyy" } });
    fireEvent.blur(input);
    await waitFor(() => expect(h.exists).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("validation.account-not-found")).toBeTruthy());
    expect(onUsernameSubmit).not.toHaveBeenCalled();
  });

  it("submits an account that exists", async () => {
    h.exists.mockResolvedValue(true);
    const { onUsernameSubmit, input } = setup();
    fireEvent.change(input, { target: { value: "ecency" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onUsernameSubmit).toHaveBeenCalledWith("ecency"));
  });

  it("does not submit a name Hive would not accept", async () => {
    const { onUsernameSubmit, input } = setup();
    fireEvent.change(input, { target: { value: "-bad-" } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText("validation.invalid-account-name")).toBeTruthy());
    expect(onUsernameSubmit).not.toHaveBeenCalled();
  });
});
