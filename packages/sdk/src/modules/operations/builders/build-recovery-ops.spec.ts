import { describe, expect, it } from "vitest";
import {
  buildPostRecoveryCleanupOps,
  buildRecoveryRecoverAccountOp,
  buildRecoveryReplaceKeysOp,
} from "./account";

const OLD = {
  owner: "STM_OLD_OWNER",
  ownerExtra: "STM_EXTRA_OWNER",
  active: "STM_OLD_ACTIVE",
  posting: "STM_OLD_POSTING",
  memo: "STM_OLD_MEMO",
};
const NEW = {
  owner: "STM_NEW_OWNER",
  active: "STM_NEW_ACTIVE",
  posting: "STM_NEW_POSTING",
  memo: "STM_NEW_MEMO",
};

const account = {
  name: "alice",
  owner: {
    weight_threshold: 1,
    account_auths: [] as [string, number][],
    key_auths: [
      [OLD.owner, 1],
      [OLD.ownerExtra, 1],
    ] as [string, number][],
  },
  active: {
    weight_threshold: 1,
    account_auths: [["some.app", 1]] as [string, number][],
    key_auths: [[OLD.active, 1]] as [string, number][],
  },
  posting: {
    weight_threshold: 1,
    account_auths: [
      ["ecency.app", 1],
      ["peakd.app", 1],
    ] as [string, number][],
    key_auths: [
      [OLD.posting, 1],
      ["STM_EXTRA_POSTING", 1],
    ] as [string, number][],
  },
  memo_key: OLD.memo,
  json_metadata: '{"profile":{"name":"Alice"}}',
};

describe("buildRecoveryRecoverAccountOp", () => {
  it("uses the exact matching previous owner authority and a single new owner key", () => {
    const recent = {
      weight_threshold: 1,
      account_auths: [],
      key_auths: [
        ["STM_A", 1],
        ["STM_B", 1],
      ] as [string, number][],
    };
    const [name, body] = buildRecoveryRecoverAccountOp("alice", NEW.owner, recent) as any;
    expect(name).toBe("recover_account");
    expect(body.account_to_recover).toBe("alice");
    expect(body.recent_owner_authority).toBe(recent);
    expect(body.new_owner_authority).toEqual({
      weight_threshold: 1,
      account_auths: [],
      key_auths: [[NEW.owner, 1]],
    });
    expect(body.extensions).toEqual([]);
  });
});

describe("buildRecoveryReplaceKeysOp", () => {
  it("replaces every key with the single new key and keeps account_auths", () => {
    const [name, body] = buildRecoveryReplaceKeysOp(account, NEW) as any;
    expect(name).toBe("account_update");
    expect(body.account).toBe("alice");
    expect(body.owner).toEqual({ weight_threshold: 1, account_auths: [], key_auths: [[NEW.owner, 1]] });
    expect(body.active).toEqual({
      weight_threshold: 1,
      account_auths: [["some.app", 1]],
      key_auths: [[NEW.active, 1]],
    });
    expect(body.posting).toEqual({
      weight_threshold: 1,
      account_auths: [
        ["ecency.app", 1],
        ["peakd.app", 1],
      ],
      key_auths: [[NEW.posting, 1]],
    });
    expect(body.memo_key).toBe(NEW.memo);
    expect(body.json_metadata).toBe(account.json_metadata);
  });

  it("drops ALL old keys, including extra keys a third party added", () => {
    const body = (buildRecoveryReplaceKeysOp(account, NEW) as any)[1];
    const serialized = JSON.stringify(body);
    for (const old of [OLD.owner, OLD.ownerExtra, OLD.active, OLD.posting, OLD.memo, "STM_EXTRA_POSTING"]) {
      expect(serialized).not.toContain(old);
    }
  });

  it("keeps each role's threshold and gives the new key that weight, retained accounts keep theirs", () => {
    const multi = {
      ...account,
      active: {
        weight_threshold: 2,
        account_auths: [["co.signer", 1]] as [string, number][],
        key_auths: [[OLD.active, 1], ["STM_OTHER_ACTIVE", 1]] as [string, number][],
      },
      posting: {
        weight_threshold: 3,
        account_auths: [["app.one", 1], ["app.two", 3]] as [string, number][],
        key_auths: [[OLD.posting, 3]] as [string, number][],
      },
    };
    const body = (buildRecoveryReplaceKeysOp(multi, NEW) as any)[1];
    expect(body.active).toEqual({
      weight_threshold: 2,
      account_auths: [["co.signer", 1]],
      key_auths: [[NEW.active, 2]],
    });
    expect(body.posting).toEqual({
      weight_threshold: 3,
      account_auths: [["app.one", 1], ["app.two", 3]],
      key_auths: [[NEW.posting, 3]],
    });
  });

  it("clamps a threshold above the largest key weight", () => {
    const big = {
      ...account,
      active: { weight_threshold: 100000, account_auths: [], key_auths: [[OLD.active, 1]] as [string, number][] },
    };
    const body = (buildRecoveryReplaceKeysOp(big, NEW) as any)[1];
    expect(body.active).toEqual({ weight_threshold: 65535, account_auths: [], key_auths: [[NEW.active, 65535]] });
  });

  it("drops a role's account_auths when its threshold had to be clamped", () => {
    const big = {
      ...account,
      active: {
        weight_threshold: 70000,
        account_auths: [["co.signer", 65535]] as [string, number][],
        key_auths: [[OLD.active, 70000]] as [string, number][],
      },
    };
    const body = (buildRecoveryReplaceKeysOp(big, NEW) as any)[1];
    expect(body.active).toEqual({ weight_threshold: 65535, account_auths: [], key_auths: [[NEW.active, 65535]] });
    const chosen = (
      buildRecoveryReplaceKeysOp(big, NEW, { accountAuths: { active: [["co.signer", 65535]] } }) as any
    )[1];
    expect(chosen.active.account_auths).toEqual([]);
    expect(body.posting.account_auths).toHaveLength(2);
  });

  it("keeps account_auths at exactly the largest threshold", () => {
    const max = {
      ...account,
      active: { weight_threshold: 65535, account_auths: [["co.signer", 1]] as [string, number][], key_auths: [[OLD.active, 65535]] as [string, number][] },
    };
    const body = (buildRecoveryReplaceKeysOp(max, NEW) as any)[1];
    expect(body.active.account_auths).toEqual([["co.signer", 1]]);
  });

  it("always sets the owner to the new key alone with threshold 1", () => {
    const withOwnerAuths = {
      ...account,
      owner: { ...account.owner, weight_threshold: 2, account_auths: [["owner.friend", 1]] as [string, number][] },
    };
    const body = (buildRecoveryReplaceKeysOp(withOwnerAuths, NEW) as any)[1];
    expect(body.owner).toEqual({ weight_threshold: 1, account_auths: [], key_auths: [[NEW.owner, 1]] });
  });

  it("lets the caller choose which account_auths stay per role", () => {
    const body = (
      buildRecoveryReplaceKeysOp(account, NEW, { accountAuths: { active: [] } }) as any
    )[1];
    expect(body.active.account_auths).toEqual([]);
    expect(body.posting.account_auths).toHaveLength(2);
  });

  it("does not mutate the account object", () => {
    const before = JSON.stringify(account);
    buildRecoveryReplaceKeysOp(account, NEW);
    expect(JSON.stringify(account)).toBe(before);
  });
});

describe("buildPostRecoveryCleanupOps", () => {
  const idle = {
    name: "alice",
    vesting_withdraw_rate: "0.000000 VESTS",
  };

  it("returns nothing when there is nothing to clean up", () => {
    expect(buildPostRecoveryCleanupOps(idle, {})).toEqual([]);
  });

  it("builds only the operations for items that are present", () => {
    const items = buildPostRecoveryCleanupOps(
      { name: "alice", vesting_withdraw_rate: "1234.567890 VESTS" },
      {
        withdrawRoutes: [
          { from_account: "alice", to_account: "bob", percent: 10000, auto_vest: false },
        ],
        savingsWithdrawals: [{ request_id: 7 }],
        recurrentTransfers: [
          { from: "alice", to: "bob", amount: "5.000 HBD", recurrence: 24, remaining_executions: 10 },
        ],
        openOrders: [{ orderid: 99 }],
      }
    );

    expect(items.map((i) => i.kind)).toEqual([
      "power-down",
      "withdraw-route",
      "savings-withdrawal",
      "recurrent-transfer",
      "open-order",
    ]);
    expect(items.map((i) => i.op)).toEqual([
      ["withdraw_vesting", { account: "alice", vesting_shares: "0.000000 VESTS" }],
      [
        "set_withdraw_vesting_route",
        { from_account: "alice", to_account: "bob", percent: 0, auto_vest: false },
      ],
      ["cancel_transfer_from_savings", { from: "alice", request_id: 7 }],
      [
        "recurrent_transfer",
        {
          from: "alice",
          to: "bob",
          amount: "0.000 HBD",
          memo: "",
          recurrence: 24,
          executions: 10,
          extensions: [],
        },
      ],
      ["limit_order_cancel", { owner: "alice", orderid: 99 }],
    ]);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("skips routes already at 0 percent and transfers sent by other accounts", () => {
    const items = buildPostRecoveryCleanupOps(idle, {
      withdrawRoutes: [{ from_account: "alice", to_account: "bob", percent: 0, auto_vest: false }],
      recurrentTransfers: [
        { from: "bob", to: "alice", amount: "1.000 HIVE", recurrence: 24, remaining_executions: 3 },
      ],
    });
    expect(items).toEqual([]);
  });

  it("keeps at least two executions when stopping a recurrent transfer", () => {
    const [item] = buildPostRecoveryCleanupOps(idle, {
      recurrentTransfers: [
        { from: "alice", to: "bob", amount: "1.000 HIVE", recurrence: 48, remaining_executions: 1 },
      ],
    });
    expect((item.op as any)[1]).toMatchObject({ amount: "0.000 HIVE", recurrence: 48, executions: 2 });
  });

  it("carries the pair_id extension when stopping a paired recurrent transfer", () => {
    const items = buildPostRecoveryCleanupOps(idle, {
      recurrentTransfers: [
        { from: "alice", to: "bob", amount: "1.000 HIVE", recurrence: 24, remaining_executions: 5, pair_id: 0 },
        { from: "alice", to: "bob", amount: "2.000 HBD", recurrence: 24, remaining_executions: 5, pair_id: 3 },
      ],
    });
    expect(items).toHaveLength(2);
    expect((items[0].op as any)[1].extensions).toEqual([]);
    expect((items[1].op as any)[1].extensions).toEqual([{ type: 1, value: { pair_id: 3 } }]);
    expect(items[0].id).not.toBe(items[1].id);
    expect(items[1].id).toContain("3");
  });
});
