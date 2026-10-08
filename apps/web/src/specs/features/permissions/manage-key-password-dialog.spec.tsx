import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { forwardRef, useImperativeHandle } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const state = vi.hoisted(() => ({
  raw: "the-master-password",
  errors: [] as string[],
  updateKeys: vi.fn()
}));

vi.mock("@/core/hooks/use-active-account");
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn() };
});
vi.mock("@/features/shared", () => ({
  error: (msg: string) => state.errors.push(msg)
}));
vi.mock("@/features/ui", () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Modal: ({ children, show }: any) => (show ? <div>{children}</div> : null),
  ModalHeader: ({ children }: any) => <div>{children}</div>,
  ModalBody: ({ children }: any) => <div>{children}</div>,
  ModalFooter: ({ children }: any) => <div>{children}</div>,
  KeyInput: forwardRef(function KeyInputStub(_props: any, ref: any) {
    useImperativeHandle(ref, () => ({
      handleSign: async () => ({ privateKey: {}, raw: state.raw })
    }));
    return <input data-testid="key-input" />;
  })
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getAccountFullQueryOptions: (u: string) => ({ queryKey: ["acc", u] }),
  PublicKey: { fromString: () => { throw new Error("not a public key"); } },
  isWif: () => false
}));
vi.mock("@ecency/wallets", () => ({
  deriveHiveMasterPasswordKeys: () => ({
    owner: "5Jowner", active: "5Jactive", posting: "5Jposting", memo: "5Jmemo",
    ownerPubkey: "STM_NEW_OWNER", activePubkey: "STM_NEW_ACTIVE",
    postingPubkey: "STM_NEW_POSTING", memoPubkey: "STM_NEW_MEMO"
  })
}));
vi.mock("@/app/(dynamicPages)/profile/[username]/permissions/_hooks", () => ({
  useRevealedKeysStore: () => ({ updateKeys: state.updateKeys })
}));

import { useQuery } from "@tanstack/react-query";
import { ManageKeyPasswordDialog } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/manage-key-password-dialog";

function mockAccount(ownerKeys: string[]) {
  const account = {
    owner: { weight_threshold: 1, account_auths: [], key_auths: ownerKeys.map((k) => [k, 1]) },
    active: { weight_threshold: 1, account_auths: [], key_auths: [["STM_ACTIVE", 1]] },
    posting: { weight_threshold: 1, account_auths: [], key_auths: [["STM_POSTING", 1]] },
    memo_key: "STM_MEMO"
  };
  (useQuery as any).mockImplementation((opts: any) => ({
    data: opts.select ? opts.select(account) : account
  }));
}

describe("ManageKeyPasswordDialog", () => {
  beforeEach(() => {
    state.errors = [];
    state.updateKeys.mockClear();
    (useActiveAccount as any).mockReturnValue({ activeUser: { username: "alice" } });
  });

  it("accepts a master password whose owner key is NOT the first owner key", async () => {
    // After a key rotation the account carries the old and the new owner key,
    // sorted by key; the old code only compared against key_auths[0].
    mockAccount(["STM_OLD_OWNER", "STM_NEW_OWNER"]);
    const setShow = vi.fn();
    render(<ManageKeyPasswordDialog show={true} setShow={setShow} />);
    fireEvent.click(screen.getByText("g.continue"));

    await waitFor(() => expect(state.updateKeys).toHaveBeenCalled());
    expect(state.updateKeys).toHaveBeenCalledWith("alice", {
      STM_NEW_OWNER: "5Jowner",
      STM_NEW_ACTIVE: "5Jactive",
      STM_NEW_POSTING: "5Jposting",
      STM_NEW_MEMO: "5Jmemo"
    });
    expect(state.errors).toEqual([]);
    expect(setShow).toHaveBeenCalledWith(false);
  });

  it("rejects a master password that derives none of the owner keys", async () => {
    mockAccount(["STM_OLD_OWNER", "STM_OTHER"]);
    const setShow = vi.fn();
    render(<ManageKeyPasswordDialog show={true} setShow={setShow} />);
    fireEvent.click(screen.getByText("g.continue"));

    await waitFor(() => expect(state.errors).toHaveLength(1));
    expect(state.updateKeys).not.toHaveBeenCalled();
    expect(setShow).not.toHaveBeenCalled();
  });
});
