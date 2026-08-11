/**
 * The chain stores an account name in a `fixed_string` of 16 **bytes**, and hived
 * asserts on the byte length while deserialising the argument, before it ever looks
 * an account up. So a name that is too long does not come back as "no such account",
 * it comes back as
 *
 *   Assert Exception:in_len <= sizeof(data): Input too large: `<value>` (17)
 *     for fixed size string: (16)
 *
 * from `lookup_accounts`, `get_accounts` and anything else taking an
 * `account_name_type`, including plain reads.
 */
const HIVE_ACCOUNT_NAME_MAX_BYTES = 16;

/**
 * Bytes, not characters. The two differ exactly where this bug lives: `sebastián.bilbao`
 * is 16 characters but 17 bytes, and `вцпк33ппп43` is 11 characters but 18 bytes. Both
 * pass a `.length <= 16` check and both are rejected by the node.
 */
export function accountNameByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Whether a value can be sent to a node as an account name (or as the prefix of one,
 * which `lookup_accounts` takes) without tripping the assert above.
 *
 * This is deliberately only a length check. It is not account-name validation: a
 * caller searching for a prefix is allowed to pass something that is not yet a legal
 * name, and a node answers that honestly with no matches. The only thing that must not
 * happen is a request the node refuses to parse.
 */
export function isQueryableAccountName(value: string | undefined | null): boolean {
  if (!value) {
    return false;
  }

  return accountNameByteLength(value) <= HIVE_ACCOUNT_NAME_MAX_BYTES;
}
