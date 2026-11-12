import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({
  handleSign: vi.fn(),
  errorSpy: vi.fn(),
  setMultipleDerivations: vi.fn()
}));

// Stub KeyInput so we control exactly what its imperative handleSign() resolves
// to, and Button so the "Next" click is a real DOM button.
vi.mock("@/features/ui", async () => {
  const React = await import("react");
  const KeyInput = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ handleSign: () => h.handleSign() }));
    return null;
  });
  KeyInput.displayName = "KeyInput";
  return {
    KeyInput,
    Button: ({ children, onClick, disabled }: any) =>
      React.createElement("button", { onClick, disabled }, children)
  };
});

vi.mock("@/features/shared", () => ({
  error: (message: string) => h.errorSpy(message)
}));

vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQuery: () => ({
    data: {
      owner: { key_auths: [] },
      active: { key_auths: [] },
      posting: { key_auths: [] },
      memo_key: "STM_MEMO"
    }
  })
}));

vi.mock("@ecency/sdk/wallets", () => ({
  detectHiveKeyDerivation: vi.fn(async () => "bip44"),
  deriveHiveKeys: vi.fn(() => ({
    ownerPubkey: "O",
    activePubkey: "A",
    postingPubkey: "P",
    memoPubkey: "M"
  })),
  deriveHiveMasterPasswordKeys: vi.fn(() => ({
    ownerPubkey: "O",
    activePubkey: "A",
    postingPubkey: "P",
    memoPubkey: "M"
  }))
}));

vi.mock("@/app/(dynamicPages)/profile/[username]/permissions/_hooks", () => ({
  useKeyDerivationStore: (selector: (s: { setMultipleDerivations: typeof h.setMultipleDerivations }) => unknown) =>
    selector({ setMultipleDerivations: h.setMultipleDerivations })
}));

import { Step1Authenticate } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/add-keys-steps/step-1-authenticate";

function renderStep(onNext = vi.fn()) {
  render(<Step1Authenticate username="testuser" onNext={onNext} />);
  return { onNext, button: screen.getByRole("button") };
}

describe("Step1Authenticate", () => {
  beforeEach(() => {
    h.handleSign.mockReset();
    h.errorSpy.mockClear();
    h.setMultipleDerivations.mockClear();
  });

  afterEach(cleanup);

  it("does not show a duplicate error toast when the key is invalid (handleSign resolves null)", async () => {
    // KeyInput already showed its own key-specific toast and signals failure by
    // resolving to null. Step 1 must NOT surface a second generic toast.
    h.handleSign.mockResolvedValue(null);
    const { onNext, button } = renderStep();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(h.errorSpy).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("still surfaces the generic error toast when handleSign throws unexpectedly", async () => {
    h.handleSign.mockRejectedValue(new Error("unexpected"));
    const { onNext, button } = renderStep();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(h.errorSpy).toHaveBeenCalledTimes(1);
    expect(h.errorSpy).toHaveBeenCalledWith("permissions.add-keys.step1.error-authentication");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("advances to the next step on a valid key", async () => {
    h.handleSign.mockResolvedValue({
      privateKey: { toString: () => "OWNER_KEY" },
      raw: "the-credential"
    });
    const { onNext, button } = renderStep();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(h.errorSpy).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledWith("OWNER_KEY", "the-credential");
  });
});
