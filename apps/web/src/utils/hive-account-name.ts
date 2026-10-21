import { utils as hiveUtils } from "@ecency/sdk/hive";
import { sanitizeWalletUsername } from "@/features/wallet/utils/sanitize-username";

/**
 * Turn a typed account name into the form the chain expects: drop surrounding spaces
 * and a leading "@", lowercase. "@Alice " becomes "alice".
 */
export function normalizeAccountName(value?: string | null): string {
  return sanitizeWalletUsername(value);
}

/**
 * True when the normalized input follows Hive's account name rules (the same rules the
 * chain asserts in validate_account_name). It does not check that the account exists.
 */
export function isValidAccountName(value?: string | null): boolean {
  return hiveUtils.validateUsername(normalizeAccountName(value)) === null;
}
