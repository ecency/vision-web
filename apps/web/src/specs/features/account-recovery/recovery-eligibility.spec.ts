import { describe, expect, it } from "vitest";
import {
  checkOwnerHistoryEntry,
  findRecoverableEntry,
  getOwnerChangeWaitUntil,
  parseChainTime
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

describe("getOwnerChangeWaitUntil (preflight)", () => {
  it("is null when the owner has not changed in the last hour", () => {
    expect(
      getOwnerChangeWaitUntil({
        lastOwnerUpdate: "2026-11-10T10:30:00",
        ownerHistory: [entry(1, ["K"], "2026-11-10T10:30:00")],
        now: NOW
      })
    ).toBeNull();
  });

  it("returns one hour after the newest change in the last hour", () => {
    const wait = getOwnerChangeWaitUntil({
      lastOwnerUpdate: "2026-11-10T11:20:00",
      ownerHistory: [entry(1, ["K"], "2026-11-10T11:40:00"), entry(2, ["K"], "2026-11-01T00:00:00")],
      now: NOW
    });
    expect(wait?.toISOString()).toBe("2026-11-10T12:40:00.000Z");
  });

  it("treats the never-updated sentinel as no change", () => {
    expect(
      getOwnerChangeWaitUntil({ lastOwnerUpdate: "1970-01-01T00:00:00", ownerHistory: [], now: NOW })
    ).toBeNull();
  });
});
