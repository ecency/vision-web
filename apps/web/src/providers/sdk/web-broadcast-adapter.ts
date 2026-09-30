import type { Operation, Authority, TransactionConfirmation } from '@ecency/sdk';
import {
  PrivateKey,
  PlatformAdapter,
  getQueryClient,
  getAccountFullQueryOptions,
  broadcastOperations,
  callRPCBroadcast,
  getTransactionReference,
  buildGrantPostingPermissionOp,
  usrActivity,
} from '@ecency/sdk';
import hs from 'hivesigner';
import { encodeOps as encodeHiveUriOps } from 'hive-uri';
import { getUser, getAccessToken, getPostingKey, getLoginType } from '@/utils/user-token';
import * as ls from '@/utils/local-storage';
import { requestAuthUpgrade, getTempActiveKey } from '@/features/shared/auth-upgrade';
import { error, success } from '@/features/shared/feedback/feedback-events';
import { broadcastWithExtension, hasAnyHiveExtension } from '@/utils/hive-extensions';

/**
 * Web platform adapter for SDK mutations.
 *
 * Bridges the SDK's authentication context with the web app's:
 * - localStorage for user state
 * - Browser-based key storage
 * - Keychain browser extension integration
 * - HiveSigner OAuth integration
 * - React Query cache invalidation
 *
 * @returns {PlatformAdapter} Platform adapter instance configured for web
 *
 * @remarks
 * `createWebBroadcastAdapter` is an internal factory.
 * App code should use `getWebBroadcastAdapter()` to retrieve the shared singleton.
 *
 * @example
 * ```typescript
 * import { getWebBroadcastAdapter } from '@/providers/sdk';
 * import { useVote } from '@ecency/sdk';
 *
 * export function useVoteMutation(username?: string) {
 *   const adapter = getWebBroadcastAdapter();
 *   return useVote(username, { adapter });
 * }
 * ```
 *
 * The adapter integrates with:
 * - **localStorage**: Persistent storage for user data and encrypted keys
 * - **sessionStorage**: Temporary storage for session-only data
 * - **Keychain**: Browser extension for secure key management
 * - **HiveSigner**: OAuth-based authentication
 * - **React Query**: Cache invalidation after mutations
 *
 * @see {@link PlatformAdapter} for the full interface definition
 */
const HIVE_SNAP_ID = 'npm:@hiveio/metamask-snap';

const KEY_ROLE_MAP: Record<string, string> = {
  posting: 'posting',
  active: 'active',
  owner: 'owner',
  memo: 'memo',
};

const NAI_MAP: Record<string, { nai: string; precision: number }> = {
  HIVE: { nai: '@@000000021', precision: 3 },
  TESTS: { nai: '@@000000021', precision: 3 },
  HBD: { nai: '@@000000013', precision: 3 },
  TBD: { nai: '@@000000013', precision: 3 },
  VESTS: { nai: '@@000000037', precision: 6 },
};

/** Field names that hold Hive asset values across all operation types. */
const ASSET_FIELDS = new Set([
  'amount', 'fee', 'vesting_shares', 'reward_hive', 'reward_hbd', 'reward_vests',
  'hbd_amount', 'hive_amount', 'amount_to_sell', 'min_to_receive', 'daily_pay',
  'max_accepted_payout', 'balance', 'hbd_balance',
]);

/**
 * Convert a dhive string amount ("1.500 HIVE") to wax NAI format.
 * Returns original value if it doesn't match the pattern.
 */
function stringAmountToNai(value: string): unknown {
  const match = value.match(/^(\d+\.\d+)\s+(HIVE|HBD|VESTS|TESTS|TBD)$/);
  if (!match) return value;
  const { nai, precision } = NAI_MAP[match[2]];
  const parts = match[1].split('.');
  const amount = parts[0] + parts[1].padEnd(precision, '0').slice(0, precision);
  return { amount, precision, nai };
}

/**
 * Convert asset fields in an operation value from dhive string format to wax NAI format.
 * Only converts fields in the ASSET_FIELDS whitelist to avoid corrupting string fields like memo.
 */
function convertOpAssets(opValue: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(opValue)) {
    if (ASSET_FIELDS.has(key) && typeof val === 'string') {
      result[key] = stringAmountToNai(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Convert a dhive Operation tuple to wax protobuf-JSON format.
 * dhive: ["vote", { voter: "alice", ... }]
 * wax:   { type: "vote_operation", value: { voter: "alice", ... } }
 */
function dhiveOpToWaxFormat(op: Operation): { type: string; value: Record<string, unknown> } {
  const arr = op as unknown as [string, Record<string, unknown>];
  return {
    type: `${arr[0]}_operation`,
    value: convertOpAssets(arr[1]),
  };
}

/**
 * Broadcast Hive operations via MetaMask's Hive snap.
 * Signs the transaction using hive_signTransaction, then broadcasts.
 */
async function broadcastWithMetaMaskSnap(
  username: string,
  ops: Operation[],
  keyType: 'posting' | 'active' | 'owner' | 'memo',
): Promise<TransactionConfirmation> {
  if (!window.ethereum) {
    throw new Error('MetaMask not found');
  }

  // A block a few behind head, so a node that is a block behind still accepts it.
  const { ref_block_num: refBlockNum, ref_block_prefix: refBlockPrefix } = await getTransactionReference();
  const expiration = new Date(Date.now() + 60000).toISOString().slice(0, 19);

  // dhive operations in tuple format for broadcasting
  const transaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration,
    operations: ops,
    extensions: []
  };

  // Wax (used by the snap) expects protobuf-JSON format for operations
  const waxTransaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration,
    operations: ops.map(dhiveOpToWaxFormat),
    extensions: []
  };

  const role = KEY_ROLE_MAP[keyType] ?? 'posting';

  // Sign via Hive snap (send wax format)
  const result = await window.ethereum.request({
    method: 'wallet_invokeSnap',
    params: {
      snapId: HIVE_SNAP_ID,
      request: {
        method: 'hive_signTransaction',
        params: {
          transaction: JSON.stringify(waxTransaction),
          keys: [{ role, accountIndex: 0 }]
        }
      }
    }
  }) as { signatures: string[] };

  // Broadcast the signed transaction (dhive format)
  const signedTx = {
    ...transaction,
    signatures: result.signatures
  };

  // Use callRPCBroadcast (15s timeout, broadcast-safe failover) instead of callRPC
  // (5s timeout, read-path retry) so a slow node doesn't get cut off mid-flight and
  // the request isn't ping-pong-cancelled across nodes on every 4.9s abort.
  const broadcastResult = await callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [signedTx]) as TransactionConfirmation;
  return broadcastResult;
}

const KEYCHAIN_MOBILE_SIGN_STORAGE_KEY = 'ecency_keychain-mobile-pending-sign';

/**
 * Broadcast Hive operations via Keychain Mobile deep link (hive://sign/ops/).
 * Keychain handles signing AND broadcasting. The page navigates away, so this
 * returns a never-resolving promise. The callback page handles the result.
 */
function broadcastWithKeychainMobileDeepLink(
  username: string,
  ops: Operation[],
  keyType: 'posting' | 'active',
): Promise<TransactionConfirmation> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Keychain Mobile deep links are only available in a browser environment.'));
  }

  // Store the return path so the callback page can redirect back
  localStorage.setItem(KEYCHAIN_MOBILE_SIGN_STORAGE_KEY, JSON.stringify({
    returnPath: window.location.pathname + window.location.search,
    timestamp: Date.now(),
  }));

  // Encode operations as hive:// URI using hive-uri library
  const hiveUri = encodeHiveUriOps(ops, {
    signer: username,
    callback: `${window.location.origin}/auth/keychain-sign?id={{id}}&sig={{sig}}`,
    authority: keyType,
  });

  // Navigate to the deep link - OS will open Keychain/Ecency app.
  // Page navigates away; the tx result arrives via /auth/keychain-sign callback
  // on a new page load. Same pattern as HiveSigner hot-sign (hs.sendOperations).
  window.location.href = hiveUri;
  return new Promise(() => {});
}

/**
 * Singleton adapter instance. Safe to reuse because all methods read from
 * localStorage / window at call time — no state is captured at creation.
 */
let _singletonAdapter: PlatformAdapter | null = null;

export function getWebBroadcastAdapter(): PlatformAdapter {
  if (!_singletonAdapter) {
    _singletonAdapter = createWebBroadcastAdapter();
  }
  return _singletonAdapter;
}

// Test-only helper for resetting singleton state between tests.
export function resetWebBroadcastAdapterForTests() {
  _singletonAdapter = null;
}

export function createWebBroadcastAdapter(): PlatformAdapter {
  return {
    // ============================================================================
    // Storage Operations
    // ============================================================================

    async getUser(username: string) {
      // Use existing user-token helper for consistent localStorage access
      const user = getUser(username);
      if (!user) {
        return undefined;
      }

      // Map loginType to SDK auth method
      // MetaMask routes through keychain broadcast path (snap handles signing)
      // keychain-mobile has no direct SDK broadcast method - relies on HiveSigner token or auth upgrade
      const authType = user.loginType === 'privateKey' ? 'key'
        : user.loginType === 'metamask' ? 'keychain'
        : user.loginType === 'keychain-mobile' ? undefined
        : user.loginType;

      return {
        name: user.username,
        authType,
      };
    },

    async getPostingKey(username: string) {
      // Use existing helper - it handles localStorage access and decoding
      const postingKey = getPostingKey(username);

      // Return null for non-key auth methods (HiveSigner/Keychain)
      // This signals to SDK that it should use those platform-specific broadcast methods
      const loginType = getLoginType(username);
      if (loginType === 'hivesigner' || loginType === 'keychain' || loginType === 'metamask' || loginType === 'keychain-mobile') {
        return null;
      }

      // For privateKey auth, return the key (may be undefined if not stored)
      return postingKey;
    },

    async getActiveKey(username: string) {
      // Check the in-memory store first (key entered via auth upgrade dialog,
      // or captured from an active-key login). Scoped to this username, so a key
      // left by a previous account is never handed over.
      const tempKey = getTempActiveKey(username);
      if (tempKey) return tempKey;

      // Return null for non-key auth methods (they handle active operations via their own methods)
      const loginType = getLoginType(username);
      if (loginType === 'hivesigner' || loginType === 'keychain' || loginType === 'metamask' || loginType === 'keychain-mobile') {
        return null;
      }

      // Web app does NOT store active keys in localStorage for security
      // Active key operations will fall back to auth upgrade dialog
      return undefined;
    },

    async getOwnerKey(username: string) {
      // Return null for non-key auth methods (they handle owner operations via their own methods)
      const loginType = getLoginType(username);
      if (loginType === 'hivesigner' || loginType === 'keychain' || loginType === 'metamask' || loginType === 'keychain-mobile') {
        return null;
      }

      // Web app does NOT store owner keys in localStorage for security
      // Owner key operations will fall back to manual key entry or auth upgrade
      return undefined;
    },

    async getMemoKey(username: string) {
      // Return null for non-key auth methods (they handle memo operations via their own methods)
      const loginType = getLoginType(username);
      if (loginType === 'hivesigner' || loginType === 'keychain' || loginType === 'metamask' || loginType === 'keychain-mobile') {
        return null;
      }

      // Web app does NOT store memo keys in localStorage for security
      // Memo key operations will fall back to manual key entry or auth upgrade
      return undefined;
    },

    async getAccessToken(username: string) {
      // Use existing helper - it handles localStorage access and decoding
      // Access tokens are used for:
      // 1. HiveSigner OAuth
      // 2. Private API access (drafts, bookmarks) for all login types
      // 3. Optimized posting broadcasts when posting authority granted
      return getAccessToken(username);
    },

    async getLoginType(username: string, authority?: string) {
      // Use existing helper - it handles localStorage access and decoding
      const loginType = getLoginType(username);
      if (!loginType) {
        // A record with no loginType (written before that field existed) would
        // otherwise send every active operation straight to the auth upgrade
        // dialog: the SDK skips getActiveKey entirely when this returns null.
        // The held key can sign, so say so and let it be tried first.
        if (authority === 'active' && getTempActiveKey(username)) {
          return 'key';
        }
        return null;
      }

      // Map web login types to SDK auth methods
      // LoginType = 'hivesigner' | 'keychain' | 'privateKey' | 'metamask' | 'keychain-mobile'
      switch (loginType) {
        case 'hivesigner':
          return 'hivesigner';
        case 'keychain':
          return 'keychain';
        case 'keychain-mobile':
          // Keychain Mobile: route through keychain broadcast path
          // SDK will try HiveSigner token first for posting ops (if posting auth granted),
          // then fall back to broadcastWithKeychain which handles deep links
          return 'keychain';
        case 'privateKey':
          // For key-based logins, verify the required key is actually available.
          // An active-key-only user shouldn't return 'key' for posting ops —
          // returning null lets broadcastWithFallback use HiveSigner token
          // or show auth upgrade UI instead of failing on a missing key.
          if (authority === 'posting') {
            const postingKey = getPostingKey(username);
            if (!postingKey) return null;
          }
          return 'key';
        case 'metamask':
          // MetaMask users sign via Hive snap — use keychain-like broadcast path
          return 'keychain';
        default:
          return null;
      }
    },

    // ============================================================================
    // UI Feedback
    // ============================================================================

    showError(message: string, _type?: string) {
      error(message);
    },

    showSuccess(message: string) {
      success(message);
    },

    // ============================================================================
    // Platform-Specific Broadcasting
    // ============================================================================

    async broadcastWithKeychain(
      username: string,
      ops: Operation[],
      keyType: 'posting' | 'active' | 'owner' | 'memo',
    ): Promise<TransactionConfirmation> {
      // MetaMask users route through Hive snap for transaction signing
      const loginType = getLoginType(username);
      if (loginType === 'metamask') {
        return broadcastWithMetaMaskSnap(username, ops, keyType);
      }

      // Keychain Mobile: use hive:// deep link when no browser extension is available
      if (loginType === 'keychain-mobile' && typeof window !== 'undefined' && !hasAnyHiveExtension()) {
        if (keyType !== 'posting' && keyType !== 'active') {
          throw new Error(`Keychain Mobile deep links do not support "${keyType}" authority.`);
        }
        return broadcastWithKeychainMobileDeepLink(username, ops, keyType);
      }

      // Use unified extension layer - supports Keychain, Hive Keeper, and Peak Vault
      return broadcastWithExtension(username, ops, keyType) as Promise<TransactionConfirmation>;
    },

    async broadcastWithHiveSigner(
      username: string,
      ops: Operation[],
      _keyType: 'posting' | 'active' | 'owner' | 'memo',
    ): Promise<TransactionConfirmation> {
      // HiveSigner hot signing: redirects the browser to hivesigner.com for the
      // user to review and sign the operation. The page navigates away, so we
      // return a never-resolving promise — same pattern as Keychain Mobile deep
      // links (broadcastWithKeychainMobileDeepLink) and wallet-operations-sign.
      return new Promise(() => {
        hs.sendOperations(
          ops,
          { callback: `${window.location.origin}${window.location.pathname}` },
          () => {}
        );
      });
    },

    // ============================================================================
    // Optional Platform Features
    // ============================================================================

    async recordActivity(activityType: number, txId: string, _blockNum?: number) {
      try {
        const activeUsername = ls.get("active_user");
        if (!activeUsername) return;
        const token = getAccessToken(activeUsername);
        if (!token) return;
        await usrActivity(token, activityType, undefined, txId);
      } catch (e) {
        // Don't throw on activity recording errors - it's not critical
        console.warn('[WebAdapter] Failed to record user activity:', e);
      }
    },

    async invalidateQueries(queryKeys: any[]) {
      const queryClient = getQueryClient();

      // Invalidate all queries in parallel to avoid await-in-loop
      // Support both array query keys and predicate-based invalidation
      await Promise.all(
        queryKeys
          .filter(Boolean) // Guard against null/undefined to prevent invalidating ALL queries
          .map((entry) =>
            // Check if this is a predicate object (has predicate property)
            entry && typeof entry === 'object' && 'predicate' in entry
              ? queryClient.invalidateQueries({ predicate: entry.predicate })
              : queryClient.invalidateQueries({ queryKey: entry })
          )
      );
    },

    // ============================================================================
    // Smart Auth Strategy Methods
    // ============================================================================

    async hasPostingAuthorization(username: string): Promise<boolean> {
      try {
        const queryClient = getQueryClient();
        const accountData = await queryClient.fetchQuery(getAccountFullQueryOptions(username));

        if (!accountData?.posting?.account_auths) {
          return false;
        }

        // Check if ecency.app is in posting.account_auths
        return accountData.posting.account_auths.some(
          ([account, _weight]: [string, number]) => account === 'ecency.app',
        );
      } catch (error) {
        console.warn('[WebAdapter] Failed to check posting authorization:', error);
        return false;
      }
    },

    async showAuthUpgradeUI(
      requiredAuthority: 'posting' | 'active',
      operation: string,
    ): Promise<'hivesigner' | 'keychain' | 'key' | false> {
      return requestAuthUpgrade(requiredAuthority, operation);
    },

    async grantPostingAuthority(username: string): Promise<void> {
      const user = getUser(username);
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Fetch current account data
      const queryClient = getQueryClient();
      const accountData = await queryClient.fetchQuery(getAccountFullQueryOptions(username));

      if (!accountData) {
        throw new Error('Failed to fetch account data');
      }

      // Check if already granted
      const alreadyGranted = accountData.posting?.account_auths?.some(
        ([account, _weight]: [string, number]) => account === 'ecency.app',
      );

      if (alreadyGranted) {
        return;
      }

      // Granting posting authority is an account_update, so it always asks: the
      // dialog is where the user can decline an authority change. That costs the
      // held key, which the dialog clears on open, but a silent on-chain
      // authority change would be the worse trade.
      const method = await requestAuthUpgrade('active', 'Grant posting authority');
      if (method === false) {
        // User cancelled - granting is optional, return silently
        return;
      }

      // Build the grant posting permission operation
      const op = buildGrantPostingPermissionOp(
        username,
        accountData.posting,
        'ecency.app',
        1,
        accountData.memo_key,
        accountData.json_metadata || '',
      ) as Operation;

      // Broadcast based on selected method
      // Use the adapter's own broadcast methods so MetaMask/Keychain routing is consistent
      const self = getWebBroadcastAdapter();
      switch (method) {
        case 'key': {
          const activeKey = getTempActiveKey(username);
          if (!activeKey) {
            throw new Error('Active key not provided');
          }
          const privateKey = PrivateKey.fromString(activeKey);
          await broadcastOperations([op], privateKey);
          // The key is deliberately kept: it lives as long as the page, so the
          // next active-authority operation doesn't re-prompt.
          break;
        }
        case 'keychain': {
          // Delegates to broadcastWithKeychain which handles MetaMask snap routing
          await self.broadcastWithKeychain!(username, [op], 'active');
          break;
        }
        case 'hivesigner': {
          const token = getAccessToken(username);
          if (!token) {
            throw new Error('HiveSigner access token not found');
          }
          const client = new hs.Client({ accessToken: token });
          await client.broadcast([op]);
          break;
        }
      }

      // Invalidate account query cache after success
      await queryClient.invalidateQueries({
        queryKey: getAccountFullQueryOptions(username).queryKey,
      });
    },
  };
}
