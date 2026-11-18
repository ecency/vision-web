import { isWif } from "@ecency/sdk";
import { getLoginType } from "@/utils/user-token";

/**
 * Memo rules for the wallet operations dialog, the same as the shared
 * Transfer dialog's: a private key must never go out as a memo (memos are
 * public on chain), and a memo starting with # is encrypted for the recipient.
 */

export function isKeyInMemo(memo: string): boolean {
  return isWif(memo.trim());
}

/** The memo as it goes on chain: encrypted when it starts with #. */
export async function prepareOperationMemo(memo: string, from: string, to: string): Promise<string> {
  if (!memo.startsWith("#") || !to) {
    return memo;
  }
  // Loaded on demand: it carries the AES code (#1434).
  const { encryptMemo } = await import("@/utils/memo-crypto");
  return encryptMemo(getLoginType(from), from, to, memo.slice(1));
}

// AssetOperation values whose chain operation has a memo field. Delegation,
// staking and the like have none, so their memo is never encrypted.
const MEMO_OPERATIONS = new Set(["transfer", "transfer-saving", "withdraw-saving", "gift"]);

/** True when the operation sends a memo on chain. */
export function operationCarriesMemo(operation: string): boolean {
  return MEMO_OPERATIONS.has(operation);
}
