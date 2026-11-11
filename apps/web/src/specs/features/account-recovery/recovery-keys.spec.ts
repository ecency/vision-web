import { describe, expect, it, vi } from "vitest";

// Real key derivation: the global setup stubs PrivateKey.
vi.mock("@ecency/sdk", async () => await vi.importActual<Record<string, unknown>>("@ecency/sdk"));

import { PrivateKey } from "@ecency/sdk";
import { deriveRecoveryKeys } from "@/features/account-recovery/recovery-keys";

const USER = "alice";
const PASSWORD = "P5new-master-password-for-tests";
const ROLES = ["owner", "active", "posting", "memo"] as const;

describe("deriveRecoveryKeys", () => {
  it("derives every role key from the username and master password", () => {
    const keys = deriveRecoveryKeys(USER, PASSWORD);
    for (const role of ROLES) {
      const expected = PrivateKey.fromLogin(USER, PASSWORD, role);
      expect(keys[role].toString()).toBe(expected.toString());
      expect(keys.publicKeys[role]).toBe(expected.createPublic().toString());
      expect(keys.publicKeys[role]).toMatch(/^STM[1-9A-HJ-NP-Za-km-z]{50}$/);
    }
  });

  it("gives each role a different key", () => {
    const { publicKeys } = deriveRecoveryKeys(USER, PASSWORD);
    expect(new Set(ROLES.map((r) => publicKeys[r])).size).toBe(4);
  });

  it("depends on the username as well as the password", () => {
    expect(deriveRecoveryKeys("bob", PASSWORD).publicKeys.owner).not.toBe(
      deriveRecoveryKeys(USER, PASSWORD).publicKeys.owner
    );
  });
});
