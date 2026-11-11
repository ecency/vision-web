import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  callRPC: vi.fn(),
  broadcastOperationsWithKeys: vi.fn()
}));

// Real operation builders from source (pure); only chain I/O is mocked.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    "../../../../../../packages/sdk/src/modules/operations/builders/account"
  )),
  callRPC: rpc.callRPC,
  broadcastOperationsWithKeys: rpc.broadcastOperationsWithKeys
}));

import type { Authority, PostRecoveryCleanupItem, PrivateKey } from "@ecency/sdk";
import type { RecoveryKeySet } from "@/features/account-recovery/recovery-keys";
import {
  RECOVERY_HISTORY_PAGE_CAP,
  loadCleanupItems,
  loadRecentPostingAuthAdds,
  loadRecoveryChainState,
  submitCleanupItems,
  submitRecoverAccount,
  submitReplaceKeys,
  verifyRecoveredKeys
} from "@/features/account-recovery/recovery-chain";

const NEW = {
  owner: "STM_NEW_OWNER",
  active: "STM_NEW_ACTIVE",
  posting: "STM_NEW_POSTING",
  memo: "STM_NEW_MEMO"
};
const keys = {
  owner: { tag: "owner" },
  active: { tag: "active" },
  posting: { tag: "posting" },
  memo: { tag: "memo" },
  publicKeys: NEW
} as unknown as RecoveryKeySet;

const auth = (keys: string[], accounts: string[] = [], threshold = 1, keyWeight = 1): Authority => ({
  weight_threshold: threshold,
  account_auths: accounts.map((a) => [a, 1] as [string, number]),
  key_auths: keys.map((k) => [k, keyWeight] as [string, number])
});

function chainAccount(overrides: Record<string, unknown> = {}) {
  return {
    name: "alice",
    owner: auth(["STM_PREV_OWNER"], ["owner.friend"]),
    active: auth(["STM_PREV_ACTIVE"], ["active.app"]),
    posting: auth(["STM_PREV_POSTING"], ["ecency.app", "unknown.app"]),
    memo_key: "STM_PREV_MEMO",
    json_metadata: '{"a":1}',
    recovery_account: "ecency",
    last_owner_update: "2026-11-10T11:00:00",
    previous_owner_update: "2026-11-01T00:00:00",
    last_account_recovery: "1970-01-01T00:00:00",
    vesting_withdraw_rate: { amount: "1500000", precision: 6, nai: "@@000000037" },
    ...overrides
  };
}

type Routes = Record<string, (params: unknown) => unknown>;
function route(routes: Routes) {
  rpc.callRPC.mockImplementation(async (method: string, params: unknown) => {
    const handler = routes[method];
    if (!handler) throw new Error(`unexpected ${method}`);
    return handler(params);
  });
}

describe("recovery chain helpers", () => {
  beforeEach(() => {
    rpc.callRPC.mockReset();
    rpc.broadcastOperationsWithKeys.mockReset();
    rpc.broadcastOperationsWithKeys.mockResolvedValue({ id: "tx" });
  });

  describe("loadRecoveryChainState", () => {
    it("reads timing fields, head time and owner history fresh from the chain", async () => {
      const history = [{ id: 1, last_valid_time: "2026-11-09T00:00:00" }];
      route({
        "database_api.find_accounts": () => ({ accounts: [chainAccount()] }),
        "condenser_api.get_owner_history": () => history,
        "database_api.get_dynamic_global_properties": () => ({ time: "2026-11-10T12:00:00" })
      });

      const state = await loadRecoveryChainState("alice");
      expect(state.headTime).toBe(Date.parse("2026-11-10T12:00:00Z"));
      expect(state.ownerHistory).toBe(history);
      expect(state.lastRecoveryTime).toBeNull();
      expect(state.account.previous_owner_update).toBe("2026-11-01T00:00:00");
      expect(state.account.vesting_withdraw_rate).toBe("1.500000 VESTS");
      expect(rpc.callRPC).toHaveBeenCalledWith("database_api.find_accounts", { accounts: ["alice"] });
    });

    it("uses last_account_recovery for the lineage rule", async () => {
      route({
        "database_api.find_accounts": () => ({
          accounts: [chainAccount({ last_account_recovery: "2026-11-05T08:00:00" })]
        }),
        "condenser_api.get_owner_history": () => [],
        "database_api.get_dynamic_global_properties": () => ({ time: "2026-11-10T12:00:00" })
      });
      expect((await loadRecoveryChainState("alice")).lastRecoveryTime).toBe("2026-11-05T08:00:00");
    });

    it("fails when the account cannot be read", async () => {
      route({
        "database_api.find_accounts": () => ({ accounts: [] }),
        "condenser_api.get_owner_history": () => [],
        "database_api.get_dynamic_global_properties": () => ({ time: "2026-11-10T12:00:00" })
      });
      await expect(loadRecoveryChainState("alice")).rejects.toThrow();
    });
  });

  it("tx1 signs recover_account with the old and the new owner key", async () => {
    const recent = auth(["STM_OLD"]);
    await submitRecoverAccount({
      username: "alice",
      oldKey: { tag: "old" } as unknown as PrivateKey,
      newOwnerKey: keys.owner,
      newOwnerPublicKey: NEW.owner,
      recentOwnerAuthority: recent
    });
    const [ops, signers] = rpc.broadcastOperationsWithKeys.mock.calls[0];
    expect(ops).toEqual([
      [
        "recover_account",
        {
          account_to_recover: "alice",
          new_owner_authority: auth([NEW.owner]),
          recent_owner_authority: recent,
          extensions: []
        }
      ]
    ]);
    expect(signers).toEqual([{ tag: "old" }, keys.owner]);
  });

  describe("submitReplaceKeys (tx2)", () => {
    function setup(pendingRequests: unknown[], recoveryAccount = "ecency") {
      route({
        "database_api.find_accounts": () => ({
          accounts: [
            chainAccount({
              recovery_account: recoveryAccount,
              owner: auth([NEW.owner], ["owner.friend"]),
              // Added between tx1 and tx2: must not survive.
              active: auth(["STM_PREV_ACTIVE"], ["active.app", "late.app"])
            })
          ]
        }),
        "database_api.find_change_recovery_account_requests": () => ({ requests: pendingRequests })
      });
    }

    it("re-reads the account and keeps only the chosen account authorities per role", async () => {
      setup([]);
      await submitReplaceKeys({
        username: "alice",
        newKeys: keys,
        keepAccountAuths: { active: ["active.app"], posting: ["ecency.app"] }
      });

      const [ops, signers] = rpc.broadcastOperationsWithKeys.mock.calls[0];
      expect(signers).toEqual([keys.owner]);
      expect(ops).toHaveLength(1);
      const body = ops[0][1];
      expect(ops[0][0]).toBe("account_update");
      expect(body.owner).toEqual(auth([NEW.owner]));
      expect(body.active).toEqual(auth([NEW.active], ["active.app"]));
      expect(body.posting).toEqual(auth([NEW.posting], ["ecency.app"]));
      expect(body.memo_key).toBe(NEW.memo);
      expect(body.json_metadata).toBe('{"a":1}');
    });

    it("keeps each role's threshold with the new key meeting it alone", async () => {
      route({
        "database_api.find_accounts": () => ({
          accounts: [
            chainAccount({
              owner: auth([NEW.owner], ["owner.friend"]),
              active: auth(["STM_PREV_ACTIVE", "STM_COSIGNER"], ["active.app"], 2)
            })
          ]
        }),
        "database_api.find_change_recovery_account_requests": () => ({ requests: [] })
      });
      await submitReplaceKeys({
        username: "alice",
        newKeys: keys,
        keepAccountAuths: { active: ["active.app"], posting: [] }
      });
      const body = rpc.broadcastOperationsWithKeys.mock.calls[0][0][0][1];
      expect(body.owner).toEqual(auth([NEW.owner]));
      expect(body.active).toEqual(auth([NEW.active], ["active.app"], 2, 2));
    });

    it("re-reads pending recovery account changes after tx1 and cancels one when present", async () => {
      setup([{ account_to_recover: "alice", recovery_account: "elsewhere" }]);
      await submitReplaceKeys({
        username: "alice",
        newKeys: keys,
        keepAccountAuths: { active: [], posting: [] }
      });
      const [ops] = rpc.broadcastOperationsWithKeys.mock.calls[0];
      expect(ops[1]).toEqual([
        "change_recovery_account",
        { account_to_recover: "alice", new_recovery_account: "ecency", extensions: [] }
      ]);
      expect(rpc.callRPC).toHaveBeenCalledWith("database_api.find_change_recovery_account_requests", {
        accounts: ["alice"]
      });
    });

    it("cancels a pending change by keeping the current partner recovery account", async () => {
      setup([{ account_to_recover: "alice", recovery_account: "elsewhere" }], "appreciator");
      await submitReplaceKeys({
        username: "alice",
        newKeys: keys,
        keepAccountAuths: { active: [], posting: [] }
      });
      const [ops] = rpc.broadcastOperationsWithKeys.mock.calls[0];
      expect(ops[1]).toEqual([
        "change_recovery_account",
        { account_to_recover: "alice", new_recovery_account: "appreciator", extensions: [] }
      ]);
    });

    it("keeps a pending change to Ecency instead of cancelling it", async () => {
      setup([{ account_to_recover: "alice", recovery_account: "ecency" }], "appreciator");
      await submitReplaceKeys({
        username: "alice",
        newKeys: keys,
        keepAccountAuths: { active: [], posting: [] }
      });
      const [ops] = rpc.broadcastOperationsWithKeys.mock.calls[0];
      expect(ops.map(([name]: [string]) => name)).toEqual(["account_update"]);
    });

    it("ignores pending changes for other accounts", async () => {
      setup([{ account_to_recover: "bob", recovery_account: "elsewhere" }]);
      await submitReplaceKeys({
        username: "alice",
        newKeys: keys,
        keepAccountAuths: { active: [], posting: [] }
      });
      expect(rpc.broadcastOperationsWithKeys.mock.calls[0][0]).toHaveLength(1);
    });
  });

  describe("verifyRecoveredKeys", () => {
    it("is true only when every role holds exactly the new key", async () => {
      route({
        "database_api.find_accounts": () => ({
          accounts: [
            chainAccount({
              owner: auth([NEW.owner]),
              active: auth([NEW.active], ["active.app"]),
              posting: auth([NEW.posting], ["ecency.app"]),
              memo_key: NEW.memo
            })
          ]
        })
      });
      await expect(verifyRecoveredKeys("alice", NEW)).resolves.toBe(true);
    });

    it("is false while any old key remains", async () => {
      route({
        "database_api.find_accounts": () => ({
          accounts: [
            chainAccount({
              owner: auth([NEW.owner]),
              active: auth([NEW.active, "STM_PREV_ACTIVE"]),
              posting: auth([NEW.posting]),
              memo_key: NEW.memo
            })
          ]
        })
      });
      await expect(verifyRecoveredKeys("alice", NEW)).resolves.toBe(false);
    });

    const verifyWith = (overrides: Record<string, unknown>) => {
      route({
        "database_api.find_accounts": () => ({
          accounts: [
            chainAccount({
              owner: auth([NEW.owner]),
              active: auth([NEW.active]),
              posting: auth([NEW.posting]),
              memo_key: NEW.memo,
              ...overrides
            })
          ]
        })
      });
      return verifyRecoveredKeys("alice", NEW);
    };

    it("is true when a kept threshold is met by the new key alone", async () => {
      await expect(verifyWith({ active: auth([NEW.active], ["active.app"], 3, 3) })).resolves.toBe(true);
    });

    it("is false when the new key cannot meet its role's threshold alone", async () => {
      await expect(verifyWith({ active: auth([NEW.active], ["active.app"], 2, 1) })).resolves.toBe(false);
      await expect(verifyWith({ posting: auth([NEW.posting], [], 2, 1) })).resolves.toBe(false);
    });

    it("is false while the owner still has account authorities", async () => {
      await expect(verifyWith({ owner: auth([NEW.owner], ["owner.friend"]) })).resolves.toBe(false);
    });

    it("is false when the owner is not exactly the new key with threshold 1", async () => {
      await expect(verifyWith({ owner: auth([NEW.owner], [], 2, 2) })).resolves.toBe(false);
    });

    it("is false when the owner threshold is not 1", async () => {
      route({
        "database_api.find_accounts": () => ({
          accounts: [
            chainAccount({
              owner: auth([NEW.owner], [], 2),
              active: auth([NEW.active]),
              posting: auth([NEW.posting]),
              memo_key: NEW.memo
            })
          ]
        })
      });
      await expect(verifyRecoveredKeys("alice", NEW)).resolves.toBe(false);
    });
  });

  it("loads posting authorities added after the takeover from account updates", async () => {
    route({
      "condenser_api.get_account_history": () => [
        [
          1,
          {
            timestamp: "2026-11-09T02:00:00",
            op: ["account_update", { posting: auth([], ["late.app"]) }]
          }
        ]
      ]
    });
    const added = await loadRecentPostingAuthAdds("alice", "2026-11-08T00:00:00");
    expect([...added.keys()]).toEqual(["late.app"]);
    const [method, params] = rpc.callRPC.mock.calls[0];
    expect(method).toBe("condenser_api.get_account_history");
    expect(params).toEqual(["alice", -1, 1000, 2 ** 9 + 2 ** 10 + 2 ** 23 + 2 ** 41 + 2 ** 43, 0]);
  });

  describe("loadRecentPostingAuthAdds paging", () => {
    const CUTOFF = "2026-11-08T00:00:00";
    const row = (num: number, timestamp: string, names?: string[]) => [
      num,
      {
        timestamp,
        op: ["account_update", names ? { posting: auth([], names) } : { json_metadata: "{}" }]
      }
    ];
    /** A full page of updates after the cutoff that touch nothing but metadata. */
    const flood = (lastNum: number) =>
      Array.from({ length: 1000 }, (_, i) => row(lastNum - 999 + i, "2026-11-09T10:00:00"));

    it("reads older pages until the history reaches 30 days before the cutoff", async () => {
      const pages: Record<number, unknown[]> = {
        [-1]: flood(5999),
        4999: [
          row(4000, "2026-11-01T00:00:00", ["ecency.app", "early.app"]),
          row(4001, "2026-11-08T00:00:03", ["ecency.app", "early.app", "late.app"]),
          ...Array.from({ length: 998 }, (_, i) => row(4002 + i, "2026-11-09T09:00:00"))
        ],
        3999: [
          row(3000, "2026-09-15T00:00:00", ["ecency.app"]),
          ...Array.from({ length: 999 }, (_, i) => row(3001 + i, "2026-10-20T00:00:00"))
        ]
      };
      rpc.callRPC.mockImplementation(async (_method: string, params: unknown) => {
        return pages[(params as number[])[1]] ?? [];
      });

      const added = await loadRecentPostingAuthAdds("alice", CUTOFF);
      expect([...added.keys()].sort()).toEqual(["early.app", "late.app"]);
      expect(added.get("early.app")).toBe("2026-11-01T00:00:00");
      expect(rpc.callRPC).toHaveBeenCalledTimes(3);
      expect(rpc.callRPC.mock.calls[1][1]).toEqual(["alice", 4999, 1000, 2 ** 9 + 2 ** 10 + 2 ** 23 + 2 ** 41 + 2 ** 43, 0]);
      expect(rpc.callRPC.mock.calls[2][1]).toEqual(["alice", 3999, 1000, 2 ** 9 + 2 ** 10 + 2 ** 23 + 2 ** 41 + 2 ** 43, 0]);
    });

    it("fails when the cutoff is not reached within the page cap", async () => {
      let next = 100000;
      rpc.callRPC.mockImplementation(async () => {
        const page = flood(next);
        next -= 1000;
        return page;
      });
      await expect(loadRecentPostingAuthAdds("alice", CUTOFF)).rejects.toThrow();
      expect(rpc.callRPC).toHaveBeenCalledTimes(RECOVERY_HISTORY_PAGE_CAP);
    });

    it("stops at the start of the history", async () => {
      rpc.callRPC.mockResolvedValueOnce([row(0, "2026-11-09T00:00:00", ["late.app"])]);
      const added = await loadRecentPostingAuthAdds("alice", CUTOFF);
      expect([...added.keys()]).toEqual(["late.app"]);
      expect(rpc.callRPC).toHaveBeenCalledTimes(1);
    });
  });

  it("builds clean-up items, keeping the recurrent transfer pair id", async () => {
    route({
      "database_api.find_accounts": () => ({ accounts: [chainAccount()] }),
      "condenser_api.get_withdraw_routes": () => [],
      "condenser_api.get_savings_withdraw_from": () => [],
      "condenser_api.find_recurrent_transfers": () => [
        { from: "alice", to: "bob", amount: "1.000 HIVE", recurrence: 24, remaining_executions: 4, pair_id: 2 }
      ],
      "condenser_api.get_open_orders": () => []
    });
    const items = await loadCleanupItems("alice");
    expect(items.map((i) => i.kind)).toEqual(["power-down", "recurrent-transfer"]);
    expect((items[1].op[1] as { extensions: unknown[] }).extensions).toEqual([{ type: 1, value: { pair_id: 2 } }]);
  });

  it("sends each clean-up item as its own transaction and reports every result", async () => {
    rpc.broadcastOperationsWithKeys
      .mockResolvedValueOnce({ id: "a" })
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValueOnce({ id: "c" });
    const items = [
      { id: "1", kind: "power-down", op: ["withdraw_vesting", {}] },
      { id: "2", kind: "open-order", op: ["limit_order_cancel", {}] },
      { id: "3", kind: "open-order", op: ["limit_order_cancel", { orderid: 3 }] }
    ] as unknown as PostRecoveryCleanupItem[];

    const results = await submitCleanupItems("alice", items, keys.active);

    expect(rpc.broadcastOperationsWithKeys).toHaveBeenCalledTimes(3);
    rpc.broadcastOperationsWithKeys.mock.calls.forEach(([ops, signers], i) => {
      expect(ops).toEqual([items[i].op]);
      expect(signers).toEqual([keys.active]);
    });
    expect(results).toEqual([
      { id: "1", ok: true },
      { id: "2", ok: false, error: "nope" },
      { id: "3", ok: true }
    ]);
  });
});
