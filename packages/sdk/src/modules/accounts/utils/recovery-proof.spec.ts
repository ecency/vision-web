import { describe, expect, it } from "vitest";
import { PrivateKey, Signature, sha256 } from "@/modules/core/hive-tx";
import { buildRecoveryChallengeDigest, signRecoveryChallenge } from "./recovery-proof";

describe("recovery proof", () => {
  const oldKey = PrivateKey.fromLogin("alice", "old-password", "owner");

  it("hashes the exact challenge string", () => {
    const digest = buildRecoveryChallengeDigest("alice", "STM_NEW", "abc123");
    expect(Array.from(digest)).toEqual(Array.from(sha256("ecency-recovery:alice:STM_NEW:abc123")));
  });

  it("produces a 130-hex compact signature that recovers the old owner public key", () => {
    const sig = signRecoveryChallenge(oldKey, "alice", "STM_NEW", "abc123");
    expect(sig).toMatch(/^[0-9a-f]{130}$/);
    const recovered = Signature.from(sig).getPublicKey(
      buildRecoveryChallengeDigest("alice", "STM_NEW", "abc123")
    );
    expect(recovered.toString()).toBe(oldKey.createPublic().toString());
  });

  it("normalizes the username the same way the server does", () => {
    expect(Array.from(buildRecoveryChallengeDigest(" Alice ", "STM_NEW", "abc123"))).toEqual(
      Array.from(buildRecoveryChallengeDigest("alice", "STM_NEW", "abc123"))
    );
  });
});
