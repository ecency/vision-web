import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const state = vi.hoisted(() => ({
  signerPub: "STM_ACTIVE",
  revokeMap: { owner: [] as string[], active: [] as string[], posting: [] as string[], memo: [] as string[] },
  errors: [] as string[],
  broadcast: vi.fn(async () => ({ id: "tx" })),
  account: null as any
}));

vi.mock("@/core/hooks/use-active-account");
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: state.account })),
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
  KeyOrHot: ({ onKey, authority }: any) => (
    <button
      data-authority={authority}
      onClick={() => onKey({ createPublic: () => ({ toString: () => state.signerPub }) })}
    >
      sign-with-key
    </button>
  )
}));
vi.mock("@/features/ui", () => ({
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Modal: ({ children, show }: any) => (show ? <div>{children}</div> : null),
  ModalHeader: ({ children }: any) => <div>{children}</div>,
  ModalBody: ({ children }: any) => <div>{children}</div>
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getAccountFullQueryOptions: (u: string) => ({ queryKey: ["acc", u] }),
  broadcastOperations: (...args: any[]) => state.broadcast(...args)
}));
vi.mock("@/providers/sdk/web-broadcast-adapter", () => ({
  getWebBroadcastAdapter: () => ({ broadcastWithKeychain: vi.fn() })
}));
vi.mock("@/api/mutations/update-account-keys-cache", () => ({ updateAccountKeysCache: vi.fn() }));
vi.mock("next/image", () => ({ __esModule: true, default: (props: any) => <img {...props} /> }));
// Step 3 is covered by its own specs; here it just hands over the ticked map.
vi.mock("@/app/(dynamicPages)/profile/[username]/permissions/_components/add-keys-steps", () => ({
  Step2GenerateSeed: () => null,
  Step3ReviewKeys: ({ onNext }: any) => <button onClick={() => onNext(state.revokeMap)}>tick-done</button>,
  Step4Confirm: () => null
}));

import { ManageKeysDialog } from "@/app/(dynamicPages)/profile/[username]/permissions/_components/manage-keys-dialog";

const auth = (keys: string[], accountAuths: [string, number][] = []) => ({
  weight_threshold: 1,
  account_auths: accountAuths,
  key_auths: keys.map((k) => [k, 1])
});

function openRevoke() {
  render(<ManageKeysDialog show={true} onHide={vi.fn()} initialRevokeKey="STM_K" />);
  fireEvent.click(screen.getByText("tick-done"));
}

describe("RevokeConfirmStep - preflight and operation", () => {
  beforeEach(() => {
    state.errors = [];
    state.broadcast.mockClear();
    (useActiveAccount as any).mockReturnValue({ activeUser: { username: "alice" } });
    // K is the only owner key and also a posting key.
    state.account = {
      name: "alice",
      json_metadata: "",
      memo_key: "STM_MEMO",
      owner: auth(["STM_K"]),
      active: auth(["STM_ACTIVE", "STM_A2"]),
      posting: auth(["STM_K", "STM_P2"])
    };
  });

  it("a key ticked under posting only is removed from posting only, signed with active", async () => {
    state.revokeMap = { owner: [], active: [], posting: ["STM_K"], memo: [] };
    state.signerPub = "STM_ACTIVE";
    openRevoke();
    expect(screen.getByText("sign-with-key")).toHaveAttribute("data-authority", "active");
    fireEvent.click(screen.getByText("sign-with-key"));

    await waitFor(() => expect(state.broadcast).toHaveBeenCalledTimes(1));
    const body = (state.broadcast.mock.calls[0] as any[])[0][0][1];
    // The old flat builder also stripped K from owner (which K alone held)
    // and demanded owner authority for it.
    expect(body).not.toHaveProperty("owner");
    expect(body.posting.key_auths).toEqual([["STM_P2", 1]]);
    expect(body.active.key_auths).toEqual([["STM_ACTIVE", 1], ["STM_A2", 1]]);
    expect(state.errors).toEqual([]);
  });

  it("blocks a key that lacks the required authority before broadcasting", async () => {
    state.revokeMap = { owner: [], active: ["STM_A2"], posting: [], memo: [] };
    state.signerPub = "STM_P2";
    openRevoke();
    fireEvent.click(screen.getByText("sign-with-key"));

    await waitFor(() => expect(state.errors).toEqual(["permissions.keys.error-key-authority"]));
    expect(state.broadcast).not.toHaveBeenCalled();
  });

  it("lets an unknown key through when the authority delegates to an account", async () => {
    state.account.active = auth(["STM_ACTIVE", "STM_A2"], [["helper", 1]]);
    state.revokeMap = { owner: [], active: ["STM_A2"], posting: [], memo: [] };
    state.signerPub = "STM_HELPER_KEY";
    openRevoke();
    fireEvent.click(screen.getByText("sign-with-key"));

    await waitFor(() => expect(state.broadcast).toHaveBeenCalledTimes(1));
    expect(state.errors).toEqual([]);
  });
});
