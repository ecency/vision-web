import {
  broadcastOperationsWithKeys,
  buildChangeRecoveryAccountOp,
  buildPostRecoveryCleanupOps,
  buildRecoveryRecoverAccountOp,
  buildRecoveryReplaceKeysOp,
  callRPC,
  getAccountPendingRecoveryQueryOptions,
  getLastAccountRecoveryQueryOptions,
  getOpenOrdersQueryOptions,
  getOwnerHistoryQueryOptions,
  getRecurrentTransfersQueryOptions,
  getSavingsWithdrawFromQueryOptions,
  getWithdrawRoutesQueryOptions,
  type Authority,
  type Operation,
  type OwnerHistoryEntry,
  type PostRecoveryCleanupItem,
  type PrivateKey,
  type RecoveryNewKeys
} from "@ecency/sdk";
import { getQueryClient } from "@/core/react-query";
import type { RecoveryKeySet } from "./recovery-keys";

export const RECOVERY_ACCOUNT = "ecency";

export type RecoveryRole = "owner" | "active" | "posting";
export const RECOVERY_ROLES: RecoveryRole[] = ["owner", "active", "posting"];

/** The raw chain account fields the recovery needs (not the parsed profile shape). */
export interface RecoveryAccount {
  name: string;
  owner: Authority;
  active: Authority;
  posting: Authority;
  memo_key: string;
  json_metadata: string;
  last_owner_update: string;
  recovery_account: string;
  vesting_withdraw_rate?: string;
}

export interface RecoveryChainState {
  account: RecoveryAccount;
  ownerHistory: OwnerHistoryEntry[];
  lastRecoveryTime: string | null;
  hasPendingRecoveryChange: boolean;
}

/** Always read fresh: these reads gate owner key changes. */
function fetchFresh<T>(options: { queryKey: readonly unknown[]; queryFn?: unknown }): Promise<T> {
  return getQueryClient().fetchQuery({ ...(options as any), staleTime: 0, retry: 1 }) as Promise<T>;
}

export async function loadRecoveryAccount(username: string): Promise<RecoveryAccount> {
  const rows = (await callRPC(
    "condenser_api.get_accounts",
    [[username]],
    undefined,
    undefined,
    undefined,
    (result: unknown) => Array.isArray(result)
  )) as RecoveryAccount[];
  if (!rows?.[0]) {
    throw new Error("Account not found");
  }
  return rows[0];
}

export async function loadRecoveryChainState(username: string): Promise<RecoveryChainState> {
  const [account, ownerHistory, lastRecoveryTime, pending] = await Promise.all([
    loadRecoveryAccount(username),
    fetchFresh<OwnerHistoryEntry[]>(getOwnerHistoryQueryOptions(username)),
    fetchFresh<string | null>(getLastAccountRecoveryQueryOptions(username)),
    fetchFresh<{ requests?: { account_to_recover: string }[] }>(
      getAccountPendingRecoveryQueryOptions(username)
    )
  ]);

  return {
    account,
    ownerHistory: ownerHistory ?? [],
    lastRecoveryTime,
    hasPendingRecoveryChange: (pending?.requests ?? []).some(
      (r) => r.account_to_recover === username
    )
  };
}

/** tx1: recover_account, signed by the proven old owner key and the new owner key. */
export function submitRecoverAccount(input: {
  username: string;
  oldKey: PrivateKey;
  newOwnerKey: PrivateKey;
  newOwnerPublicKey: string;
  recentOwnerAuthority: Authority;
}) {
  return broadcastOperationsWithKeys(
    [
      buildRecoveryRecoverAccountOp(
        input.username,
        input.newOwnerPublicKey,
        input.recentOwnerAuthority
      )
    ],
    [input.oldKey, input.newOwnerKey]
  );
}

/**
 * tx2: replace every key with the new ones, signed by the new owner key. The
 * account is read again right before signing; only the account authorities the
 * user chose to keep stay, so anything added in the meantime is dropped.
 */
export async function submitReplaceKeys(input: {
  username: string;
  newKeys: RecoveryKeySet;
  keepAccountAuths: Record<RecoveryRole, string[]>;
  changeRecoveryAccount: boolean;
}) {
  const account = await loadRecoveryAccount(input.username);
  const accountAuths = Object.fromEntries(
    RECOVERY_ROLES.map((role) => [
      role,
      account[role].account_auths.filter(([name]) => input.keepAccountAuths[role].includes(name))
    ])
  ) as Record<RecoveryRole, Authority["account_auths"]>;

  const ops: Operation[] = [
    buildRecoveryReplaceKeysOp(account, input.newKeys.publicKeys, { accountAuths })
  ];
  if (input.changeRecoveryAccount) {
    ops.push(buildChangeRecoveryAccountOp(input.username, RECOVERY_ACCOUNT));
  }
  return broadcastOperationsWithKeys(ops, [input.newKeys.owner]);
}

export async function loadCleanupItems(username: string): Promise<PostRecoveryCleanupItem[]> {
  const [account, withdrawRoutes, savingsWithdrawals, recurrentTransfers, openOrders] =
    await Promise.all([
      loadRecoveryAccount(username),
      fetchFresh<any[]>(getWithdrawRoutesQueryOptions(username)),
      fetchFresh<any[]>(getSavingsWithdrawFromQueryOptions(username)),
      fetchFresh<any[]>(getRecurrentTransfersQueryOptions(username)),
      fetchFresh<any[]>(getOpenOrdersQueryOptions(username))
    ]);
  return buildPostRecoveryCleanupOps(account, {
    withdrawRoutes: withdrawRoutes ?? [],
    savingsWithdrawals: savingsWithdrawals ?? [],
    recurrentTransfers: recurrentTransfers ?? [],
    openOrders: openOrders ?? []
  });
}

/** tx3: optional clean-up, signed by the new active key. */
export function submitCleanup(username: string, ops: Operation[], activeKey: PrivateKey) {
  return broadcastOperationsWithKeys(ops, [activeKey]);
}

/** True when every key on chain is exactly the new key for its role. */
export async function verifyRecoveredKeys(
  username: string,
  publicKeys: RecoveryNewKeys
): Promise<boolean> {
  const account = await loadRecoveryAccount(username);
  const only = (auth: Authority, key: string) =>
    auth.key_auths.length === 1 && String(auth.key_auths[0][0]) === key;
  return (
    only(account.owner, publicKeys.owner) &&
    only(account.active, publicKeys.active) &&
    only(account.posting, publicKeys.posting) &&
    account.memo_key === publicKeys.memo
  );
}
