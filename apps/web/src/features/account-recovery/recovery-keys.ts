import { PrivateKey, type RecoveryNewKeys } from "@ecency/sdk";

export interface RecoveryKeySet {
  owner: PrivateKey;
  active: PrivateKey;
  posting: PrivateKey;
  memo: PrivateKey;
  publicKeys: RecoveryNewKeys;
}

/** Derives every new key from the new master password, in the browser only. */
export function deriveRecoveryKeys(username: string, masterPassword: string): RecoveryKeySet {
  const owner = PrivateKey.fromLogin(username, masterPassword, "owner");
  const active = PrivateKey.fromLogin(username, masterPassword, "active");
  const posting = PrivateKey.fromLogin(username, masterPassword, "posting");
  const memo = PrivateKey.fromLogin(username, masterPassword, "memo");
  return {
    owner,
    active,
    posting,
    memo,
    publicKeys: {
      owner: owner.createPublic().toString(),
      active: active.createPublic().toString(),
      posting: posting.createPublic().toString(),
      memo: memo.createPublic().toString()
    }
  };
}
