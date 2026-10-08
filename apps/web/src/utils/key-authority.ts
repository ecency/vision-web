import type { Authority } from "@ecency/sdk";

export type KeyAuthorityLevel = "owner" | "active" | "posting";

type KeyAuthorities = Record<KeyAuthorityLevel, Pick<Authority, "key_auths" | "account_auths">>;

// Hive authorities nest: an owner key satisfies active and posting, an active
// key satisfies posting. Index = rank, lower is stronger.
const RANK: KeyAuthorityLevel[] = ["owner", "active", "posting"];

/** The strongest authority whose key_auths holds this public key, or null. */
export function findKeyAuthority(
  account: KeyAuthorities,
  publicKey: string
): KeyAuthorityLevel | null {
  for (const level of RANK) {
    if (account[level].key_auths.some(([key]) => String(key) === publicKey)) {
      return level;
    }
  }
  return null;
}

/** Whether a key found at `found` can sign an operation that needs `required`. */
export function keySatisfiesAuthority(
  found: KeyAuthorityLevel | null,
  required: KeyAuthorityLevel
): boolean {
  return found !== null && RANK.indexOf(found) <= RANK.indexOf(required);
}

/**
 * Pre-broadcast check for a typed key. True when the key sits in a sufficient
 * authority, or when the chain might still accept it through a delegated
 * account (`account_auths` on a sufficient authority): the chain resolves
 * those recursively and this client does not, so it must not block them.
 * False only when the key is certainly unable to sign.
 */
export function canKeySignAuthority(
  account: KeyAuthorities,
  publicKey: string,
  required: KeyAuthorityLevel
): boolean {
  if (keySatisfiesAuthority(findKeyAuthority(account, publicKey), required)) {
    return true;
  }
  return RANK.slice(0, RANK.indexOf(required) + 1).some(
    (level) => (account[level].account_auths ?? []).length > 0
  );
}
