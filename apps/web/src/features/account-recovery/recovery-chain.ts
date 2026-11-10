import {
  broadcastOperationsWithKeys,
  buildChangeRecoveryAccountOp,
  buildPostRecoveryCleanupOps,
  buildRecoveryRecoverAccountOp,
  buildRecoveryReplaceKeysOp,
  callRPC,
  type Authority,
  type Operation,
  type OwnerHistoryEntry,
  type PostRecoveryCleanupItem,
  type PrivateKey,
  type RecoveryNewKeys
} from "@ecency/sdk";
import { findPostingAuthsAddedAfter, parseChainTime } from "./recovery-eligibility";
import type { RecoveryKeySet } from "./recovery-keys";

export const RECOVERY_ACCOUNT = "ecency";

export type RecoveryRole = "owner" | "active" | "posting";
export const RECOVERY_ROLES: RecoveryRole[] = ["owner", "active", "posting"];

/** The chain account fields the recovery needs, as database_api.find_accounts returns them. */
export interface RecoveryAccount {
  name: string;
  owner: Authority;
  active: Authority;
  posting: Authority;
  memo_key: string;
  json_metadata: string;
  recovery_account: string;
  last_owner_update: string;
  previous_owner_update: string;
  last_account_recovery: string;
  /** Normalized to "x.xxxxxx VESTS". */
  vesting_withdraw_rate: string;
}

export interface RecoveryChainState {
  account: RecoveryAccount;
  ownerHistory: OwnerHistoryEntry[];
  /** Time of the latest recover_account, or null if the account was never recovered. */
  lastRecoveryTime: string | null;
  /** Head block time in ms: hourly limits are judged against chain time. */
  headTime: number;
}

/** account_update (10) and account_update2 (43) in operation_filter_low. */
const ACCOUNT_UPDATE_FILTER_LOW = 2 ** 10 + 2 ** 43;
const NEVER = Date.parse("1970-01-02T00:00:00Z");

function toVests(value: unknown): string {
  if (typeof value === "string") return value;
  const nai = value as { amount?: string; precision?: number } | undefined;
  const precision = nai?.precision ?? 6;
  return `${(Number(nai?.amount ?? 0) / 10 ** precision).toFixed(precision)} VESTS`;
}

/** Always reads fresh from the chain: these values gate owner key changes. */
export async function loadRecoveryAccount(username: string): Promise<RecoveryAccount> {
  const result = (await callRPC("database_api.find_accounts", { accounts: [username] })) as {
    accounts?: (RecoveryAccount & { vesting_withdraw_rate: unknown })[];
  };
  const account = result?.accounts?.[0];
  if (!account || account.name !== username) {
    throw new Error("Account not found");
  }
  return { ...account, vesting_withdraw_rate: toVests(account.vesting_withdraw_rate) };
}

export async function loadRecoveryChainState(username: string): Promise<RecoveryChainState> {
  const [account, ownerHistory, props] = await Promise.all([
    loadRecoveryAccount(username),
    callRPC("condenser_api.get_owner_history", [username]) as Promise<OwnerHistoryEntry[]>,
    callRPC("database_api.get_dynamic_global_properties", {}) as Promise<{ time: string }>
  ]);

  const headTime = parseChainTime(props?.time ?? "");
  if (!Array.isArray(ownerHistory) || Number.isNaN(headTime)) {
    throw new Error("Unexpected chain response");
  }
  const lastRecovery = account.last_account_recovery;
  return {
    account,
    ownerHistory,
    lastRecoveryTime: lastRecovery && parseChainTime(lastRecovery) >= NEVER ? lastRecovery : null,
    headTime
  };
}

/**
 * Posting account authorities set by account updates after `validUntil`, the
 * moment the proven owner key was replaced. Rejects on a failed read; the page
 * then treats every posting authority as unconfirmed.
 */
export async function loadRecentPostingAuthAdds(
  username: string,
  validUntil: string
): Promise<Set<string>> {
  const rows = await callRPC(
    "condenser_api.get_account_history",
    [username, -1, 1000, ACCOUNT_UPDATE_FILTER_LOW, 0],
    undefined,
    undefined,
    undefined,
    (result: unknown) => Array.isArray(result)
  );
  if (!Array.isArray(rows)) {
    throw new Error("Unexpected account history response");
  }
  return findPostingAuthsAddedAfter(rows, validUntil);
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
 * tx2: replace every key with the new ones, signed by the new owner key. Runs
 * after tx1 landed and reads the chain again first: only the account
 * authorities the user chose stay (anything added since is dropped), and a
 * pending change of recovery account, which may have been made before tx1
 * landed, is cancelled in the same transaction.
 */
export async function submitReplaceKeys(input: {
  username: string;
  newKeys: RecoveryKeySet;
  keepAccountAuths: Record<RecoveryRole, string[]>;
}) {
  const [account, pending] = await Promise.all([
    loadRecoveryAccount(input.username),
    callRPC("database_api.find_change_recovery_account_requests", {
      accounts: [input.username]
    }) as Promise<{ requests?: { account_to_recover: string }[] }>
  ]);

  const accountAuths = Object.fromEntries(
    RECOVERY_ROLES.map((role) => [
      role,
      account[role].account_auths.filter(([name]) => input.keepAccountAuths[role].includes(name))
    ])
  ) as Record<RecoveryRole, Authority["account_auths"]>;

  const ops: Operation[] = [
    buildRecoveryReplaceKeysOp(account, input.newKeys.publicKeys, { accountAuths })
  ];
  if ((pending?.requests ?? []).some((r) => r.account_to_recover === input.username)) {
    ops.push(buildChangeRecoveryAccountOp(input.username, RECOVERY_ACCOUNT));
  }
  return broadcastOperationsWithKeys(ops, [input.newKeys.owner]);
}

/** True when the owner authority is exactly the new owner key. */
export function isOwnerReplaced(account: Pick<RecoveryAccount, "owner">, ownerPublicKey: string) {
  const { owner } = account;
  return (
    owner.weight_threshold === 1 &&
    owner.key_auths.length === 1 &&
    String(owner.key_auths[0][0]) === ownerPublicKey
  );
}

/** True when every key on the account is exactly the new key for its role. */
export function areAllKeysReplaced(account: RecoveryAccount, publicKeys: RecoveryNewKeys) {
  const only = (auth: Authority, key: string) =>
    auth.key_auths.length === 1 && String(auth.key_auths[0][0]) === key;
  return (
    isOwnerReplaced(account, publicKeys.owner) &&
    only(account.active, publicKeys.active) &&
    only(account.posting, publicKeys.posting) &&
    account.memo_key === publicKeys.memo
  );
}

export async function verifyRecoveredKeys(
  username: string,
  publicKeys: RecoveryNewKeys
): Promise<boolean> {
  return areAllKeysReplaced(await loadRecoveryAccount(username), publicKeys);
}

export async function loadCleanupItems(username: string): Promise<PostRecoveryCleanupItem[]> {
  const [account, withdrawRoutes, savingsWithdrawals, recurrentTransfers, openOrders] =
    await Promise.all([
      loadRecoveryAccount(username),
      callRPC("condenser_api.get_withdraw_routes", [username, "outgoing"]),
      callRPC("condenser_api.get_savings_withdraw_from", [username]),
      callRPC("condenser_api.find_recurrent_transfers", [username]),
      callRPC("condenser_api.get_open_orders", [username])
    ]);
  return buildPostRecoveryCleanupOps(account, {
    withdrawRoutes: withdrawRoutes ?? [],
    savingsWithdrawals: savingsWithdrawals ?? [],
    recurrentTransfers: recurrentTransfers ?? [],
    openOrders: openOrders ?? []
  });
}

export interface CleanupResult {
  id: string;
  ok: boolean;
  error?: string;
}

/**
 * tx3: optional clean-up, signed by the new active key. Each item is its own
 * transaction so one failure does not undo the others.
 */
export async function submitCleanupItems(
  username: string,
  items: PostRecoveryCleanupItem[],
  activeKey: PrivateKey
): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  for (const item of items) {
    try {
      await broadcastOperationsWithKeys([item.op], [activeKey]);
      results.push({ id: item.id, ok: true });
    } catch (e) {
      results.push({ id: item.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
