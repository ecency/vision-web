import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useActiveAccount } from "@/core/hooks/use-active-account";

vi.mock("@/core/hooks/use-active-account");
const mockAccountData = {
  owner: { weight_threshold: 1, account_auths: [], key_auths: [["STM_OWNER_1", 1], ["STM_OWNER_2", 1]] },
  active: { weight_threshold: 1, account_auths: [], key_auths: [["STM_ACTIVE_1", 1], ["STM_ACTIVE_2", 1]] },
  posting: { weight_threshold: 1, account_auths: [], key_auths: [["STM_POSTING_1", 1]] },
  memo_key: "STM_MEMO_1",
  json_metadata: ""
};

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: mockAccountData })),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
    useMutation: vi.fn(() => ({ mutateAsync: vi.fn() }))
  };
});
vi.mock("@/utils/user-token", () => ({
  getLoginType: vi.fn(() => "keychain")
}));
vi.mock("@ecency/sdk/wallets", () => ({
  deriveHiveMasterPasswordKeys: vi.fn(() => ({
    owner: "5Jowner", active: "5Jactive", posting: "5Jposting", memo: "5Jmemo",
    ownerPubkey: "STMowner", activePubkey: "STMactive",
    postingPubkey: "STMposting", memoPubkey: "STMmemo"
  }))
}));
vi.mock("@/utils/master-password", () => ({
  generateMasterPassword: vi.fn(() => "P5TestMasterPasswordABC123")
}));
vi.mock("@/features/wallet", () => ({
  useDownloadKeys: vi.fn(() => vi.fn())
}));
vi.mock("react-use", () => ({
  useCopyToClipboard: vi.fn(() => [null, vi.fn()])
}));
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />
}));
// Mock step sub-components to isolate the orchestrator
vi.mock("@/app/(dynamicPages)/profile/[username]/permissions/_components/add-keys-steps", () => ({
  Step1Authenticate: () => null,
  Step2GenerateSeed: ({ username, onNext }: any) => (
    <div data-testid="step-generate">
      <span>P5TestMasterPasswordABC123</span>
      <button onClick={() => onNext("P5TestMasterPasswordABC123")}>Continue</button>
    </div>
  ),
  Step3ReviewKeys: ({ onNext, onBack }: any) => (
    <div data-testid="step-review">
      <button onClick={onBack}>Back</button>
      <button onClick={() => onNext({ owner: [], active: [], posting: [], memo: [] })}>Next</button>
    </div>
  ),
  Step4Confirm: ({ onBack, onSuccess }: any) => (
    <div data-testid="step-confirm">
      <button onClick={onBack}>Back</button>
      <button onClick={onSuccess}>Confirm</button>
    </div>
  )
}));

import { ManageKeysDialog } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/manage-keys-dialog";

describe("ManageKeysDialog", () => {
  beforeEach(() => {
    (useActiveAccount as any).mockReturnValue({
      activeUser: { username: "testuser" }
    });
  });

  it("shows action chooser when opened without initialRevokeKey", () => {
    render(<ManageKeysDialog show={true} onHide={vi.fn()} />);

    expect(screen.getByText("permissions.manage-keys.add-title")).toBeInTheDocument();
    expect(screen.getByText("permissions.manage-keys.revoke-title")).toBeInTheDocument();
  });

  it("enters add flow when Add New Keys is clicked", () => {
    render(<ManageKeysDialog show={true} onHide={vi.fn()} />);

    fireEvent.click(screen.getByText("permissions.manage-keys.add-title"));
    expect(screen.getByTestId("step-generate")).toBeInTheDocument();
  });

  it("enters revoke flow when Revoke is clicked", () => {
    render(<ManageKeysDialog show={true} onHide={vi.fn()} />);

    fireEvent.click(screen.getByText("permissions.manage-keys.revoke-title"));
    expect(screen.getByTestId("step-review")).toBeInTheDocument();
  });

  it("skips action chooser and enters revoke mode when initialRevokeKey is set", () => {
    render(
      <ManageKeysDialog show={true} onHide={vi.fn()} initialRevokeKey="STM_SOME_KEY" />
    );

    // Should not show the action chooser
    expect(screen.queryByText("permissions.manage-keys.choose-title")).not.toBeInTheDocument();
    // Should show the review step in revoke mode
    expect(screen.getByTestId("step-review")).toBeInTheDocument();
  });
});
