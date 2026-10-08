import type { Authority } from "@ecency/sdk";

export type KeyAuthorityLevel = "owner" | "active" | "posting";

type KeyAuthorities = Record<KeyAuthorityLevel, Pick<Authority, "key_auths">>;

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
