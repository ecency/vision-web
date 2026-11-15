import type { RCAccount } from "@ecency/sdk";

const RC_REGENERATION_SECONDS = 432_000; // 5 days, as hived regenerates mana

/**
 * The RC an account can delegate right now, by hived's delegate_rc evaluator:
 *
 *   from_delegable_rc = min( get_maximum_rc( only_delegable = true ), rc_manabar.current_mana )
 *
 * `get_maximum_rc(true)` is the account's own RC: effective vesting shares
 * minus what it already delegated, WITHOUT the account creation adjustment
 * and WITHOUT RC received from others. rc_api's `max_rc` includes both, so
 * they are taken off here. `current_mana` is regenerated to now first, as the
 * evaluator does, and never exceeds `max_rc`.
 */
export function getDelegatableRc(
  rc: Pick<
    RCAccount,
    "rc_manabar" | "max_rc" | "max_rc_creation_adjustment" | "received_delegated_rc"
  >,
  nowMs = Date.now()
): number {
  const maxRc = Number(rc.max_rc) || 0;
  const adjustment = Number(rc.max_rc_creation_adjustment?.amount) || 0;
  const received = Number(rc.received_delegated_rc) || 0;
  const ownRc = maxRc - adjustment - received;

  const elapsed = Math.max(0, nowMs / 1000 - Number(rc.rc_manabar?.last_update_time ?? 0));
  const currentMana = Math.min(
    maxRc,
    (Number(rc.rc_manabar?.current_mana) || 0) + (elapsed * maxRc) / RC_REGENERATION_SECONDS
  );

  return Math.max(0, Math.floor(Math.min(ownRc, currentMana)));
}
