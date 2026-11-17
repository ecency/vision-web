import { beforeEach, describe, expect, it, vi } from "vitest";

// #2126: through HiveSigner, revoke-posting and change-recovery only open
// HiveSigner's signing page. Nothing is signed yet, so the mutation must not
// report success (the dialog closing, a success toast) or remove the app from
// the cached account as if it were done.

const h = vi.hoisted(() => ({ setQueryData: vi.fn(), sendOperation: vi.fn(() => undefined) }));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useMutation: (options: unknown) => options,
    useQueryClient: () => ({ setQueryData: h.setQueryData }),
    useQuery: () => ({
      data: {
        name: "alice",
        memo_key: "STM1",
        json_metadata: "",
        owner: { key_auths: [["STM2", 1]], account_auths: [], weight_threshold: 1 },
        active: { key_auths: [["STM3", 1]], account_auths: [], weight_threshold: 1 },
        posting: { key_auths: [["STM4", 1]], account_auths: [["ecency.app", 1]], weight_threshold: 1 }
      }
    })
  };
});
vi.mock("hivesigner", () => ({ default: { sendOperation: h.sendOperation }, sendOperation: h.sendOperation }));
vi.mock("@/modules/core/hive-tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/core/hive-tx")>()),
  broadcastOperations: vi.fn(async () => ({ id: "tx", block_num: 1, trx_num: 0, expired: false }))
}));

import { useAccountRevokePosting } from "./use-account-revoke-posting";
import { useAccountUpdateRecovery } from "./use-account-update-recovery";

type Options = { mutationFn: (p: any) => Promise<unknown>; onSuccess: (r: unknown, p: any, c: unknown) => void };

beforeEach(() => {
  h.setQueryData.mockClear();
  h.sendOperation.mockClear();
});

describe("revoke posting through HiveSigner", () => {
  it("opens HiveSigner but reports no success and keeps the cached authority", async () => {
    const onSuccess = vi.fn();
    const options = useAccountRevokePosting("alice", { onSuccess }) as unknown as Options;
    const payload = { accountName: "ecency.app", type: "hivesigner" };
    const result = await options.mutationFn(payload);
    options.onSuccess(result, payload, undefined);
    expect(h.sendOperation).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(h.setQueryData).not.toHaveBeenCalled();
  });

  it("still reports a key-signed revoke", async () => {
    const onSuccess = vi.fn();
    const options = useAccountRevokePosting("alice", { onSuccess }) as unknown as Options;
    const payload = { accountName: "ecency.app", type: "key", key: {} };
    const result = await options.mutationFn(payload);
    options.onSuccess(result, payload, undefined);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(h.setQueryData).toHaveBeenCalledTimes(1);
  });
});

describe("change recovery account through HiveSigner", () => {
  it("opens HiveSigner but reports no success", async () => {
    const onSuccess = vi.fn();
    const options = useAccountUpdateRecovery("alice", "", { onSuccess } as any) as unknown as Options;
    const payload = { accountName: "bob", type: "hivesigner" };
    const result = await options.mutationFn(payload);
    options.onSuccess(result, payload, undefined);
    expect(h.sendOperation).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
