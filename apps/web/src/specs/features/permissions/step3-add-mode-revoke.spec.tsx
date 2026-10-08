import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useActiveAccount } from "@/core/hooks/use-active-account";

vi.mock("@/core/hooks/use-active-account");
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn() };
});
vi.mock("@/utils/user-token", () => ({ getLoginType: vi.fn(() => "privateKey") }));
// The global test setup stubs canRevokeFromAuthority to always allow; this
// spec is about that very arithmetic, so use the real SDK module.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));
vi.mock("next/image", () => ({ __esModule: true, default: (props: any) => <img {...props} /> }));
vi.mock("@/app/(dynamicPages)/profile/[username]/permissions/_hooks", () => ({
  useKeyDerivationStore: vi.fn((selector: any) => selector({ getDerivation: () => "unknown" }))
}));

import { useQuery } from "@tanstack/react-query";
import { Step3ReviewKeys } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/add-keys-steps/step-3-review-keys";

const auth = (keys: string[], threshold = 1) => ({
  weight_threshold: threshold,
  account_auths: [],
  key_auths: keys.map((k) => [k, 1])
});

function mockAccount(account: any) {
  (useQuery as any).mockImplementation((opts: any) => ({
    data: opts.select ? opts.select(account) : account
  }));
}

const singleKeyAccount = {
  owner: auth(["STM_OWNER"]),
  active: auth(["STM_ACTIVE"]),
  posting: auth(["STM_POSTING"]),
  memo_key: "STM_MEMO"
};

describe("Step3ReviewKeys - which keys can be ticked", () => {
  beforeEach(() => {
    (useActiveAccount as any).mockReturnValue({ activeUser: { username: "alice" } });
  });

  it("add mode: the only key of an authority can be replaced by the new key", () => {
    mockAccount(singleKeyAccount);
    const onNext = vi.fn();
    render(<Step3ReviewKeys mode="add" onNext={onNext} onBack={vi.fn()} />);

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    boxes.forEach((b) => expect(b).toBeEnabled());
    expect(screen.queryByText("permissions.add-keys.step3.cannot-revoke-last")).not.toBeInTheDocument();

    fireEvent.click(boxes[0]);
    fireEvent.click(screen.getByText("permissions.add-keys.step3.next-with-revoke"));
    expect(onNext).toHaveBeenCalledWith({ owner: ["STM_OWNER"], active: [], posting: [], memo: [] });
  });

  it("revoke mode: the only key of an authority stays locked", () => {
    mockAccount(singleKeyAccount);
    render(<Step3ReviewKeys mode="revoke" onNext={vi.fn()} onBack={vi.fn()} />);
    screen.getAllByRole("checkbox").forEach((b) => expect(b).toBeDisabled());
    expect(screen.getAllByText("permissions.add-keys.step3.cannot-revoke-last")).toHaveLength(3);
  });

  it("add mode: a multisig authority cannot drop below its threshold even with the new key", () => {
    mockAccount({
      ...singleKeyAccount,
      owner: auth(["STM_OWNER_A", "STM_OWNER_B"], 2)
    });
    render(<Step3ReviewKeys mode="add" onNext={vi.fn()} onBack={vi.fn()} />);
    const [a, b] = screen.getAllByRole("checkbox");
    expect(a).toBeEnabled();
    expect(b).toBeEnabled();
    fireEvent.click(a);
    // A + new key = 2 meets the threshold; removing B as well would leave 1.
    expect(a).toBeEnabled();
    expect(b).toBeDisabled();
    fireEvent.click(a);
    expect(b).toBeEnabled();
  });
});
