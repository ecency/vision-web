// Pro constants + a null-safe membership helper. The set-building itself lives in @ecency/sdk
// (shared with mobile) so there is a single implementation; it is re-exported here for the badge
// + perks card. No React/Stripe imports, so this stays out of the checkout bundle, and the SDK is
// already pulled in wherever the roster query is used, so importing its helper adds nothing.
import { proMembersSet, type ProMembersResponse } from "@ecency/sdk";

export { proMembersSet };

/** The ePoints Stripe SKU for Ecency Pro (leading number = price in cents). */
export const PRO_SKU = "1999pro";

/** Yearly Pro price in USD. */
export const PRO_PRICE_USD = 19.99;

/** Whether `username` is an active Ecency Pro member (case-insensitive). */
export function isProMember(
  members: string[] | undefined,
  username: string | null | undefined
): boolean {
  if (!username) {
    return false;
  }
  return proMembersSet(members).has(username.toLowerCase());
}

/**
 * The cached roster with `username` added, for the optimistic write after a Pro
 * payment. Returns `prev` unchanged when the buyer is already in it (any case). A
 * malformed cached roster (an unvalidated JSON response) is replaced, not thrown on.
 */
export function withProMember(
  prev: ProMembersResponse | undefined,
  username: string
): ProMembersResponse | undefined {
  const cached: unknown = prev?.members;
  const valid = Array.isArray(cached);
  const members = valid ? (cached as unknown[]).filter((m): m is string => typeof m === "string") : [];
  if (isProMember(members, username)) return prev;
  return {
    members: [...members, username],
    count: (valid && typeof prev?.count === "number" ? prev.count : members.length) + 1
  };
}
