import { PrivateKey } from "../../../../index";
import type { HiveRole } from "./derive-hive-bip44-keys";

export function deriveHiveMasterPasswordKey(
  username: string,
  masterPassword: string,
  role: HiveRole
) {
  const pk = PrivateKey.fromLogin(username, masterPassword, role);
  return {
    privateKey: pk.toString(),
    publicKey: pk.createPublic().toString(),
  } as const;
}

export function deriveHiveMasterPasswordKeys(
  username: string,
  masterPassword: string
) {
  const owner = deriveHiveMasterPasswordKey(username, masterPassword, "owner");
  const active = deriveHiveMasterPasswordKey(username, masterPassword, "active");
  const posting = deriveHiveMasterPasswordKey(
    username,
    masterPassword,
    "posting"
  );
  const memo = deriveHiveMasterPasswordKey(username, masterPassword, "memo");
  return {
    owner: owner.privateKey,
    active: active.privateKey,
    posting: posting.privateKey,
    memo: memo.privateKey,
    ownerPubkey: owner.publicKey,
    activePubkey: active.publicKey,
    postingPubkey: posting.publicKey,
    memoPubkey: memo.publicKey,
  } as const;
}
