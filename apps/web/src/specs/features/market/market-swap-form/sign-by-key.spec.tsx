import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PrivateKey } from "@ecency/sdk";
import { useGlobalStore } from "@/core/global-store";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { SignByKey } from "@/features/market/market-swap-form/sign-by-key";

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));

// A typed master password must not stay in the swap form's field after it is
// derived, and a key the store drops (idle limit, logout) must leave the field.

const field = () => document.querySelector("input[type=password]") as HTMLInputElement;

describe("SignByKey local key", () => {
  beforeEach(() => {
    vi.mocked(useActiveAccount).mockImplementation(
      () => ({ activeUser: { username: "alice" }, username: "alice" }) as unknown as ReturnType<typeof useActiveAccount>
    );
    useGlobalStore.setState({ signingKey: null });
  });
  afterEach(() => useGlobalStore.setState({ signingKey: null }));

  it("keeps the derived key in the field, not the typed master password", () => {
    const onKey = vi.fn();
    render(<SignByKey onKey={onKey} onBack={vi.fn()} isLoading={false} />);
    fireEvent.change(field(), { target: { value: "my master password" } });
    fireEvent.click(screen.getByRole("button", { name: "market.sign" }));

    const derived = PrivateKey.fromLogin("alice", "my master password", "active").toString();
    expect(onKey).toHaveBeenCalledTimes(1);
    expect(field().value).toBe(derived);
  });

  it("clears the field when the store drops the key it showed", () => {
    const wif = PrivateKey.fromLogin("alice", "pw", "active").toString();
    useGlobalStore.setState({ signingKey: wif });
    render(<SignByKey onKey={vi.fn()} onBack={vi.fn()} isLoading={false} />);
    expect(field().value).toBe(wif);

    act(() => useGlobalStore.setState({ signingKey: null }));
    expect(field().value).toBe("");
  });

  it("keeps what the user is typing when the store drops an older key", () => {
    const wif = PrivateKey.fromLogin("alice", "pw", "active").toString();
    useGlobalStore.setState({ signingKey: wif });
    render(<SignByKey onKey={vi.fn()} onBack={vi.fn()} isLoading={false} />);
    fireEvent.change(field(), { target: { value: "something else" } });

    act(() => useGlobalStore.setState({ signingKey: null }));
    expect(field().value).toBe("something else");
  });
});
