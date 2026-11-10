import { PrivateKey, isWif, type OwnerHistoryEntry } from "@ecency/sdk";
import { findRecoverableEntry, type EligibilityOptions } from "./recovery-eligibility";

export type OldKeyMatch =
  | { status: "match"; key: PrivateKey; publicKey: string; entry: OwnerHistoryEntry }
  | { status: "empty" | "no-match" | "current" | "too-old" | "before-recovery" };

/**
 * Owner keys the input could stand for: the key itself when it is a private key
 * (WIF), and the owner key derived from it as a master password.
 */
function ownerCandidates(username: string, input: string): PrivateKey[] {
  const candidates: PrivateKey[] = [];
  if (isWif(input)) {
    candidates.push(PrivateKey.fromString(input));
  }
  candidates.push(PrivateKey.fromLogin(username, input, "owner"));
  return candidates;
}

/**
 * Matches an old password or owner key against the account's owner history,
 * entirely in the browser. Nothing typed here leaves the device.
 */
export function matchOldOwnerKey(
  username: string,
  rawInput: string,
  ownerHistory: OwnerHistoryEntry[],
  options: EligibilityOptions & { currentOwnerKeys?: string[] }
): OldKeyMatch {
  const input = rawInput.trim();
  if (!input) return { status: "empty" };

  const candidates = ownerCandidates(username, input).map((key) => ({
    key,
    publicKey: key.createPublic().toString()
  }));

  if (candidates.some((c) => options.currentOwnerKeys?.includes(c.publicKey))) {
    return { status: "current" };
  }

  const result = findRecoverableEntry(
    candidates.map((c) => c.publicKey),
    ownerHistory,
    options
  );
  if (result.status !== "match") {
    return { status: result.status === "ok" ? "no-match" : result.status };
  }

  const key = candidates.find((c) => c.publicKey === result.publicKey)!.key;
  return { status: "match", key, publicKey: result.publicKey, entry: result.entry };
}
