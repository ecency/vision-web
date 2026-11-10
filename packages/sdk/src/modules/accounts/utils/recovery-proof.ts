import { sha256 } from "@/modules/core/hive-tx";
import type { PrivateKey } from "../../../hive-tx";

/**
 * Digest the account recovery service checks: it binds the username, the new owner
 * key and the server nonce, so a proof cannot be reused for another key or request.
 */
export function buildRecoveryChallengeDigest(
  username: string,
  newOwnerPublicKey: string,
  nonce: string
): Uint8Array {
  return sha256(`ecency-recovery:${username}:${newOwnerPublicKey}:${nonce}`);
}

/** Signs the recovery challenge; returns the 130-hex compact recoverable signature. */
export function signRecoveryChallenge(
  key: PrivateKey,
  username: string,
  newOwnerPublicKey: string,
  nonce: string
): string {
  return key.sign(buildRecoveryChallengeDigest(username, newOwnerPublicKey, nonce)).customToString();
}
