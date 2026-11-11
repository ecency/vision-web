import { describe, expect, it } from "vitest";
import {
  checkOwnerHistoryEntry,
  findRecentPostingAuthAdds,
  findRecoverableEntry,
  getHourlyLimitWaitUntil,
  isWithinRecoveryWindow,
  parseChainTime,
  type HistoryRow
} from "@/features/account-recovery/recovery-eligibility";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-10T12:00:00Z");

function entry(id: number, keys: string[], lastValid: string) {
  return {
    id,
    account: "alice",
    previous_owner_authority: {
      weight_threshold: 1,
      account_auths: [] as [string, number][],
      key_auths: keys.map((k) => [k, 1] as [string, number])
    },
    last_valid_time: lastValid
  };
}

describe("parseChainTime", () => {
  it("reads chain times without a zone suffix as UTC", () => {
    expect(parseChainTime("2026-11-10T12:00:00")).toBe(NOW);
    expect(parseChainTime("2026-11-10T12:00:00Z")).toBe(NOW);
  });
});

describe("checkOwnerHistoryEntry: 30 day window", () => {
  it("accepts an entry that stopped being valid 29 days ago", () => {
    const e = entry(1, ["K"], new Date(NOW - 29 * DAY).toISOString().slice(0, 19));
    expect(checkOwnerHistoryEntry(e, { lastRecoveryTime: null, now: NOW })).toBe("ok");
  });

  it("rejects an entry exactly 30 days old and older", () => {
    const exact = entry(1, ["K"], new Date(NOW - 30 * DAY).toISOString().slice(0, 19));
    const older = entry(2, ["K"], new Date(NOW - 31 * DAY).toISOString().slice(0, 19));
    expect(checkOwnerHistoryEntry(exact, { lastRecoveryTime: null, now: NOW })).toBe("too-old");
    expect(checkOwnerHistoryEntry(older, { lastRecoveryTime: null, now: NOW })).toBe("too-old");
  });
});

describe("checkOwnerHistoryEntry: lineage rule", () => {
  const recovery = "2026-11-05T08:00:00";

  it("rejects the key that a recovery replaced (same time as the recovery)", () => {
    expect(
      checkOwnerHistoryEntry(entry(1, ["K"], recovery), { lastRecoveryTime: recovery, now: NOW })
    ).toBe("before-recovery");
  });

  it("rejects the replaced key on real chain timing (one block before the recovery op)", () => {
    // Mainnet: the recover_account op is stamped 14:25:30 while the replaced key's
    // last_valid_time is 14:25:27, three seconds (one block) earlier.
    expect(
      checkOwnerHistoryEntry(entry(1, ["K"], "2026-11-10T14:25:27"), {
        lastRecoveryTime: "2026-11-10T14:25:30",
        now: Date.parse("2026-11-10T15:00:00Z")
      })
    ).toBe("before-recovery");
  });

  it("rejects a key from before the recovery", () => {
    expect(
      checkOwnerHistoryEntry(entry(1, ["K"], "2026-11-04T08:00:00"), {
        lastRecoveryTime: recovery,
        now: NOW
      })
    ).toBe("before-recovery");
  });

  it("accepts a key one second newer than the recovery", () => {
    expect(
      checkOwnerHistoryEntry(entry(1, ["K"], "2026-11-05T08:00:01"), {
        lastRecoveryTime: recovery,
        now: NOW
      })
    ).toBe("ok");
  });

  it("has no lineage constraint when the account was never recovered", () => {
    expect(
      checkOwnerHistoryEntry(entry(1, ["K"], "2026-11-01T00:00:00"), {
        lastRecoveryTime: null,
        now: NOW
      })
    ).toBe("ok");
  });
});

describe("findRecoverableEntry", () => {
  const history = [
    entry(1, ["OLD_A"], "2026-10-01T00:00:00"),
    entry(2, ["OLD_B", "SHARED"], "2026-11-01T00:00:00"),
    entry(3, ["SHARED"], "2026-11-08T00:00:00")
  ];

  it("returns no-match when no key appears in owner history", () => {
    expect(findRecoverableEntry(["NOPE"], history, { lastRecoveryTime: null, now: NOW })).toEqual({
      status: "no-match"
    });
  });

  it("explains why a matching key cannot be used", () => {
    expect(findRecoverableEntry(["OLD_A"], history, { lastRecoveryTime: null, now: NOW })).toEqual({
      status: "too-old"
    });
    expect(
      findRecoverableEntry(["OLD_B"], history, {
        lastRecoveryTime: "2026-11-02T00:00:00",
        now: NOW
      })
    ).toEqual({ status: "before-recovery" });
  });

  it("uses the valid entry with the latest last_valid_time when several match", () => {
    const result = findRecoverableEntry(["SHARED"], history, { lastRecoveryTime: null, now: NOW });
    expect(result).toEqual({ status: "match", entry: history[2], publicKey: "SHARED" });
  });
});

describe("findRecoverableEntry: key weight", () => {
  it("rejects a key that cannot satisfy the old owner authority alone", () => {
    const multisig = {
      ...entry(1, ["K1", "K2"], "2026-11-09T00:00:00"),
      previous_owner_authority: {
        weight_threshold: 2,
        account_auths: [] as [string, number][],
        key_auths: [
          ["K1", 1],
          ["K2", 1]
        ] as [string, number][]
      }
    };
    expect(findRecoverableEntry(["K1"], [multisig], { lastRecoveryTime: null, now: NOW })).toEqual({
      status: "not-sufficient"
    });
  });
});

describe("getHourlyLimitWaitUntil (recover_account and key update gates)", () => {
  it("is null once more than an hour has passed", () => {
    expect(getHourlyLimitWaitUntil("2026-11-10T10:59:59", NOW)).toBeNull();
  });

  it("returns one hour after the given time while inside the hour", () => {
    expect(getHourlyLimitWaitUntil("2026-11-10T11:30:00", NOW)?.toISOString()).toBe(
      "2026-11-10T12:30:00.000Z"
    );
  });

  it("still waits at exactly one hour (the chain needs strictly more)", () => {
    expect(getHourlyLimitWaitUntil("2026-11-10T11:00:00", NOW)).not.toBeNull();
  });

  it("treats a missing value or the 1970 sentinel as no limit", () => {
    expect(getHourlyLimitWaitUntil(undefined, NOW)).toBeNull();
    expect(getHourlyLimitWaitUntil("1970-01-01T00:00:00", NOW)).toBeNull();
  });
});

describe("isWithinRecoveryWindow (re-check before tx1 with a margin)", () => {
  it("needs more than the margin left in the 30 day window", () => {
    const lastValid = new Date(NOW - 30 * DAY + 11 * 60 * 1000).toISOString().slice(0, 19);
    const tooClose = new Date(NOW - 30 * DAY + 9 * 60 * 1000).toISOString().slice(0, 19);
    expect(isWithinRecoveryWindow(lastValid, NOW, 10 * 60 * 1000)).toBe(true);
    expect(isWithinRecoveryWindow(tooClose, NOW, 10 * 60 * 1000)).toBe(false);
  });
});

describe("findRecentPostingAuthAdds", () => {
  const update = (
    ts: string,
    names: string[] | null,
    op = "account_update",
    newAccount = "alice"
  ): HistoryRow => [
    0,
    {
      timestamp: ts,
      op: [
        op,
        {
          ...(op.includes("create") ? { new_account_name: newAccount } : {}),
          ...(names
            ? { posting: { account_auths: names.map((n) => [n, 1] as [string, number]) } }
            : {})
        }
      ]
    }
  ];
  const CUTOFF = "2026-11-08T12:00:00";
  const flagged = (rows: HistoryRow[]) =>
    [...findRecentPostingAuthAdds(rows, CUTOFF, "alice").keys()].sort();

  it("flags names that first appear in posting updates after the takeover", () => {
    const rows = [
      update("2026-09-01T00:00:00", ["ecency.app"]),
      update("2026-11-09T00:00:00", null),
      update("2026-11-09T02:00:00", ["ecency.app", "other.app"]),
      update("2026-11-09T03:00:00", ["ecency.app", "other.app", "third.app"], "account_update2")
    ];
    expect(flagged(rows)).toEqual(["other.app", "third.app"]);
    expect(findRecentPostingAuthAdds(rows, CUTOFF, "alice").get("other.app")).toBe("2026-11-09T02:00:00");
  });

  it("flags every name set in the window when no earlier posting update is known", () => {
    expect(flagged([update("2026-11-09T02:00:00", ["ecency.app", "other.app"])])).toEqual([
      "ecency.app",
      "other.app"
    ]);
  });

  it("uses the account creation as the baseline before the first update", () => {
    const rows = [
      update("2024-03-04T16:08:15", ["ecency.app"], "create_claimed_account"),
      update("2026-11-08T12:00:00", ["ecency.app", "other.app"])
    ];
    expect(flagged(rows)).toEqual(["other.app"]);
  });

  it("never flags names the account was created with, even inside the window", () => {
    const rows = [
      update("2026-10-25T00:00:00", ["ecency.app"], "account_create"),
      update("2026-11-01T00:00:00", ["ecency.app"], "account_create_with_delegation"),
      update("2026-11-09T02:00:00", ["ecency.app", "other.app"])
    ];
    expect(flagged(rows)).toEqual(["other.app"]);
  });

  it("ignores accounts this account created, before or inside the window", () => {
    const rows = [
      update("2024-03-04T16:08:15", ["ecency.app"], "create_claimed_account"),
      update("2026-09-01T00:00:00", ["decoy.app"], "account_create", "decoy-one"),
      update("2026-11-08T11:00:00", ["attacker.app"], "create_claimed_account", "decoy-two"),
      update("2026-11-08T13:00:00", ["ecency.app", "decoy.app", "attacker.app"])
    ];
    expect(flagged(rows)).toEqual(["attacker.app", "decoy.app"]);
  });

  it("treats a posting update at exactly the cutoff as suspect", () => {
    const rows = [
      update("2026-09-01T00:00:00", ["ecency.app"]),
      update(CUTOFF, ["ecency.app", "same.time.app"])
    ];
    expect(flagged(rows)).toEqual(["same.time.app"]);
  });

  it("flags a name added shortly before the owner change, with its time", () => {
    const rows = [
      update("2026-09-01T00:00:00", ["ecency.app"]),
      update("2026-11-08T11:50:00", ["ecency.app", "early.app"])
    ];
    expect(flagged(rows)).toEqual(["early.app"]);
    expect(findRecentPostingAuthAdds(rows, CUTOFF, "alice").get("early.app")).toBe("2026-11-08T11:50:00");
  });

  it("keeps a name added well before the window", () => {
    const rows = [
      update("2026-09-29T12:00:00", ["ecency.app", "old.app"]),
      update("2026-11-09T02:00:00", ["ecency.app", "old.app"])
    ];
    expect(flagged(rows)).toEqual([]);
  });

  it("flags a name removed and added again inside the window, with the re-add time", () => {
    const rows = [
      update("2026-09-01T00:00:00", ["ecency.app", "old.app"]),
      update("2026-10-20T00:00:00", ["ecency.app"]),
      update("2026-11-02T00:00:00", ["ecency.app", "old.app"]),
      update("2026-11-05T00:00:00", ["ecency.app"]),
      update("2026-11-09T00:00:00", ["ecency.app", "old.app"])
    ];
    expect(flagged(rows)).toEqual(["old.app"]);
    expect(findRecentPostingAuthAdds(rows, CUTOFF, "alice").get("old.app")).toBe("2026-11-09T00:00:00");
  });

  it("does not flag a name present throughout", () => {
    const rows = [
      update("2026-09-01T00:00:00", ["ecency.app", "old.app"]),
      update("2026-10-20T00:00:00", ["ecency.app", "old.app", "x.app"]),
      update("2026-11-09T00:00:00", ["ecency.app", "old.app"])
    ];
    expect(flagged(rows)).toEqual(["x.app"]);
  });

  it("flags nothing when no posting update happened in the window", () => {
    expect(flagged([update("2026-09-01T00:00:00", ["ecency.app"])])).toEqual([]);
  });
});
