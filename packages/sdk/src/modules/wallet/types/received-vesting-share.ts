/**
 * One incoming HP delegation, as the received-delegation queries return it.
 *
 * `vesting_shares` is the legacy "n.nnnnnn VESTS" string. `timestamp` is
 * optional: the balance-api rows these are built from carry a block number
 * but no time, so it is absent there; only rows from the old Ecency endpoint
 * ever had it.
 */
export interface ReceivedVestingShare {
  delegatee: string;
  delegator: string;
  timestamp?: string;
  vesting_shares: string;
}
