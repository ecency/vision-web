import { describe, expect, it, vi } from "vitest";

// Real key derivation: the global setup stubs PrivateKey.
vi.mock("@ecency/sdk", async () => await vi.importActual<Record<string, unknown>>("@ecency/sdk"));

import { PrivateKey } from "@ecency/sdk";
import { matchOldOwnerKey } from "@/features/account-recovery/recovery-key-match";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const USER = "alice";
const OLD_PASSWORD = "P5old-master-password-for-tests";
const oldOwner = PrivateKey.fromLogin(USER, OLD_PASSWORD, "owner");
const oldOwnerPub = oldOwner.createPublic().toString();
const otherKey = PrivateKey.fromLogin(USER, "something-else", "owner");

const history = [
  {
    id: 1,
    account: USER,
    previous_owner_authority: {
      weight_threshold: 1,
      account_auths: [] as [string, number][],
      key_auths: [[oldOwnerPub, 1]] as [string, number][]
    },
    last_valid_time: "2026-11-09T00:00:00"
  }
];
const opts = { lastRecoveryTime: null, now: NOW };

describe("matchOldOwnerKey", () => {
  it("matches an old master password by deriving its owner key", () => {
    const result = matchOldOwnerKey(USER, OLD_PASSWORD, history, opts);
    expect(result.status).toBe("match");
    if (result.status !== "match") return;
    expect(result.publicKey).toBe(oldOwnerPub);
    expect(result.key.createPublic().toString()).toBe(oldOwnerPub);
    expect(result.entry).toBe(history[0]);
  });

  it("matches an old owner private key (WIF)", () => {
    const result = matchOldOwnerKey(USER, `  ${oldOwner.toString()}  `, history, opts);
    expect(result.status).toBe("match");
    if (result.status !== "match") return;
    expect(result.publicKey).toBe(oldOwnerPub);
  });

  it("matches an old master password that starts or ends with spaces", () => {
    const spaced = "  P5spaced-old-password ";
    const spacedPub = PrivateKey.fromLogin(USER, spaced, "owner").createPublic().toString();
    const spacedHistory = [
      {
        ...history[0],
        previous_owner_authority: { ...history[0].previous_owner_authority, key_auths: [[spacedPub, 1]] as [string, number][] }
      }
    ];
    const result = matchOldOwnerKey(USER, spaced, spacedHistory, opts);
    expect(result.status).toBe("match");
    if (result.status !== "match") return;
    expect(result.publicKey).toBe(spacedPub);
  });

  it("still matches a password typed with extra spaces around it", () => {
    expect(matchOldOwnerKey(USER, ` ${OLD_PASSWORD}  `, history, opts).status).toBe("match");
  });

  it("reports no-match for a key that was never the owner", () => {
    expect(matchOldOwnerKey(USER, otherKey.toString(), history, opts).status).toBe("no-match");
    expect(matchOldOwnerKey(USER, "wrong password", history, opts).status).toBe("no-match");
  });

  it("reports empty input", () => {
    expect(matchOldOwnerKey(USER, "   ", history, opts).status).toBe("empty");
  });

  it("reports when the key is still the current owner key", () => {
    expect(
      matchOldOwnerKey(USER, OLD_PASSWORD, [], { ...opts, currentOwnerKeys: [oldOwnerPub] }).status
    ).toBe("current");
  });

  it("passes on the eligibility reason for an old key outside the window", () => {
    expect(
      matchOldOwnerKey(USER, OLD_PASSWORD, history, { lastRecoveryTime: "2026-11-09T00:00:00", now: NOW })
        .status
    ).toBe("before-recovery");
  });

  it("reports a key that cannot satisfy the old owner authority alone", () => {
    const multisig = [
      {
        ...history[0],
        previous_owner_authority: {
          weight_threshold: 2,
          account_auths: [] as [string, number][],
          key_auths: [
            [oldOwnerPub, 1],
            ["STM_OTHER", 1]
          ] as [string, number][]
        }
      }
    ];
    expect(matchOldOwnerKey(USER, OLD_PASSWORD, multisig, opts).status).toBe("not-sufficient");
  });
});
