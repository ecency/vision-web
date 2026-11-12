import { describe, it, expect } from "vitest";
import { deriveHiveKey, deriveHiveKeys } from "./derive-hive-bip44-keys";

// Canonical BIP39 test-vector mnemonic. The derived Hive keys below are pinned
// to guard the seed-derivation path against functional breakage — they were
// verified byte-identical between `bip39` and `@scure/bip39` (mnemonicToSeedSync
// is wordlist-independent PBKDF2-HMAC-SHA512), so this also locks in that the
// `@scure/bip39` swap produces the exact same keys.
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("deriveHiveKeys (BIP44 / @scure/bip39)", () => {
  it("derives the expected Hive keys for the canonical mnemonic", () => {
    expect(deriveHiveKeys(MNEMONIC)).toEqual({
      owner: "5KjUV6VNZduVBYC52HP7jA5y5L5CNEkN4w5Cw7paRRPzFQLkegi",
      active: "5Jf2wWfXWdXhSXax2cmNfKrVibp1ctLBm6f671x2GvET4S4DSYo",
      posting: "5Jm5eynY5BiwyHzHCwBwjEL54DRZKBDsron4z8A5i45Nr4J33aX",
      memo: "5K3GBSKD28Lc1nfjQRTe22xbhyQspTcDTY2xBJPvF5CaR5PBzmS",
      ownerPubkey: "STM6vG8FStXmFEz5Q7bh12uhNUzBG1g5U6Rwr1kVUJSgGETV7546D",
      activePubkey: "STM88AwEvbDPHmgFcKXna7KnX3BjdHC9SURhk1hN9g6LPf6bAmgER",
      postingPubkey: "STM6spGKmjCm6mvsc2NZ61SPv3JZXbkLYREBe8fRZXPdtAttCoCtz",
      memoPubkey: "STM87uSFahBNDTkgPXHXStYCwVpCwjYjV113pdzzbbpYD5Ns823ND"
    });
  });

  it("derives a single role deterministically", () => {
    expect(deriveHiveKey(MNEMONIC, "active").privateKey).toBe(
      "5Jf2wWfXWdXhSXax2cmNfKrVibp1ctLBm6f671x2GvET4S4DSYo"
    );
  });

  it("throws on a non-mnemonic input (e.g. a legacy master password)", () => {
    // @scure/bip39 validates the mnemonic and rejects arbitrary strings, unlike
    // the old bip39. Callers that probe BIP44 on raw user input (e.g.
    // detectHiveKeyDerivation) MUST catch this so master-password login/signing
    // still falls through to PrivateKey.fromLogin instead of aborting.
    expect(() => deriveHiveKeys("P5KQXMH7q9masterpasswordexample")).toThrow();
    expect(() => deriveHiveKeys("super secret hunter two phrase")).toThrow();
  });
});
