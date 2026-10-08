import type { Authority, FullAccount, Operation } from "@ecency/sdk";

export type RevokeAuthority = "owner" | "active" | "posting";
export type RevokeMap = Record<RevokeAuthority, string[]>;

/**
 * account_update that removes keys per authority, exactly as ticked in the
 * review step. A key that sits in several authorities is removed only from
 * the ones it was ticked in. `owner` is included only when an owner key is
 * removed, so the operation needs owner authority only then (otherwise
 * active suffices).
 */
export function buildRevokeKeysByAuthorityOp(
  account: Pick<FullAccount, "name" | "json_metadata" | "memo_key" | RevokeAuthority>,
  revokeMap: RevokeMap
): Operation {
  const without = (auth: Authority, keys: string[]): Authority => {
    const clone: Authority = JSON.parse(JSON.stringify(auth));
    clone.key_auths = clone.key_auths.filter(([key]) => !keys.includes(String(key)));
    return clone;
  };

  return [
    "account_update",
    {
      account: account.name,
      json_metadata: account.json_metadata,
      ...(revokeMap.owner.length > 0 ? { owner: without(account.owner, revokeMap.owner) } : {}),
      active: without(account.active, revokeMap.active),
      posting: without(account.posting, revokeMap.posting),
      memo_key: account.memo_key
    }
  ] as unknown as Operation;
}

/** The authority a revoke operation from this map needs to be signed with. */
export function revokeRequiredAuthority(revokeMap: RevokeMap): "owner" | "active" {
  return revokeMap.owner.length > 0 ? "owner" : "active";
}
