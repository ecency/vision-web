import type { Operation, Authority } from "../../../hive-tx";
import {
  buildCancelTransferFromSavingsOp,
  buildRecurrentTransferOp,
  buildSetWithdrawVestingRouteOp,
  buildWithdrawVestingOp,
} from "./wallet";
import { buildLimitOrderCancelOp } from "./market";

export type { Authority };

/**
 * Account Operations
 * Operations for managing accounts, keys, and permissions
 */

/**
 * Builds an account update operation.
 * @param account - Account name
 * @param owner - Owner authority (optional)
 * @param active - Active authority (optional)
 * @param posting - Posting authority (optional)
 * @param memoKey - Memo public key
 * @param jsonMetadata - Account JSON metadata
 * @returns Account update operation
 */
export function buildAccountUpdateOp(
  account: string,
  owner: Authority | undefined,
  active: Authority | undefined,
  posting: Authority | undefined,
  memoKey: string,
  jsonMetadata: string
): Operation {
  if (!account || !memoKey) {
    throw new Error("[SDK][buildAccountUpdateOp] Missing required parameters");
  }

  return [
    "account_update",
    {
      account,
      owner,
      active,
      posting,
      memo_key: memoKey,
      json_metadata: jsonMetadata,
    },
  ];
}

/**
 * Builds an account update2 operation (for posting_json_metadata).
 * @param account - Account name
 * @param jsonMetadata - Account JSON metadata (legacy, usually empty)
 * @param postingJsonMetadata - Posting JSON metadata string
 * @param extensions - Extensions array
 * @returns Account update2 operation
 */
export function buildAccountUpdate2Op(
  account: string,
  jsonMetadata: string,
  postingJsonMetadata: string,
  extensions: any[]
): Operation {
  if (!account || postingJsonMetadata === undefined) {
    throw new Error("[SDK][buildAccountUpdate2Op] Missing required parameters");
  }

  return [
    "account_update2",
    {
      account,
      json_metadata: jsonMetadata || "",
      posting_json_metadata: postingJsonMetadata,
      extensions: (extensions || []) as [],
    },
  ];
}

/**
 * Public keys for account creation
 */
export interface AccountKeys {
  ownerPublicKey: string;
  activePublicKey: string;
  postingPublicKey: string;
  memoPublicKey: string;
}

/**
 * Builds an account create operation.
 * @param creator - Creator account name
 * @param newAccountName - New account name
 * @param keys - Public keys for the new account
 * @param fee - Creation fee (e.g., "3.000 HIVE")
 * @returns Account create operation
 */
export function buildAccountCreateOp(
  creator: string,
  newAccountName: string,
  keys: AccountKeys,
  fee: string
): Operation {
  if (!creator || !newAccountName || !keys || !fee) {
    throw new Error("[SDK][buildAccountCreateOp] Missing required parameters");
  }

  const owner: Authority = {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [[keys.ownerPublicKey, 1]],
  };

  const active: Authority = {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [[keys.activePublicKey, 1]],
  };

  const posting: Authority = {
    weight_threshold: 1,
    account_auths: [["ecency.app", 1]],
    key_auths: [[keys.postingPublicKey, 1]],
  };

  return [
    "account_create",
    {
      creator,
      new_account_name: newAccountName,
      owner,
      active,
      posting,
      memo_key: keys.memoPublicKey,
      json_metadata: "",
      fee,
    },
  ] satisfies Operation;
}

/**
 * Builds a create claimed account operation (using account creation tokens).
 * @param creator - Creator account name
 * @param newAccountName - New account name
 * @param keys - Public keys for the new account
 * @returns Create claimed account operation
 */
export function buildCreateClaimedAccountOp(
  creator: string,
  newAccountName: string,
  keys: AccountKeys
): Operation {
  if (!creator || !newAccountName || !keys) {
    throw new Error("[SDK][buildCreateClaimedAccountOp] Missing required parameters");
  }

  const owner: Authority = {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [[keys.ownerPublicKey, 1]],
  };

  const active: Authority = {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [[keys.activePublicKey, 1]],
  };

  const posting: Authority = {
    weight_threshold: 1,
    account_auths: [["ecency.app", 1]],
    key_auths: [[keys.postingPublicKey, 1]],
  };

  return [
    "create_claimed_account",
    {
      creator,
      new_account_name: newAccountName,
      owner,
      active,
      posting,
      memo_key: keys.memoPublicKey,
      json_metadata: "",
      extensions: [] as [],
    },
  ];
}

/**
 * Builds a claim account operation.
 * @param creator - Account claiming the token
 * @param fee - Fee for claiming (usually "0.000 HIVE" for RC-based claims)
 * @returns Claim account operation
 */
export function buildClaimAccountOp(creator: string, fee: string): Operation {
  if (!creator || !fee) {
    throw new Error("[SDK][buildClaimAccountOp] Missing required parameters");
  }

  return [
    "claim_account",
    {
      creator,
      fee,
      extensions: [] as [],
    },
  ];
}

/**
 * Builds an operation to grant posting permission to another account.
 * Helper that modifies posting authority to add an account.
 * @param account - Account granting permission
 * @param currentPosting - Current posting authority
 * @param grantedAccount - Account to grant permission to
 * @param weightThreshold - Weight threshold of the granted account
 * @param memoKey - Memo public key (required by Hive blockchain)
 * @param jsonMetadata - Account JSON metadata (required by Hive blockchain)
 * @returns Account update operation with modified posting authority
 */
export function buildGrantPostingPermissionOp(
  account: string,
  currentPosting: Authority,
  grantedAccount: string,
  weightThreshold: number,
  memoKey: string,
  jsonMetadata: string
): Operation {
  if (!account || !currentPosting || !grantedAccount || !memoKey) {
    throw new Error("[SDK][buildGrantPostingPermissionOp] Missing required parameters");
  }

  // Find existing account or create new entry to prevent duplicates
  const existingIndex = currentPosting.account_auths.findIndex(
    ([acc]) => acc === grantedAccount
  );

  const newAccountAuths = [...currentPosting.account_auths];
  if (existingIndex >= 0) {
    // Update existing entry with new weight
    newAccountAuths[existingIndex] = [grantedAccount, weightThreshold];
  } else {
    // Add new entry
    newAccountAuths.push([grantedAccount, weightThreshold]);
  }

  const newPosting: Authority = {
    ...currentPosting,
    account_auths: newAccountAuths,
  };

  // Sort account_auths alphabetically for consistency
  newPosting.account_auths.sort((a, b) => (a[0] > b[0] ? 1 : -1));

  return [
    "account_update",
    {
      account,
      posting: newPosting,
      memo_key: memoKey,
      json_metadata: jsonMetadata,
    },
  ];
}

/**
 * Builds an operation to revoke posting permission from an account.
 * Helper that modifies posting authority to remove an account.
 * @param account - Account revoking permission
 * @param currentPosting - Current posting authority
 * @param revokedAccount - Account to revoke permission from
 * @param memoKey - Memo public key (required by Hive blockchain)
 * @param jsonMetadata - Account JSON metadata (required by Hive blockchain)
 * @returns Account update operation with modified posting authority
 */
export function buildRevokePostingPermissionOp(
  account: string,
  currentPosting: Authority,
  revokedAccount: string,
  memoKey: string,
  jsonMetadata: string
): Operation {
  if (!account || !currentPosting || !revokedAccount || !memoKey) {
    throw new Error("[SDK][buildRevokePostingPermissionOp] Missing required parameters");
  }

  const newPosting: Authority = {
    ...currentPosting,
    account_auths: currentPosting.account_auths.filter(
      ([acc]) => acc !== revokedAccount
    ),
  };

  return [
    "account_update",
    {
      account,
      posting: newPosting,
      memo_key: memoKey,
      json_metadata: jsonMetadata,
    },
  ];
}

/**
 * Builds a change recovery account operation.
 * @param accountToRecover - Account to change recovery account for
 * @param newRecoveryAccount - New recovery account name
 * @param extensions - Extensions array
 * @returns Change recovery account operation
 */
export function buildChangeRecoveryAccountOp(
  accountToRecover: string,
  newRecoveryAccount: string,
  extensions: any[] = []
): Operation {
  if (!accountToRecover || !newRecoveryAccount) {
    throw new Error("[SDK][buildChangeRecoveryAccountOp] Missing required parameters");
  }

  return [
    "change_recovery_account",
    {
      account_to_recover: accountToRecover,
      new_recovery_account: newRecoveryAccount,
      extensions: extensions as [],
    },
  ];
}

/**
 * Builds a request account recovery operation.
 * @param recoveryAccount - Recovery account performing the recovery
 * @param accountToRecover - Account to recover
 * @param newOwnerAuthority - New owner authority
 * @param extensions - Extensions array
 * @returns Request account recovery operation
 */
export function buildRequestAccountRecoveryOp(
  recoveryAccount: string,
  accountToRecover: string,
  newOwnerAuthority: Authority,
  extensions: any[] = []
): Operation {
  if (!recoveryAccount || !accountToRecover || !newOwnerAuthority) {
    throw new Error("[SDK][buildRequestAccountRecoveryOp] Missing required parameters");
  }

  return [
    "request_account_recovery",
    {
      recovery_account: recoveryAccount,
      account_to_recover: accountToRecover,
      new_owner_authority: newOwnerAuthority,
      extensions: extensions as [],
    },
  ];
}

/**
 * Builds a recover account operation.
 * @param accountToRecover - Account to recover
 * @param newOwnerAuthority - New owner authority
 * @param recentOwnerAuthority - Recent owner authority (for proof)
 * @param extensions - Extensions array
 * @returns Recover account operation
 */
export function buildRecoverAccountOp(
  accountToRecover: string,
  newOwnerAuthority: Authority,
  recentOwnerAuthority: Authority,
  extensions: any[] = []
): Operation {
  if (!accountToRecover || !newOwnerAuthority || !recentOwnerAuthority) {
    throw new Error("[SDK][buildRecoverAccountOp] Missing required parameters");
  }

  return [
    "recover_account",
    {
      account_to_recover: accountToRecover,
      new_owner_authority: newOwnerAuthority,
      recent_owner_authority: recentOwnerAuthority,
      extensions: extensions as [],
    },
  ];
}

type RecoveryRole = "owner" | "active" | "posting";

/** New public keys for every role, all derived from one new master password. */
export interface RecoveryNewKeys {
  owner: string;
  active: string;
  posting: string;
  memo: string;
}

function singleKeyAuthority(
  publicKey: string,
  accountAuths: Authority["account_auths"] = []
): Authority {
  return {
    weight_threshold: 1,
    account_auths: accountAuths.map(([name, weight]) => [name, weight] as [string, number]),
    key_auths: [[publicKey, 1]],
  };
}

/**
 * Builds the `recover_account` operation for self-serve recovery.
 * `recentOwnerAuthority` must be the exact `previous_owner_authority` object from
 * owner history that holds the proven key; the chain compares it as a whole.
 */
export function buildRecoveryRecoverAccountOp(
  accountToRecover: string,
  newOwnerPublicKey: string,
  recentOwnerAuthority: Authority
): Operation {
  return buildRecoverAccountOp(
    accountToRecover,
    singleKeyAuthority(newOwnerPublicKey),
    recentOwnerAuthority
  );
}

/**
 * Builds an `account_update` that REPLACES every key after a recovery: owner,
 * active and posting each get exactly one new key and the memo key changes too,
 * so no earlier key keeps any access. Account authorities (app permissions) are
 * kept unless the caller passes a per-role override.
 */
export function buildRecoveryReplaceKeysOp(
  account: {
    name: string;
    owner: Authority;
    active: Authority;
    posting: Authority;
    json_metadata?: string;
  },
  newKeys: RecoveryNewKeys,
  options: { accountAuths?: Partial<Record<RecoveryRole, Authority["account_auths"]>> } = {}
): Operation {
  const authsFor = (role: RecoveryRole) =>
    options.accountAuths?.[role] ?? account[role]?.account_auths ?? [];

  return buildAccountUpdateOp(
    account.name,
    singleKeyAuthority(newKeys.owner, authsFor("owner")),
    singleKeyAuthority(newKeys.active, authsFor("active")),
    singleKeyAuthority(newKeys.posting, authsFor("posting")),
    newKeys.memo,
    account.json_metadata ?? ""
  );
}

export type PostRecoveryCleanupKind =
  | "power-down"
  | "withdraw-route"
  | "savings-withdrawal"
  | "recurrent-transfer"
  | "open-order";

export interface PostRecoveryCleanupItem {
  /** Stable id for a checklist row. */
  id: string;
  kind: PostRecoveryCleanupKind;
  /** The other account involved, when there is one. */
  target?: string;
  op: Operation;
}

export interface PostRecoveryCleanupExtras {
  withdrawRoutes?: { from_account: string; to_account: string; percent: number; auto_vest?: boolean }[];
  savingsWithdrawals?: { request_id: number; to?: string; amount?: string }[];
  recurrentTransfers?: {
    from: string;
    to: string;
    amount: string;
    recurrence: number;
    remaining_executions: number;
  }[];
  openOrders?: { orderid: number }[];
}

/**
 * Builds the optional clean-up operations after a recovery, one per item that is
 * actually present: stop a power down, remove withdraw routes, cancel savings
 * withdrawals, stop recurrent transfers and cancel open market orders.
 * All of them are signed with the active key.
 */
export function buildPostRecoveryCleanupOps(
  account: { name: string; vesting_withdraw_rate?: string },
  extras: PostRecoveryCleanupExtras
): PostRecoveryCleanupItem[] {
  const name = account.name;
  const items: PostRecoveryCleanupItem[] = [];

  if (parseFloat(account.vesting_withdraw_rate ?? "0") > 0) {
    items.push({
      id: "power-down",
      kind: "power-down",
      op: buildWithdrawVestingOp(name, "0.000000 VESTS"),
    });
  }

  (extras.withdrawRoutes ?? [])
    .filter((r) => r.from_account === name && r.percent > 0)
    .forEach((r) =>
      items.push({
        id: `withdraw-route:${r.to_account}`,
        kind: "withdraw-route",
        target: r.to_account,
        op: buildSetWithdrawVestingRouteOp(name, r.to_account, 0, false),
      })
    );

  (extras.savingsWithdrawals ?? []).forEach((w) =>
    items.push({
      id: `savings-withdrawal:${w.request_id}`,
      kind: "savings-withdrawal",
      target: w.to,
      op: buildCancelTransferFromSavingsOp(name, w.request_id),
    })
  );

  (extras.recurrentTransfers ?? [])
    .filter((t) => t.from === name)
    .forEach((t) => {
      const symbol = t.amount.trim().split(/\s+/)[1] ?? "HIVE";
      items.push({
        id: `recurrent-transfer:${t.to}`,
        kind: "recurrent-transfer",
        target: t.to,
        op: buildRecurrentTransferOp(
          name,
          t.to,
          `0.000 ${symbol}`,
          "",
          t.recurrence,
          Math.max(2, t.remaining_executions)
        ),
      });
    });

  (extras.openOrders ?? []).forEach((o) =>
    items.push({
      id: `open-order:${o.orderid}`,
      kind: "open-order",
      op: buildLimitOrderCancelOp(name, o.orderid),
    })
  );

  return items;
}
