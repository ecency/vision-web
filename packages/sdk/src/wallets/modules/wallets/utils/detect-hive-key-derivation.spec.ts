import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CONFIG, PrivateKey } from "../../../../index";
import { detectHiveKeyDerivation } from "./detect-hive-key-derivation";

// Regression guard for the @scure/bip39 swap: @scure/bip39 validates the
// mnemonic and throws "Invalid mnemonic" on a legacy master password, whereas
// the old bip39 silently ran PBKDF2 over any string. detectHiveKeyDerivation
// probes BIP44 first, so without a guard that throw would propagate and abort
// master-password login/signing before the fromLogin fallback runs.
const USERNAME = "alice";
const MASTER_PASSWORD = "P5JfakeMasterPasswordForTestingOnly123";

function buildAccount() {
  // Authorities that actually correspond to the master password, so the
  // legacy fromLogin branch has something to match.
  const activePub = PrivateKey.fromLogin(USERNAME, MASTER_PASSWORD, "active")
    .createPublic()
    .toString();
  const ownerPub = PrivateKey.fromLogin(USERNAME, MASTER_PASSWORD, "owner")
    .createPublic()
    .toString();
  return {
    name: USERNAME,
    active: { key_auths: [[activePub, 1]] },
    owner: { key_auths: [[ownerPub, 1]] },
    posting: { key_auths: [["STM7posting", 1]] }
  };
}

describe("detectHiveKeyDerivation (master password vs @scure/bip39)", () => {
  let originalQueryClient: unknown;

  beforeAll(() => {
    const account = buildAccount();
    originalQueryClient = (CONFIG as any).queryClient;
    (CONFIG as any).queryClient = { fetchQuery: async () => account };
  });

  afterAll(() => {
    (CONFIG as any).queryClient = originalQueryClient;
  });

  it("classifies a legacy master password as 'master-password' without throwing", async () => {
    await expect(
      detectHiveKeyDerivation(USERNAME, MASTER_PASSWORD, "active")
    ).resolves.toBe("master-password");
    await expect(
      detectHiveKeyDerivation(USERNAME, MASTER_PASSWORD, "owner")
    ).resolves.toBe("master-password");
  });

  it("returns 'unknown' for an unrelated non-mnemonic string", async () => {
    await expect(
      detectHiveKeyDerivation(USERNAME, "totally-unrelated-string", "active")
    ).resolves.toBe("unknown");
  });
});
