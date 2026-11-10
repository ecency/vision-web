import type { OwnerHistoryEntry } from "@ecency/sdk";

/** How long an earlier owner key can still be used to recover the account. */
export const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Owner key changes are limited per hour, and a recovery needs two of them. */
export const OWNER_CHANGE_WINDOW_MS = 60 * 60 * 1000;

export type OwnerHistoryCheck = "ok" | "too-old" | "before-recovery";

export interface EligibilityOptions {
  /** Time of the account's latest recover_account op (chain format), or null. */
  lastRecoveryTime: string | null;
  now: number;
}

/** Chain times are UTC without a zone suffix. */
export function parseChainTime(value: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

/**
 * Whether an owner history entry can still prove ownership:
 * it must be inside the 30 day window and strictly newer than the latest
 * recovery, so a key that was already replaced by a recovery cannot be reused.
 */
export function checkOwnerHistoryEntry(
  entry: Pick<OwnerHistoryEntry, "last_valid_time">,
  { lastRecoveryTime, now }: EligibilityOptions
): OwnerHistoryCheck {
  const validUntil = parseChainTime(entry.last_valid_time);
  if (lastRecoveryTime && !(validUntil > parseChainTime(lastRecoveryTime))) {
    return "before-recovery";
  }
  if (!(validUntil + RECOVERY_WINDOW_MS > now)) {
    return "too-old";
  }
  return "ok";
}

export type RecoverableEntryResult =
  | { status: "match"; entry: OwnerHistoryEntry; publicKey: string }
  | { status: "no-match" | OwnerHistoryCheck };

/**
 * Finds the owner history entry that holds one of the given public keys and can
 * be used for recovery. With several matches the newest one wins.
 */
export function findRecoverableEntry(
  publicKeys: string[],
  history: OwnerHistoryEntry[],
  options: EligibilityOptions
): RecoverableEntryResult {
  let best: { entry: OwnerHistoryEntry; publicKey: string } | null = null;
  let reason: OwnerHistoryCheck | null = null;

  for (const entry of history) {
    const publicKey = publicKeys.find((key) =>
      entry.previous_owner_authority.key_auths.some(([k]) => String(k) === key)
    );
    if (!publicKey) continue;

    const check = checkOwnerHistoryEntry(entry, options);
    if (check !== "ok") {
      reason = reason ?? check;
      continue;
    }
    if (
      !best ||
      parseChainTime(entry.last_valid_time) > parseChainTime(best.entry.last_valid_time)
    ) {
      best = { entry, publicKey };
    }
  }

  if (best) return { status: "match", ...best };
  return { status: reason ?? "no-match" };
}

/**
 * Returns when the next owner change is allowed if the owner key changed in the
 * last hour, or null when the recovery can go ahead now.
 */
export function getOwnerChangeWaitUntil({
  lastOwnerUpdate,
  ownerHistory,
  now
}: {
  lastOwnerUpdate?: string;
  ownerHistory: Pick<OwnerHistoryEntry, "last_valid_time">[];
  now: number;
}): Date | null {
  const times = [lastOwnerUpdate, ...ownerHistory.map((e) => e.last_valid_time)]
    .filter((t): t is string => !!t)
    .map(parseChainTime)
    .filter((t) => !Number.isNaN(t) && t + OWNER_CHANGE_WINDOW_MS > now);

  if (times.length === 0) return null;
  return new Date(Math.max(...times) + OWNER_CHANGE_WINDOW_MS);
}
