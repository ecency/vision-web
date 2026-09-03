import type { AccountDelegations } from "../types/account-delegations";
import type { ReceivedVestingShare } from "../types/received-vesting-share";

/**
 * Raw vests from balance-api ("903311000000" = 903311.000000 VESTS) as the
 * legacy asset string. Takes the decimal string (or a bigint), never a number:
 * a float has already rounded anything above 2^53 raw units before it gets
 * here, and the string arithmetic below keeps every digit.
 */
export function rawVestsToAsset(amount: string | bigint): string {
  const digits = String(amount).replace(/\D/g, "") || "0";
  const padded = digits.padStart(7, "0");
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, "");
  return `${whole}.${padded.slice(-6)} VESTS`;
}

/**
 * The incoming half of an account's balance-api delegations in the shape the
 * received-delegation queries have always returned, largest first.
 */
export function toReceivedVestingShares(
  delegatee: string,
  delegations: AccountDelegations | null | undefined,
): ReceivedVestingShare[] {
  return (delegations?.incoming_delegations ?? [])
    .map((d) => ({
      delegator: d.delegator,
      raw: BigInt(String(d.amount).replace(/\D/g, "") || "0"),
    }))
    .sort((a, b) => (a.raw === b.raw ? 0 : a.raw > b.raw ? -1 : 1))
    .map(({ delegator, raw }) => ({
      delegatee,
      delegator,
      vesting_shares: rawVestsToAsset(raw),
    }));
}
