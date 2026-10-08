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

const auth = (keys: string[], threshold = 1, accountAuths: [string, number][] = []) => ({
  weight_threshold: threshold,
  account_auths: accountAuths,
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
    // B + new key = 2 meets the threshold; removing B as well would leave 1.
    expect(a).toBeEnabled();
    expect(b).toBeDisabled();
    fireEvent.click(a);
    expect(b).toBeEnabled();
  });

  it("revoke mode: the last key stays locked even when app accounts carry the weight", () => {
    // posting held by one key plus app account_auths is the common Ecency
    // layout; removing the key would leave an authority no key can sign in with.
    mockAccount({ ...singleKeyAccount, posting: auth(["STM_POSTING"], 1, [["ecency.app", 1]]) });
    render(<Step3ReviewKeys mode="revoke" onNext={vi.fn()} onBack={vi.fn()} />);
    screen.getAllByRole("checkbox").forEach((b) => expect(b).toBeDisabled());
  });

  it("revoke mode: a pre-selected key is only ticked where removing it keeps the threshold", () => {
    mockAccount({
      ...singleKeyAccount,
      active: auth(["STM_X", "STM_Y"], 2),
      posting: auth(["STM_X", "STM_P2"], 1)
    });
    const onNext = vi.fn();
    render(<Step3ReviewKeys mode="revoke" initialSelectedKey="STM_X" onNext={onNext} onBack={vi.fn()} />);
    const [owner, activeX, activeY, postingX, postingP2] = screen.getAllByRole("checkbox");
    expect(owner).toBeDisabled();
    // active is 2-of-2: X cannot be pre-ticked there.
    expect(activeX).not.toBeChecked();
    expect(activeY).toBeDisabled();
    // posting has a spare key: X is pre-ticked there.
    expect(postingX).toBeChecked();
    expect(postingP2).toBeDisabled();
    fireEvent.click(screen.getByText("g.continue"));
    expect(onNext).toHaveBeenCalledWith({ owner: [], active: [], posting: ["STM_X"], memo: [] });
  });

  it("add mode: a locked multisig row explains the threshold, not 'only key'", () => {
    mockAccount({ ...singleKeyAccount, owner: auth(["STM_OWNER_A", "STM_OWNER_B"], 2) });
    render(<Step3ReviewKeys mode="add" onNext={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("permissions.add-keys.step3.cannot-revoke-threshold")).toBeInTheDocument();
    expect(screen.queryByText("permissions.add-keys.step3.cannot-revoke-last")).not.toBeInTheDocument();
  });
});
