import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const state = vi.hoisted(() => ({
  signerPub: "STM_ACTIVE",
  account: null as any,
  errors: [] as string[],
  broadcast: vi.fn(async () => ({ id: "tx" }))
}));

vi.mock("@/core/hooks/use-active-account");
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({
      fetchQuery: vi.fn(async () => state.account),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn()
    }))
  };
});
vi.mock("@/features/shared", () => ({
  error: (msg: string) => state.errors.push(msg),
  success: vi.fn()
}));
vi.mock("@/features/shared/key-or-hot", () => ({
  KeyOrHot: ({ onKey }: any) => (
    <button
      onClick={() =>
        onKey({ createPublic: () => ({ toString: () => state.signerPub }) })
      }
    >
      sign-with-key
    </button>
  )
}));
vi.mock("@/features/ui", () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getAccountFullQueryOptions: (u: string) => ({ queryKey: ["acc", u] }),
  dedupeAndSortKeyAuths: (existing: any[], additions: any[]) => [...existing, ...additions],
  PrivateKey: {
    fromString: (wif: string) => ({
      createPublic: () => ({ toString: () => `PUB(${wif})` })
    })
  },
  broadcastOperations: (...args: any[]) => state.broadcast(...args)
}));
vi.mock("@ecency/wallets", () => ({
  deriveHiveMasterPasswordKeys: () => ({
    owner: "5Jowner", active: "5Jactive", posting: "5Jposting", memo: "5Jmemo",
    ownerPubkey: "PUB(5Jowner)", activePubkey: "PUB(5Jactive)",
    postingPubkey: "PUB(5Jposting)", memoPubkey: "PUB(5Jmemo)"
  })
}));
vi.mock("@/app/(dynamicPages)/profile/[username]/permissions/_hooks", () => ({
  useKeyDerivationStore: (selector: any) => selector({ setMultipleDerivations: vi.fn() })
}));
vi.mock("@/providers/sdk/web-broadcast-adapter", () => ({
  getWebBroadcastAdapter: () => ({ broadcastWithKeychain: vi.fn() })
}));
vi.mock("@/api/mutations/update-account-keys-cache", () => ({
  updateAccountKeysCache: vi.fn()
}));

import { Step4Confirm } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/add-keys-steps/step-4-confirm";

const account = {
  name: "alice",
  json_metadata: "",
  owner: { weight_threshold: 1, account_auths: [], key_auths: [["STM_OWNER", 1]] },
  active: { weight_threshold: 1, account_auths: [], key_auths: [["STM_ACTIVE", 1]] },
  posting: { weight_threshold: 1, account_auths: [], key_auths: [["STM_POSTING", 1]] },
  memo_key: "STM_MEMO"
};

const noRevoke = { owner: [], active: [], posting: [], memo: [] };

describe("Step4Confirm - key preflight", () => {
  beforeEach(() => {
    state.errors = [];
    state.broadcast.mockClear();
    (useActiveAccount as any).mockReturnValue({ activeUser: { username: "alice" } });
    state.account = JSON.parse(JSON.stringify(account));
  });

  it("refuses to broadcast with a key that is not the owner key", async () => {
    state.signerPub = "STM_ACTIVE";
    render(
      <Step4Confirm masterPassword="P5new" keysToRevokeByAuthority={noRevoke} onBack={vi.fn()} onSuccess={vi.fn()} />
    );
    fireEvent.click(screen.getByText("sign-with-key"));

    await waitFor(() => expect(state.errors).toHaveLength(1));
    expect(state.errors[0]).toBe("permissions.keys.error-key-authority");
    expect(state.broadcast).not.toHaveBeenCalled();
  });

  it("broadcasts an account_update adding the four new keys when signed with the owner key", async () => {
    state.signerPub = "STM_OWNER";
    const onSuccess = vi.fn();
    render(
      <Step4Confirm masterPassword="P5new" keysToRevokeByAuthority={noRevoke} onBack={vi.fn()} onSuccess={onSuccess} />
    );
    fireEvent.click(screen.getByText("sign-with-key"));

    await waitFor(() => expect(state.broadcast).toHaveBeenCalledTimes(1));
    const [ops] = state.broadcast.mock.calls[0] as any[];
    const [name, body] = ops[0];
    expect(name).toBe("account_update");
    expect(body.owner.key_auths).toEqual([["STM_OWNER", 1], ["PUB(5Jowner)", 1]]);
    expect(body.active.key_auths).toEqual([["STM_ACTIVE", 1], ["PUB(5Jactive)", 1]]);
    expect(body.posting.key_auths).toEqual([["STM_POSTING", 1], ["PUB(5Jposting)", 1]]);
    expect(body.memo_key).toBe("PUB(5Jmemo)");
    expect(state.errors).toEqual([]);
  });

  it("drops the ticked old key from the authority it was ticked in", async () => {
    state.signerPub = "STM_OWNER";
    render(
      <Step4Confirm
        masterPassword="P5new"
        keysToRevokeByAuthority={{ owner: ["STM_OWNER"], active: [], posting: [], memo: [] }}
        onBack={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("sign-with-key"));

    await waitFor(() => expect(state.broadcast).toHaveBeenCalledTimes(1));
    const body = (state.broadcast.mock.calls[0] as any[])[0][0][1];
    expect(body.owner.key_auths).toEqual([["PUB(5Jowner)", 1]]);
    expect(body.active.key_auths).toEqual([["STM_ACTIVE", 1], ["PUB(5Jactive)", 1]]);
  });

  it("lets an unknown key through when owner is delegated to an account", async () => {
    state.account.owner.account_auths = [["recovery-helper", 1]];
    state.signerPub = "STM_HELPER";
    render(
      <Step4Confirm masterPassword="P5new" keysToRevokeByAuthority={noRevoke} onBack={vi.fn()} onSuccess={vi.fn()} />
    );
    fireEvent.click(screen.getByText("sign-with-key"));

    await waitFor(() => expect(state.broadcast).toHaveBeenCalledTimes(1));
    expect(state.errors).toEqual([]);
  });
});
