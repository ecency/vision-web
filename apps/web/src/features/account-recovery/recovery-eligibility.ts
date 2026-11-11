import type { OwnerHistoryEntry } from "@ecency/sdk";

/** How long an earlier owner key can still be used to recover the account. */
export const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Length of the chain's hourly limits on owner changes and recoveries. */
export const OWNER_CHANGE_WINDOW_MS = 60 * 60 * 1000;

export type OwnerHistoryCheck = "ok" | "too-old" | "before-recovery" | "not-sufficient";

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
    const authority = entry.previous_owner_authority;
    const publicKey = publicKeys.find((key) =>
      authority.key_auths.some(([k]) => String(k) === key)
    );
    if (!publicKey) continue;

    // The proven key must satisfy the old owner authority on its own.
    const weight = authority.key_auths.find(([k]) => String(k) === publicKey)?.[1] ?? 0;
    const check =
      weight >= authority.weight_threshold
        ? checkOwnerHistoryEntry(entry, options)
        : "not-sufficient";
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

/** Anything before this is the chain's "never" placeholder (1970-01-01). */
const NEVER = Date.parse("1970-01-02T00:00:00Z");

/**
 * Hourly chain limits: recover_account needs more than an hour since the last
 * recovery, and a key update needs more than an hour since the previous owner
 * change. Returns when the limit lifts, or null when it already has.
 */
export function getHourlyLimitWaitUntil(time: string | undefined, head: number): Date | null {
  if (!time) return null;
  const t = parseChainTime(time);
  if (Number.isNaN(t) || t < NEVER) return null;
  return head - t > OWNER_CHANGE_WINDOW_MS ? null : new Date(t + OWNER_CHANGE_WINDOW_MS);
}

/** Re-check before signing: the proven key must stay valid for at least `marginMs`. */
export function isWithinRecoveryWindow(lastValidTime: string, head: number, marginMs: number) {
  return parseChainTime(lastValidTime) + RECOVERY_WINDOW_MS > head + marginMs;
}

export type HistoryRow = [number, { timestamp: string; op: [string, { posting?: { account_auths: [string, number][] } }] }];

/**
 * Posting account authorities that appeared through account_update(2) in the
 * window that starts RECOVERY_WINDOW_MS before `validUntil` (when the old owner
 * key was replaced). Someone holding the old keys may have added them, just
 * before or after the takeover, so the page leaves them unticked. Returns each
 * name with the time it was added. With no posting update before the window in
 * the rows, every name set inside it counts.
 */
export function findRecentPostingAuthAdds(
  rows: HistoryRow[],
  validUntil: string
): Map<string, string> {
  const windowStart = parseChainTime(validUntil) - RECOVERY_WINDOW_MS;
  const sorted = [...rows].sort(
    (a, b) => parseChainTime(a[1].timestamp) - parseChainTime(b[1].timestamp)
  );

  let before = new Set<string>();
  const added = new Map<string, string>();
  for (const [, { timestamp, op }] of sorted) {
    const posting = op?.[1]?.posting;
    if (!posting) continue;
    const names = posting.account_auths.map(([name]) => name);
    if (parseChainTime(timestamp) < windowStart) {
      before = new Set(names);
    } else {
      names
        .filter((n) => !before.has(n) && !added.has(n))
        .forEach((n) => added.set(n, timestamp));
    }
  }
  return added;
}
