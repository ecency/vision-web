import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useActiveAccount } from "@/core/hooks/use-active-account";

vi.mock("@/core/hooks/use-active-account");
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn()
  };
});
vi.mock("@/utils/user-token", () => ({
  getLoginType: vi.fn()
}));
// The global setup stubs canRevokeFromAuthority to always allow; the
// single-key lock below depends on the real weight arithmetic.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />
}));
vi.mock("@/app/(dynamicPages)/profile/[username]/permissions/_hooks", () => ({
  useKeyDerivationStore: vi.fn((selector: any) => selector({ getDerivation: () => "unknown" }))
}));

import { useQuery } from "@tanstack/react-query";
import { getLoginType } from "@/utils/user-token";
import { Step3ReviewKeys } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/add-keys-steps/step-3-review-keys";

const auth = (key: string) => ({ weight_threshold: 1, account_auths: [], key_auths: [[key, 1]] });
const mockAccount = {
  owner: auth("STM_OWNER_KEY"),
  active: auth("STM_ACTIVE_KEY"),
  posting: auth("STM_POSTING_KEY"),
  memo_key: "STM_MEMO_KEY"
};

describe("Step3ReviewKeys - login type badges", () => {
  beforeEach(() => {
    localStorage.clear();
    (useActiveAccount as any).mockReturnValue({
      activeUser: { username: "testuser" }
    });
    (useQuery as any).mockImplementation((opts: any) => ({
      data: opts.select ? opts.select(mockAccount) : mockAccount
    }));
  });

  it("shows MetaMask badge for MetaMask users", () => {
    (getLoginType as any).mockReturnValue("metamask");
    render(<Step3ReviewKeys onNext={vi.fn()} onBack={vi.fn()} />);
    const badges = screen.getAllByText("MetaMask");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows Keychain badge for Keychain users", () => {
    (getLoginType as any).mockReturnValue("keychain");
    render(<Step3ReviewKeys onNext={vi.fn()} onBack={vi.fn()} />);
    const badges = screen.getAllByText("Keychain");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows HiveSigner badge for HiveSigner users", () => {
    (getLoginType as any).mockReturnValue("hivesigner");
    render(<Step3ReviewKeys onNext={vi.fn()} onBack={vi.fn()} />);
    const badges = screen.getAllByText("HiveSigner");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows Keeper badge for a keychain login with a saved Keeper preference", () => {
    (getLoginType as any).mockReturnValue("keychain");
    localStorage.setItem(
      "ecency_preferred_hive_extension_by_user",
      JSON.stringify({ testuser: "hive-keeper" })
    );
    render(<Step3ReviewKeys onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getAllByText("Keeper").length).toBeGreaterThan(0);
  });

  it("shows Vault badge for a keychain login with a saved Peak Vault preference", () => {
    (getLoginType as any).mockReturnValue("keychain");
    localStorage.setItem(
      "ecency_preferred_hive_extension_by_user",
      JSON.stringify({ testuser: "peakvault" })
    );
    render(<Step3ReviewKeys onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getAllByText("Vault").length).toBeGreaterThan(0);
  });

  it("revoke mode: disables checkboxes when only one key per authority", () => {
    (getLoginType as any).mockReturnValue("keychain");
    render(<Step3ReviewKeys mode="revoke" onNext={vi.fn()} onBack={vi.fn()} />);

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => {
      expect(cb).toBeDisabled();
    });
  });
});
