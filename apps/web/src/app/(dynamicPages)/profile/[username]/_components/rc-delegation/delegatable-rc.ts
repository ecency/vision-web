import type { RCAccount } from "@ecency/sdk";

const RC_REGENERATION_SECONDS = 432_000; // 5 days, as hived regenerates mana

/**
 * RC kept back for the delegate_rc transaction itself. hived takes the
 * delegated RC out of current mana, and the transaction (a custom_json) is
 * paid from current mana too, so delegating every last unit of it fails for
 * lack of RC. rc_api.get_rc_stats put the network average
 * custom_json at about 0.18B RC (2026-11); 1B leaves several times that as
 * headroom for a busier network, and is a fifth of the 5B minimum delegation.
 */
export const DELEGATE_RC_TX_RESERVE = 1_000_000_000;

/**
 * The RC an account can delegate right now, by hived's delegate_rc evaluator:
 *
 *   from_delegable_rc = min( get_maximum_rc( only_delegable = true ), rc_manabar.current_mana )
 *
 * `get_maximum_rc(true)` is the account's own RC: effective vesting shares
 * minus what it already delegated, WITHOUT the account creation adjustment
 * and WITHOUT RC received from others. rc_api's `max_rc` includes both, so
 * they are taken off here. `current_mana` is regenerated to now first, as the
 * evaluator does, and never exceeds `max_rc`. `reserve` is left in current
 * mana to pay for the transaction (see DELEGATE_RC_TX_RESERVE).
 */
export function getDelegatableRc(
  rc: Pick<
    RCAccount,
    "rc_manabar" | "max_rc" | "max_rc_creation_adjustment" | "received_delegated_rc"
  >,
  nowMs = Date.now(),
  reserve = DELEGATE_RC_TX_RESERVE
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

  return Math.max(0, Math.floor(Math.min(ownRc, currentMana - reserve)));
}

/** The delegatees of a delegate_rc: one account, or a comma separated list. */
export function parseDelegatees(to: string): string[] {
  return to
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * The RC a delegate_rc of `amount` to every one of `delegatees` takes from the
 * sender, as hived sums it: `amount` per delegatee, less the RC already
 * delegated to that delegatee (`existing`, where known). Compare it with
 * getDelegatableRc.
 */
export function rcDelegationDelta(
  amount: number,
  delegatees: string[],
  existing: Record<string, number> = {}
): number {
  return delegatees.reduce((total, name) => total + amount - (existing[name] ?? 0), 0);
}
