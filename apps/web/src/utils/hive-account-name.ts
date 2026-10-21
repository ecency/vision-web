import { getAccountsQueryOptions } from "@ecency/sdk";
import { utils as hiveUtils } from "@ecency/sdk/hive";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Turn a typed account name into the form the chain expects: drop surrounding spaces
 * and a leading "@" (or its URL-encoded "%40"), lowercase. "@Alice " becomes "alice".
 * An "@" or "%40" inside the name is kept, so validation rejects it instead of
 * silently turning "alice%40bob" into a different account.
 */
export function normalizeAccountName(value?: string | null): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .replace(/^(?:@|%40)+/i, "")
    .toLowerCase();
}

/**
 * True when the normalized input follows Hive's account name rules (the same rules the
 * chain asserts in validate_account_name). It does not check that the account exists.
 */
export function isValidAccountName(value?: string | null): boolean {
  return hiveUtils.validateUsername(normalizeAccountName(value)) === null;
}

/**
 * Ask the chain whether the account exists, so a typo is caught before the user signs.
 * Network errors propagate to the caller.
 */
export async function accountExists(
  queryClient: QueryClient,
  value?: string | null
): Promise<boolean> {
  const name = normalizeAccountName(value);
  const accounts = await queryClient.fetchQuery(getAccountsQueryOptions([name]));
  return accounts.some((account) => account.name === name);
}
