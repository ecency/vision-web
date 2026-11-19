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
  const view = render(
    <QueryClientProvider client={qc}>
      <WalletOperationCardUsernameForm onUsernameSubmit={onUsernameSubmit} />
    </QueryClientProvider>
  );
  return { onUsernameSubmit, input: screen.getByRole("textbox"), unmount: view.unmount };
}

beforeEach(() => h.exists.mockReset());

describe("WalletOperationCardUsernameForm", () => {
  it("leaves no blur timer running once it is gone", () => {
    // A timer that outlives the form calls setState after its window is gone
    // (it failed a test run with "window is not defined" at teardown).
    vi.useFakeTimers();
    const set = vi.spyOn(globalThis, "setTimeout");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    try {
      const { input, unmount } = setup();
      fireEvent.focus(input);
      fireEvent.blur(input);
      const blurCall = set.mock.calls.findIndex((call) => call[1] === 150);
      expect(blurCall).toBeGreaterThanOrEqual(0);
      const timer = set.mock.results[blurCall].value;
      unmount();
      expect(clear).toHaveBeenCalledWith(timer);
    } finally {
      set.mockRestore();
      clear.mockRestore();
      vi.useRealTimers();
    }
  });

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

  it("submits the name as checked: trimmed and lowercased", async () => {
    h.exists.mockResolvedValue(true);
    const { onUsernameSubmit, input } = setup();
    fireEvent.change(input, { target: { value: " Ecency " } });
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
