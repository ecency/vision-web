import {
  useMutation,
  type MutationKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { callRPC, MIN_TRANSACTION_SIZE_LIMIT, PrivateKey, RPCError, Transaction } from "../../../hive-tx";
import type { Operation, TransactionType } from "../../../hive-tx";
import { broadcastOperations, broadcastOperationsAsync, type TransactionConfirmation } from "@/modules/core/hive-tx";
import type { BroadcastResult } from "../../../hive-tx";
import type { AuthContextV2 } from "@/modules/core/types";
import { shouldTriggerAuthFallback } from "@/modules/core/errors";
import type { AuthorityLevel } from "@/modules/operations/authority-map";
import hs from "hivesigner";

/**
 * Broadcast mode controls whether the SDK waits for block inclusion.
 *
 * - `'async'` (default): Uses `broadcast_transaction` — returns once the node
 *   accepts the transaction into its mempool. Transport and RPC errors are
 *   still thrown immediately; only the block-inclusion wait is skipped.
 *
 * - `'sync'`: Uses `broadcast_transaction_synchronous` — waits for block
 *   inclusion and returns `block_num`/`trx_num`. Deprecated; prefer `'async'`
 *   and poll `transaction_status_api` if you need block confirmation.
 */
export type BroadcastMode = 'sync' | 'async';

/**
 * Broadcasts operations using a specific auth method.
 *
 * @param method - Auth method to use ('key', 'hiveauth', 'hivesigner', 'keychain', 'custom')
 * @param username - Hive username to broadcast for
 * @param ops - Operations to broadcast
 * @param auth - AuthContextV2 with adapter and configuration
 * @param authority - Key authority to use (posting, active, owner, or memo)
 * @param fetchedKey - Optional pre-fetched key to avoid duplicate fetches
 * @param fetchedToken - Optional pre-fetched access token to avoid duplicate fetches
 * @param broadcastMode - Whether to wait for block inclusion ('sync') or just mempool acceptance ('async')
 * @returns Transaction confirmation from the blockchain
 * @throws Error if method is not available or broadcast fails
 */
async function broadcastWithMethod(
  method: string,
  username: string,
  ops: Operation[],
  auth?: AuthContextV2,
  authority: AuthorityLevel = 'posting',
  fetchedKey?: string | null,
  fetchedToken?: string | null,
  broadcastMode: BroadcastMode = 'async'
): Promise<TransactionConfirmation | BroadcastResult> {
  const adapter = auth?.adapter;

  switch (method) {
    case 'key': {
      if (!adapter) {
        throw new Error('No adapter provided for key-based auth');
      }

      // Use pre-fetched key if provided, otherwise fetch it
      let key: string | null | undefined = fetchedKey;

      if (key === undefined) {
        // Key not pre-fetched, fetch it now based on authority
        switch (authority) {
          case 'owner':
            if (adapter.getOwnerKey) {
              key = await adapter.getOwnerKey(username);
            } else {
              throw new Error(
                `Owner key not supported by adapter. Owner operations (like account recovery) ` +
                `require master password login or manual key entry.`
              );
            }
            break;

          case 'active':
            if (adapter.getActiveKey) {
              key = await adapter.getActiveKey(username);
            }
            break;

          case 'memo':
            if (adapter.getMemoKey) {
              key = await adapter.getMemoKey(username);
            } else {
              throw new Error(
                `Memo key not supported by adapter. Use memo encryption methods instead.`
              );
            }
            break;

          case 'posting':
          default:
            key = await adapter.getPostingKey(username);
            break;
        }
      }

      if (!key) {
        throw new Error(`No ${authority} key available for ${username}`);
      }

      // Attempt broadcast with key
      const privateKey = PrivateKey.fromString(key);
      if (broadcastMode === 'async') {
        return await broadcastOperationsAsync(ops, privateKey);
      }
      return await broadcastOperations(ops, privateKey);
    }

    case 'hiveauth': {
      if (!adapter?.broadcastWithHiveAuth) {
        throw new Error('HiveAuth not supported by adapter');
      }
      return await adapter.broadcastWithHiveAuth(username, ops, authority);
    }

    case 'hivesigner': {
      if (!adapter) {
        throw new Error('No adapter provided for HiveSigner auth');
      }

      // Access tokens only have posting authority — for active/owner/memo ops,
      // go directly to platform-specific HiveSigner broadcast (e.g., redirect to hivesigner.com)
      if (authority !== 'posting') {
        if (adapter.broadcastWithHiveSigner) {
          return await adapter.broadcastWithHiveSigner(username, ops, authority);
        }
        throw new Error(`HiveSigner access token cannot sign ${authority} operations. No platform broadcast available.`);
      }

      // Try direct API broadcast with access token first (posting ops only)
      const token = fetchedToken !== undefined
        ? fetchedToken
        : await adapter.getAccessToken(username);

      if (token) {
        try {
          const client = new hs.Client({ accessToken: token });
          const response = await client.broadcast(ops);
          return response.result;
        } catch (tokenError) {
          // Token broadcast failed — try platform-specific HiveSigner broadcast
          if (adapter.broadcastWithHiveSigner && shouldTriggerAuthFallback(tokenError)) {
            return await adapter.broadcastWithHiveSigner(username, ops, authority);
          }
          throw tokenError;
        }
      }

      // No token available — try platform-specific HiveSigner broadcast
      if (adapter.broadcastWithHiveSigner) {
        return await adapter.broadcastWithHiveSigner(username, ops, authority);
      }

      throw new Error(`No access token available for ${username}`);
    }

    case 'keychain': {
      if (!adapter?.broadcastWithKeychain) {
        throw new Error('Keychain not supported by adapter');
      }
      return await adapter.broadcastWithKeychain(username, ops, authority);
    }

    case 'custom': {
      if (!auth?.broadcast) {
        throw new Error('No custom broadcast function provided');
      }
      return (await auth.broadcast(ops, authority)) as TransactionConfirmation;
    }

    default:
      throw new Error(`Unknown auth method: ${method}`);
  }
}

/**
 * Attempts to broadcast operations using multiple auth methods in fallback chain.
 * Implements sophisticated fallback pattern from mobile app.
 *
 * @param username - Hive username to broadcast for
 * @param ops - Operations to broadcast
 * @param auth - AuthContextV2 with adapter and fallback configuration
 * @param authority - Key authority to use ('posting' | 'active' | 'owner' | 'memo'), defaults to 'posting'
 * @returns Transaction confirmation from the blockchain
 * @throws Error if all auth methods fail or if a non-auth error occurs
 *
 * @remarks
 * **Preferred Behavior (when adapter.getLoginType exists):**
 * - Calls adapter.getLoginType() to determine user's actual auth method
 * - Uses ONLY that method (no fallbacks) - more predictable and faster
 * - If it fails, throws the error immediately
 *
 * **Fallback Behavior (for backward compatibility):**
 * - Tries each auth method in the fallback chain order
 * - Only continues to next method if error is auth-related (missing authority, token expired)
 * - Stops immediately for non-auth errors (RC exhaustion, network errors, validation errors)
 * - Collects all errors and provides detailed failure message
 *
 * @example
 * ```typescript
 * // Preferred: Adapter with getLoginType (single method, no fallbacks)
 * const auth: AuthContextV2 = {
 *   adapter: myAdapter, // includes getLoginType()
 * };
 *
 * // Legacy: Explicit fallback chain (tries multiple methods)
 * const auth: AuthContextV2 = {
 *   adapter: myAdapter,
 *   fallbackChain: ['key', 'hiveauth', 'hivesigner'],
 * };
 * ```
 */
async function broadcastWithFallback(
  username: string,
  ops: Operation[],
  auth?: AuthContextV2,
  authority: AuthorityLevel = 'posting',
  broadcastMode: BroadcastMode = 'async'
): Promise<TransactionConfirmation | BroadcastResult> {
  const adapter = auth?.adapter;

  // PREFERRED APPROACH: If adapter provides getLoginType, use smart auth strategy
  // This avoids unnecessary fallback attempts and is more predictable
  if (adapter?.getLoginType) {
    const loginType = await adapter.getLoginType(username, authority);

    if (loginType) {
      // SMART AUTH STRATEGY: Optimize based on login type + authority + credentials

      // Check if user has granted ecency.app posting authority
      const hasPostingAuth = adapter.hasPostingAuthorization
        ? await adapter.hasPostingAuthorization(username)
        : false;

      // OPTIMIZATION: Use HiveSigner token for posting ops when posting auth is granted
      // This is faster than direct key signing or HiveAuth for key-based logins
      if (
        authority === 'posting' &&
        hasPostingAuth &&
        loginType === 'key'
      ) {
        try {
          // Try HiveSigner API first (faster)
          return await broadcastWithMethod('hivesigner', username, ops, auth, authority, undefined, undefined, broadcastMode);
        } catch (error) {
          // Only fallback if this is an auth-related error
          // Otherwise, rethrow the original error (e.g., network errors, validation errors)
          if (!shouldTriggerAuthFallback(error)) {
            throw error;
          }
          // Fallback to direct key signing if token auth method fails
          console.warn('[SDK] HiveSigner token auth failed, falling back to key:', error);
        }
      }

      // OPTIMIZATION: Use HiveSigner token for keychain/MetaMask users with posting auth (faster, no popup)
      if (
        authority === 'posting' &&
        hasPostingAuth &&
        loginType === 'keychain'
      ) {
        try {
          return await broadcastWithMethod('hivesigner', username, ops, auth, authority, undefined, undefined, broadcastMode);
        } catch (error) {
          if (!shouldTriggerAuthFallback(error)) {
            throw error;
          }
          console.warn('[SDK] HiveSigner token auth failed, falling back to keychain/snap:', error);
        }
      }

      // OPTIMIZATION: Use HiveSigner token for HiveAuth users with posting auth (faster)
      if (
        authority === 'posting' &&
        hasPostingAuth &&
        loginType === 'hiveauth'
      ) {
        try {
          // Try HiveSigner API first (faster)
          return await broadcastWithMethod('hivesigner', username, ops, auth, authority, undefined, undefined, broadcastMode);
        } catch (error) {
          // Only fallback if this is an auth-related error
          // Otherwise, rethrow the original error (e.g., network errors, validation errors)
          if (!shouldTriggerAuthFallback(error)) {
            throw error;
          }
          // Fallback to HiveAuth if token auth method fails
          console.warn('[SDK] HiveSigner token auth failed, falling back to HiveAuth:', error);
        }
      }

      // Use user's actual login method
      try {
        return await broadcastWithMethod(loginType, username, ops, auth, authority, undefined, undefined, broadcastMode);
      } catch (error) {
        // Check if error is due to missing authority (e.g., posting key trying active op)
        if (shouldTriggerAuthFallback(error)) {
          // Show auth upgrade UI if available (only for posting/active operations)
          if (
            adapter.showAuthUpgradeUI &&
            (authority === 'posting' || authority === 'active')
          ) {
            // Guard against empty operations array
            const operationName = ops.length > 0 ? ops[0][0] : 'unknown';
            const selectedMethod = await adapter.showAuthUpgradeUI(authority, operationName);
            if (!selectedMethod) {
              throw new Error(`Operation requires ${authority} authority. User declined alternate auth.`);
            }

            // User selected a specific method - delegate to broadcastWithMethod
            // This handles all auth methods (hiveauth, hivesigner, key, keychain, custom, etc.)
            // broadcastWithMethod already contains all necessary validation and method-specific logic
            return await broadcastWithMethod(selectedMethod, username, ops, auth, authority, undefined, undefined, broadcastMode);
          }
        }

        // Not an auth error, or no upgrade UI available - throw original error
        throw error;
      }
    }

    // loginType is null — user's auth method is unknown (e.g., incomplete login data)
    if (authority === 'posting') {
      // For posting ops, try HiveSigner — access token is usually available for all logins
      try {
        return await broadcastWithMethod('hivesigner', username, ops, auth, authority, undefined, undefined, broadcastMode);
      } catch (hsError) {
        if (shouldTriggerAuthFallback(hsError) && adapter.showAuthUpgradeUI) {
          const operationName = ops.length > 0 ? ops[0][0] : 'unknown';
          const selectedMethod = await adapter.showAuthUpgradeUI(authority, operationName);
          if (!selectedMethod) {
            throw new Error(`No login type available for ${username}. Please log in again.`);
          }
          return await broadcastWithMethod(selectedMethod, username, ops, auth, authority, undefined, undefined, broadcastMode);
        }
        throw hsError;
      }
    } else if (authority === 'active' && adapter.showAuthUpgradeUI) {
      // For active ops, show auth upgrade dialog — no silent fallback possible
      const operationName = ops.length > 0 ? ops[0][0] : 'unknown';
      const selectedMethod = await adapter.showAuthUpgradeUI(authority, operationName);
      if (!selectedMethod) {
        throw new Error(`Operation requires ${authority} authority. User declined alternate auth.`);
      }
      return await broadcastWithMethod(selectedMethod, username, ops, auth, authority, undefined, undefined, broadcastMode);
    }
  }

  // FALLBACK APPROACH: For backward compatibility, use fallback chain
  // This is only used if adapter doesn't provide getLoginType
  const chain = auth?.fallbackChain ?? ['key', 'hiveauth', 'hivesigner', 'keychain', 'custom'];
  const errors: Map<string, Error> = new Map();

  for (const method of chain) {
    try {
      // Check if method is available before attempting
      let shouldSkip = false;
      let skipReason = '';
      let prefetchedKey: string | null | undefined;
      let prefetchedToken: string | null | undefined;

      switch (method) {
        case 'key':
          if (!adapter) {
            shouldSkip = true;
            skipReason = 'No adapter provided';
          } else {
            // Pre-fetch key to check availability (will be reused in broadcast)
            let key: string | null | undefined;

            switch (authority) {
              case 'owner':
                if (adapter.getOwnerKey) {
                  key = await adapter.getOwnerKey(username);
                }
                break;
              case 'active':
                if (adapter.getActiveKey) {
                  key = await adapter.getActiveKey(username);
                }
                break;
              case 'memo':
                if (adapter.getMemoKey) {
                  key = await adapter.getMemoKey(username);
                }
                break;
              case 'posting':
              default:
                key = await adapter.getPostingKey(username);
                break;
            }

            if (!key) {
              shouldSkip = true;
              skipReason = `No ${authority} key available`;
            } else {
              prefetchedKey = key; // Store for reuse
            }
          }
          break;
        case 'hiveauth':
          if (!adapter?.broadcastWithHiveAuth) {
            shouldSkip = true;
            skipReason = 'HiveAuth not supported by adapter';
          }
          break;
        case 'hivesigner':
          if (!adapter) {
            shouldSkip = true;
            skipReason = 'No adapter provided';
          } else {
            // Pre-fetch token if available (will be reused in broadcast)
            const token = await adapter.getAccessToken(username);
            if (token) {
              prefetchedToken = token; // Store for reuse
            }
            // When no token but adapter exists, don't skip —
            // broadcastWithMethod can fall back to adapter.broadcastWithHiveSigner
          }
          break;
        case 'keychain':
          if (!adapter?.broadcastWithKeychain) {
            shouldSkip = true;
            skipReason = 'Keychain not supported by adapter';
          }
          break;
        case 'custom':
          if (!auth?.broadcast) {
            shouldSkip = true;
            skipReason = 'No custom broadcast function provided';
          }
          break;
      }

      if (shouldSkip) {
        errors.set(method, new Error(`Skipped: ${skipReason}`));
        continue;
      }

      // Method is available, attempt broadcast with pre-fetched credentials
      return await broadcastWithMethod(method, username, ops, auth, authority, prefetchedKey, prefetchedToken, broadcastMode);
    } catch (error) {
      // Record actual error from failed broadcast attempt
      errors.set(method, error as Error);

      // Only continue fallback if error suggests trying another method
      if (!shouldTriggerAuthFallback(error)) {
        // If it's not an auth error, throw immediately (e.g., RC error, network error)
        throw error;
      }
    }
  }

  // FIX #2: Improved error message distinguishes between skips and real failures
  const hasRealAttempts = Array.from(errors.values()).some(
    error => !error.message.startsWith('Skipped:')
  );

  if (!hasRealAttempts) {
    // All methods were skipped (none attempted)
    const skipReasons = Array.from(errors.entries())
      .map(([method, error]) => `${method}: ${error.message}`)
      .join(', ');
    throw new Error(
      `[SDK][Broadcast] No auth methods attempted for ${username}. ${skipReasons}`
    );
  }

  // At least one method was attempted but all failed
  const errorMessages = Array.from(errors.entries())
    .map(([method, error]) => `${method}: ${error.message}`)
    .join(', ');

  throw new Error(
    `[SDK][Broadcast] All auth methods failed for ${username}. Errors: ${errorMessages}`
  );
}

/**
 * React Query mutation hook for broadcasting Hive operations.
 * Supports multiple authentication methods with automatic fallback.
 *
 * @template T - Type of the mutation payload
 * @param mutationKey - React Query mutation key for cache management
 * @param username - Hive username (required for broadcast)
 * @param operations - Function that converts payload to Hive operations
 * @param onSuccess - Success callback after broadcast completes
 * @param auth - Authentication context (supports both legacy AuthContext and new AuthContextV2)
 * @param authority - Key authority to use ('posting' | 'active' | 'owner' | 'memo'), defaults to 'posting'
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Authentication Flow:**
 *
 * 1. **With AuthContextV2 + adapter + enableFallback** (recommended for new code):
 *    - Tries auth methods in fallbackChain order
 *    - Smart fallback: only retries on auth errors, not RC/network errors
 *    - Uses platform adapter for storage, UI, and broadcasting
 *
 * 2. **With legacy AuthContext** (backward compatible):
 *    - Tries auth.broadcast() first (custom implementation)
 *    - Falls back to postingKey if available
 *    - Falls back to accessToken (HiveSigner) if available
 *    - Throws if no auth method available
 *
 * **Backward Compatibility:**
 * - All existing code using AuthContext will continue to work
 * - AuthContextV2 extends AuthContext, so it's a drop-in replacement
 * - enableFallback defaults to false if no adapter provided
 *
 * @example
 * ```typescript
 * // New pattern with platform adapter and fallback
 * const mutation = useBroadcastMutation(
 *   ['vote'],
 *   username,
 *   (payload) => [voteOperation(payload)],
 *   () => console.log('Success!'),
 *   {
 *     adapter: myAdapter,
 *     enableFallback: true,
 *     fallbackChain: ['keychain', 'key', 'hivesigner']
 *   },
 *   'posting'
 * );
 *
 * // Legacy pattern (still works)
 * const mutation = useBroadcastMutation(
 *   ['vote'],
 *   username,
 *   (payload) => [voteOperation(payload)],
 *   () => console.log('Success!'),
 *   { postingKey: 'wif-key' }
 * );
 * ```
 */
/**
 * Refuse operations that can never fit in one Hive transaction before any
 * signer (key, Keychain, HiveSigner, HiveAuth, MetaMask) sees them, so the
 * user gets a clear error instead of a broadcast that every node rejects.
 * Anything within the smallest limit witnesses can vote passes without a
 * network call; a larger transaction is judged against the live
 * maximum_block_size, or against the protocol ceiling if that cannot be read.
 * Only the size verdict is enforced: an operation this serializer cannot
 * encode is left to the signer, which serializes it on its own.
 */
export async function assertOperationsFitTransaction(ops: Operation[]): Promise<void> {
  let tx: Transaction;
  try {
    const transaction = {
      ref_block_num: 0,
      ref_block_prefix: 0,
      expiration: "1970-01-01T00:00:00",
      operations: ops,
      extensions: [],
      signatures: [],
    } as unknown as TransactionType;
    tx = new Transaction({ transaction });
    if (tx.size(1) <= MIN_TRANSACTION_SIZE_LIMIT) {
      return;
    }
  } catch {
    return;
  }
  try {
    // Short budget: this only delays an already oversized broadcast, and the
    // protocol ceiling still applies if the nodes are slow.
    const props = await callRPC("condenser_api.get_dynamic_global_properties", [], 3000, 1);
    tx.maximumBlockSize = props?.maximum_block_size;
  } catch {
    // Unknown limit: assertSize falls back to the protocol ceiling.
  }
  tx.assertSize(1);
}

export function useBroadcastMutation<T>(
  mutationKey: MutationKey = [],
  username: string | undefined,
  operations: (payload: T) => Operation[],
  onSuccess: UseMutationOptions<unknown, Error, T>["onSuccess"] = () => {},
  auth?: AuthContextV2,
  authority: AuthorityLevel = 'posting',
  options?: {
    onMutate?: UseMutationOptions<unknown, Error, T>["onMutate"];
    onError?: UseMutationOptions<unknown, Error, T>["onError"];
    onSettled?: UseMutationOptions<unknown, Error, T>["onSettled"];
    /**
     * Controls whether to wait for block inclusion or just mempool acceptance.
     *
     * - `'async'` (default): Returns after mempool acceptance. Recommended for
     *   all operations; errors are still thrown immediately.
     *
     * - `'sync'`: Waits for block inclusion, returns block_num/trx_num.
     *   Deprecated; prefer `'async'`.
     */
    broadcastMode?: BroadcastMode;
  }
) {
  const broadcastMode = options?.broadcastMode ?? 'async';

  return useMutation({
    onSuccess,
    onMutate: options?.onMutate,
    onError: options?.onError,
    onSettled: options?.onSettled,
    mutationKey: [...mutationKey, username],
    mutationFn: async (payload: T) => {
      if (!username) {
        throw new Error(
          "[Core][Broadcast] Attempted to call broadcast API with anon user"
        );
      }

      const ops = operations(payload);
      await assertOperationsFitTransaction(ops);

      try {
        // New: Try auth methods in fallback chain (if enabled)
        if (auth?.enableFallback !== false && auth?.adapter) {
          return await broadcastWithFallback(username, ops, auth, authority, broadcastMode);
        }

        // Legacy behavior: try methods in fixed order (backward compatible)
        if (auth?.broadcast) {
          return await auth.broadcast(ops, authority);
        }

        const postingKey = auth?.postingKey;
        if (postingKey) {
          // Legacy auth only supports posting authority
          if (authority !== 'posting') {
            throw new Error(
              `[SDK][Broadcast] Legacy auth only supports posting authority, but '${authority}' was requested. ` +
              `Use AuthContextV2 with an adapter for ${authority} operations.`
            );
          }

          const privateKey = PrivateKey.fromString(postingKey);

          return await broadcastOperations(
            ops,
            privateKey
          );
        }

        const accessToken = auth?.accessToken;
        if (accessToken) {
          const client = new hs.Client({ accessToken });
          const response = await client.broadcast(ops);
          return response.result;
        }

        throw new Error(
          "[SDK][Broadcast] – cannot broadcast w/o posting key or token"
        );
      } catch (e) {
        if (e instanceof RPCError) {
          // Normalize raw blockchain rejections (missing authority, RC exhaustion,
          // validation failures) from every broadcast path — sync and async — into
          // a plain Error whose message is preserved for downstream classification
          // (formatError), so React Query captures a handled mutation error.
          throw new Error(e.message);
        }
        throw e
      }
    },
  });
}
