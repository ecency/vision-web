import { O as Operation, P as PrivateKey, B as BroadcastResult, a as OperationName, o as operations } from './utils-Cit-_MdN.js';
import * as _tanstack_react_query from '@tanstack/react-query';
import { MutationKey, UseMutationOptions, useMutation } from '@tanstack/react-query';

/**
 * Re-exports hive-tx APIs and provides helper functions that bridge
 * API differences from the legacy dhive library.
 */

/** Compatible with dhive's TransactionConfirmation from broadcast_transaction_synchronous */
interface TransactionConfirmation {
    id: string;
    block_num: number;
    trx_num: number;
    expired: boolean;
}
/** Authority role type used in key management */
type AuthorityType = "owner" | "active" | "posting" | "memo";
/** SMT asset format (NAI representation) used in transaction history */
interface SMTAsset {
    amount: string;
    precision: number;
    nai: string;
}
/** RC account data from rc_api.find_rc_accounts */
interface RCAccount {
    account: string;
    rc_manabar: {
        current_mana: string | number;
        last_update_time: number;
    };
    max_rc: string | number;
    max_rc_creation_adjustment: {
        amount: string;
        precision: number;
        nai: string;
    };
    delegated_rc: number;
    received_delegated_rc: number;
}
/**
 * Compute SHA-256 hash of a string or Uint8Array.
 * Drop-in replacement for dhive's `cryptoUtils.sha256()`.
 */
declare function sha256(input: string | Uint8Array): Uint8Array;
/** Check if a string is a valid WIF-encoded private key. */
declare function isWif(key: string): boolean;
/**
 * Sign and broadcast operations, returning a dhive-compatible TransactionConfirmation.
 *
 * Uses broadcast_transaction_synchronous so the response includes block_num/trx_num,
 * matching the shape that the rest of the codebase expects from dhive's
 * `client.broadcast.sendOperations()`.
 *
 * @deprecated Prefer {@link broadcastOperationsAsync} (the default for
 * `useBroadcastMutation`); poll `transaction_status_api` if you need block
 * confirmation. Kept only for explicit `broadcastMode: 'sync'` opt-ins.
 */
declare function broadcastOperations(ops: Operation[], key: PrivateKey): Promise<TransactionConfirmation>;
/**
 * Sign one transaction with several keys and broadcast it, waiting for block
 * inclusion. Needed when an operation requires more than one signature, such as
 * `recover_account` (a recent owner key plus the new owner key).
 */
declare function broadcastOperationsWithKeys(ops: Operation[], keys: PrivateKey[]): Promise<TransactionConfirmation>;
/**
 * Sign and broadcast operations without waiting for block inclusion.
 *
 * Uses broadcast_transaction which returns as soon as the node accepts the
 * transaction into its mempool. Transport and RPC errors (network failures,
 * invalid operations, expired transactions) are still thrown immediately -
 * the only thing skipped is the wait for the transaction to appear in a block.
 *
 * Returns { tx_id, status: 'unknown' }. To confirm block inclusion afterward,
 * poll transaction_status_api with the returned tx_id.
 *
 * Prefer this for operations where faster response matters more than
 * immediate confirmation (e.g. votes, reblogs, follows).
 *
 * Use broadcastOperations() when you need block_num/trx_num confirmation
 * (e.g. transfers, account updates, key changes).
 */
declare function broadcastOperationsAsync(ops: Operation[], key: PrivateKey): Promise<BroadcastResult>;
interface ManaResult {
    current_mana: number;
    max_mana: number;
    percentage: number;
}
/** Calculate voting power mana (equivalent to dhive client.rc.calculateVPMana) */
declare function calculateVPMana(account: any): ManaResult;
/** Calculate RC mana (equivalent to dhive client.rc.calculateRCMana) */
declare function calculateRCMana(rcAccount: RCAccount): ManaResult;

/**
 * Platform-specific adapter for SDK mutations.
 * Enables SDK to work across React Native (mobile) and Next.js (web).
 *
 * This interface allows the SDK to remain platform-agnostic while supporting
 * platform-specific features like encrypted storage (mobile), localStorage (web),
 * Keychain integration (web), and different state management solutions.
 *
 * @example
 * ```typescript
 * // Web adapter using localStorage and Zustand
 * const webAdapter: PlatformAdapter = {
 *   getUser: async (username) => localStorage.getItem(`user-${username}`),
 *   getPostingKey: async (username) => localStorage.getItem(`key-${username}`),
 *   showError: (msg) => toast.error(msg),
 *   showSuccess: (msg) => toast.success(msg),
 * };
 *
 * // Mobile adapter using Redux and encrypted storage
 * const mobileAdapter: PlatformAdapter = {
 *   getUser: async (username) => store.getState().users[username],
 *   getPostingKey: async (username) => decryptKey(username),
 *   showError: (msg) => Alert.alert('Error', msg),
 *   showSuccess: (msg) => Alert.alert('Success', msg),
 * };
 * ```
 */
interface PlatformAdapter {
    /**
     * Retrieve user data from platform-specific storage.
     *
     * @param username - The username to look up
     * @returns User object or undefined if not found
     *
     * @remarks
     * - Web: localStorage, Zustand store
     * - Mobile: Redux store, AsyncStorage with PIN decryption
     */
    getUser: (username: string) => Promise<User | undefined>;
    /**
     * Retrieve posting key from secure storage.
     *
     * @param username - The username to get key for
     * @returns Posting key (WIF format), null if Keychain/HiveAuth, undefined if not found
     *
     * @remarks
     * - Returns null for Keychain/HiveAuth users (use broadcastWithKeychain instead)
     * - Mobile: Decrypts key using PIN
     * - Web: Retrieves from localStorage
     */
    getPostingKey: (username: string) => Promise<string | null | undefined>;
    /**
     * Retrieve active key from secure storage (for transfers and other active operations).
     *
     * @param username - The username to get key for
     * @returns Active key (WIF format), null if Keychain/HiveAuth, undefined if not found
     *
     * @remarks
     * - Returns null for Keychain/HiveAuth users (use broadcastWithKeychain instead)
     * - Mobile: Decrypts key using PIN
     * - Web: Retrieves from localStorage
     * - Required for transfer, power down, and other active authority operations
     */
    getActiveKey?: (username: string) => Promise<string | null | undefined>;
    /**
     * Retrieve owner key from secure storage (for account recovery and password changes).
     *
     * @param username - The username to get key for
     * @returns Owner key (WIF format), null if Keychain/HiveAuth, undefined if not found
     *
     * @remarks
     * - Returns null for Keychain/HiveAuth users (use broadcastWithKeychain instead)
     * - Mobile: Decrypts key using PIN (only available for master password logins)
     * - Web: Retrieves from localStorage (only available for master password logins)
     * - Required for account recovery, password changes, and key rotation
     * - Most users won't have owner key stored - only master password logins
     */
    getOwnerKey?: (username: string) => Promise<string | null | undefined>;
    /**
     * Retrieve memo key from secure storage (for memo encryption/decryption).
     *
     * @param username - The username to get key for
     * @returns Memo key (WIF format), null if Keychain/HiveAuth, undefined if not found
     *
     * @remarks
     * - Returns null for Keychain/HiveAuth users
     * - Mobile: Decrypts key using PIN
     * - Web: Retrieves from localStorage
     * - Used for encrypting/decrypting transfer memos
     * - Rarely used for signing operations (mostly for encryption)
     */
    getMemoKey?: (username: string) => Promise<string | null | undefined>;
    /**
     * Retrieve HiveSigner access token from storage.
     *
     * @param username - The username to get token for
     * @returns Access token or undefined if not using HiveSigner
     */
    getAccessToken: (username: string) => Promise<string | undefined>;
    /**
     * Get the login method used for this user.
     *
     * @param username - The username to check
     * @param authority - The authority level needed for the operation ('posting' | 'active' | 'owner' | 'memo').
     *   Adapters can use this to return a different method depending on what key the operation requires.
     *   For example, an active-key user might return 'key' for active ops but 'hivesigner' for posting ops.
     * @returns Login type ('key', 'hivesigner', 'keychain', 'hiveauth') or null
     */
    getLoginType: (username: string, authority?: string) => Promise<string | null | undefined>;
    /**
     * Check if user has granted ecency.app posting authority.
     *
     * @param username - The username to check
     * @returns true if ecency.app is in posting.account_auths, false otherwise
     *
     * @remarks
     * Used to determine if posting operations can use HiveSigner access token
     * instead of requiring direct key signing or HiveAuth/Keychain.
     *
     * When posting authority is granted:
     * - Master password users: Can use token for faster posting ops
     * - Active key users: Can use token for posting ops (key for active ops)
     * - HiveAuth users: Can use token for faster posting ops (optional optimization)
     *
     * @example
     * ```typescript
     * const hasAuth = await adapter.hasPostingAuthorization('alice');
     * if (hasAuth) {
     *   // Use HiveSigner API with access token (faster)
     *   await broadcastWithToken(ops);
     * } else {
     *   // Use direct key signing or show grant prompt
     *   await broadcastWithKey(ops);
     * }
     * ```
     */
    hasPostingAuthorization?: (username: string) => Promise<boolean>;
    /**
     * Display error message to user.
     *
     * @param message - Error message to display
     * @param type - Optional error type for categorization
     *
     * @remarks
     * - Web: toast.error()
     * - Mobile: Alert.alert(), custom error modal
     */
    showError: (message: string, type?: string) => void;
    /**
     * Display success message to user.
     *
     * @param message - Success message to display
     *
     * @remarks
     * - Web: toast.success()
     * - Mobile: Alert.alert(), custom success modal
     */
    showSuccess: (message: string) => void;
    /**
     * Display loading indicator (optional).
     *
     * @param message - Loading message to display
     */
    showLoading?: (message: string) => void;
    /**
     * Hide loading indicator (optional).
     */
    hideLoading?: () => void;
    /**
     * Show UI to prompt user to upgrade their auth method for an operation.
     *
     * @param requiredAuthority - The authority level needed ('posting' or 'active')
     * @param operation - Description of the operation requiring upgrade
     * @returns Promise that resolves to:
     *   - 'hiveauth' if user selected HiveAuth
     *   - 'hivesigner' if user selected HiveSigner
     *   - 'key' if user wants to enter key manually (temporary use)
     *   - false if user cancelled/declined
     *
     * @remarks
     * Called when user's login method doesn't support the required operation:
     * - Posting key user trying active operation → needs active key
     * - No-key user trying any operation → needs auth method
     *
     * Platform should show modal/sheet offering:
     * 1. Sign with HiveAuth (if available)
     * 2. Sign with HiveSigner (if available)
     * 3. Enter active/posting key manually (temporary use)
     * 4. Cancel button
     *
     * Return the method user explicitly selected, allowing SDK to skip
     * unavailable methods and provide better error messages.
     *
     * When 'key' is returned, platform should show a key entry modal,
     * then call broadcastWithMethod('key', ...) with the entered key
     * stored temporarily in the adapter.
     *
     * @example
     * ```typescript
     * // User logged in with posting key tries to transfer
     * const method = await adapter.showAuthUpgradeUI('active', 'Transfer');
     * if (method === 'hiveauth') {
     *   await broadcastWithHiveAuth(ops);
     * } else if (method === 'hivesigner') {
     *   await broadcastWithHiveSigner(ops);
     * } else if (method === 'key') {
     *   // Platform will show key entry modal and temporarily store the key
     *   await broadcastWithKey(ops);
     * } else {
     *   // User cancelled
     *   throw new Error('Operation requires active authority');
     * }
     * ```
     */
    showAuthUpgradeUI?: (requiredAuthority: 'posting' | 'active', operation: string) => Promise<'hiveauth' | 'hivesigner' | 'keychain' | 'key' | false>;
    /**
     * Broadcast operations using Keychain browser extension.
     *
     * @param username - Account broadcasting the operations
     * @param ops - Operations to broadcast
     * @param keyType - Authority level (lowercase: "posting", "active", "owner", "memo")
     * @returns Transaction confirmation
     *
     * @remarks
     * Web platform only. Implementations should map lowercase keyType to
     * Keychain's expected PascalCase format internally if needed.
     *
     * @example
     * ```typescript
     * async broadcastWithKeychain(username, ops, keyType) {
     *   // Map to Keychain's expected format
     *   const keychainKeyType = keyType.charAt(0).toUpperCase() + keyType.slice(1);
     *   return await window.hive_keychain.requestBroadcast(username, ops, keychainKeyType);
     * }
     * ```
     */
    broadcastWithKeychain?: (username: string, ops: Operation[], keyType: "posting" | "active" | "owner" | "memo") => Promise<TransactionConfirmation>;
    /**
     * Broadcast operations using HiveAuth protocol.
     *
     * @param username - Username to broadcast for
     * @param ops - Operations to broadcast
     * @param keyType - Key authority required
     * @returns Transaction confirmation
     *
     * @remarks
     * - Shows platform-specific HiveAuth modal/screen
     * - Generates QR code for mobile auth app
     * - Handles WebSocket communication with auth app
     */
    broadcastWithHiveAuth?: (username: string, ops: Operation[], keyType: "posting" | "active" | "owner" | "memo") => Promise<TransactionConfirmation>;
    /**
     * Broadcast operations using HiveSigner with platform-specific UI.
     *
     * @param username - Username to broadcast for
     * @param ops - Operations to broadcast
     * @param keyType - Key authority required
     * @returns Transaction confirmation
     *
     * @remarks
     * - Mobile: Opens full-screen WebView for HiveSigner hot signing
     * - Web: May redirect to HiveSigner or use popup
     * - When provided, used instead of direct token-based API broadcast
     * - Required for active operations where the access token lacks authority
     */
    broadcastWithHiveSigner?: (username: string, ops: Operation[], keyType: "posting" | "active" | "owner" | "memo") => Promise<TransactionConfirmation>;
    /**
     * Record user activity for analytics (optional).
     *
     * @param activityType - Numeric activity type code
     * @param txId - Transaction ID
     * @param blockNum - Block number of the activity
     *
     * @remarks
     * - Used for tracking user engagement
     * - Platform can implement custom analytics
     */
    recordActivity?: (activityType: number, txId: string, blockNum?: number) => Promise<void>;
    /**
     * Invalidate React Query cache keys (optional).
     *
     * @param keys - Array of query keys to invalidate
     *
     * @remarks
     * - Triggers refetch of cached data
     * - Used after mutations to update UI
     * - Example: [['posts', author, permlink], ['accountFull', username]]
     */
    invalidateQueries?: (keys: any[][]) => Promise<void>;
    /**
     * Grant ecency.app posting authority for the user (optional).
     *
     * @param username - The username to grant authority for
     * @returns Promise that resolves when authority is granted
     * @throws Error if grant fails or user doesn't have active key
     *
     * @remarks
     * Adds 'ecency.app' to the user's posting.account_auths with appropriate weight.
     * Requires active authority to broadcast the account_update operation.
     *
     * Called automatically during login for:
     * - Master password logins (has active key)
     * - Active key logins (has active key)
     * - BIP44 seed logins (has active key)
     *
     * Can be called manually for HiveAuth users as an optimization.
     *
     * After granting, posting operations can use HiveSigner API with access token
     * instead of requiring HiveAuth/Keychain each time (faster UX).
     *
     * @example
     * ```typescript
     * // Auto-grant on master password login
     * if (authType === 'master' && !hasPostingAuth) {
     *   await adapter.grantPostingAuthority(username);
     * }
     *
     * // Manual grant for HiveAuth optimization
     * if (authType === 'hiveauth' && userWantsOptimization) {
     *   await adapter.grantPostingAuthority(username);
     * }
     * ```
     */
    grantPostingAuthority?: (username: string) => Promise<void>;
}
/**
 * Authentication method types supported by the SDK.
 */
type AuthMethod = 'key' | 'hiveauth' | 'hivesigner' | 'keychain' | 'custom';
/**
 * Minimal user type for platform adapters.
 * Platforms can extend this with their own user models.
 *
 * @example
 * ```typescript
 * // Web platform user
 * interface WebUser extends User {
 *   username: string;
 *   postingKey?: string;
 *   accessToken?: string;
 *   loginType: 'keychain' | 'hivesigner';
 * }
 *
 * // Mobile platform user
 * interface MobileUser extends User {
 *   name: string;
 *   local: {
 *     authType: 'key' | 'hiveauth';
 *     postingKey: string; // encrypted
 *   };
 * }
 * ```
 */
interface User {
    /** Hive username */
    username?: string;
    /** Display name (alias for username on some platforms) */
    name?: string;
    /** Platform-specific user data */
    [key: string]: any;
}

/**
 * Original AuthContext for backward compatibility.
 *
 * This interface is maintained for existing SDK consumers who pass
 * auth context directly to mutations.
 *
 * @deprecated Use AuthContextV2 for new implementations to enable platform adapters.
 *
 * @example
 * ```typescript
 * // Legacy usage (still supported)
 * const authContext: AuthContext = {
 *   postingKey: 'wif-key',
 *   accessToken: 'hs-token',
 *   loginType: 'hivesigner'
 * };
 * ```
 */
interface AuthContext {
    /** HiveSigner OAuth access token */
    accessToken?: string;
    /** Posting key in WIF format (null for Keychain/HiveAuth users) */
    postingKey?: string | null;
    /** Login method used ('key', 'hivesigner', 'keychain', 'hiveauth') */
    loginType?: string | null;
    /**
     * A caller-supplied broadcaster for signing operations that the platform adapter cannot perform.
     *
     * NOT deprecated, and not a legacy path. `useBroadcastMutation` reaches it as
     * `case 'custom'`, the last link of the default fallback chain, and two call
     * sites in the web app need it because no adapter method fits:
     *
     * - `use-login-by-key.ts` grants posting permission DURING login, before the
     *   user exists to the adapter, so the key comes from a ref instead.
     * - `wallet-operations-sign.tsx` dispatches on a signing method the user picks
     *   mid-flow, which is a decision the adapter has no way to know about.
     *
     * It carried an `@deprecated` tag pointing at `broadcastWithKeychain`, and
     * that reading is what went wrong: four SDK mutations treated this as "the
     * keychain path", checked it, and threw when a caller passed an
     * `AuthContextV2` that legitimately has no `broadcast`. Every field here is
     * optional, so V2 satisfies `AuthContext` structurally and the type checker
     * saw nothing; each site failed only when a real user reached it. Migrated in
     * #1376.
     *
     * So: reach for the adapter when you mean "sign with the user's wallet". Reach
     * for this only when you are supplying the signing yourself, and never as a
     * way to detect Keychain.
     */
    broadcast?: (operations: Operation[], authority?: "active" | "posting" | "owner" | "memo") => Promise<unknown>;
}
/**
 * Enhanced AuthContext with platform adapter support.
 * Backward compatible with AuthContext.
 *
 * This is the recommended interface for new SDK integrations. It enables
 * platform-specific features while keeping the SDK agnostic of implementation details.
 *
 * @example
 * ```typescript
 * // Web usage with platform adapter
 * const authContext: AuthContextV2 = {
 *   adapter: {
 *     getUser: async (username) => getUserFromZustand(username),
 *     getPostingKey: async (username) => localStorage.getItem(`key-${username}`),
 *     showError: (msg) => toast.error(msg),
 *     showSuccess: (msg) => toast.success(msg),
 *     broadcastWithKeychain: async (username, ops, keyType) => {
 *       // Map lowercase to Keychain's PascalCase format
 *       const keychainKeyType = keyType.charAt(0).toUpperCase() + keyType.slice(1);
 *       return window.hive_keychain.requestBroadcast(username, ops, keychainKeyType);
 *     },
 *   },
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner'],
 * };
 *
 * // Mobile usage with platform adapter
 * const authContext: AuthContextV2 = {
 *   adapter: {
 *     getUser: async (username) => store.getState().users[username],
 *     getPostingKey: async (username) => decryptKey(username, pin),
 *     showError: (msg) => Alert.alert('Error', msg),
 *     showSuccess: (msg) => Alert.alert('Success', msg),
 *     broadcastWithHiveAuth: async (username, ops, keyType) => {
 *       return showHiveAuthModal(username, ops, keyType);
 *     },
 *   },
 *   enableFallback: true,
 *   fallbackChain: ['hiveauth', 'key'],
 * };
 *
 * // Legacy usage (still works)
 * const authContext: AuthContextV2 = {
 *   postingKey: 'wif-key',
 *   loginType: 'key',
 * };
 * ```
 */
interface AuthContextV2 extends AuthContext {
    /**
     * Platform-specific adapter for storage, UI, and broadcasting.
     *
     * When provided, the SDK will use the adapter to:
     * - Retrieve user credentials from platform storage
     * - Show error/success messages in platform UI
     * - Broadcast operations using platform-specific methods (Keychain, HiveAuth)
     * - Invalidate React Query caches after mutations
     *
     * @remarks
     * If not provided, SDK falls back to using postingKey/accessToken directly.
     */
    adapter?: PlatformAdapter;
    /**
     * Whether to enable automatic fallback between auth methods.
     *
     * @remarks
     * The actual behavior is:
     * - When adapter is provided: defaults to true (fallback enabled)
     * - When no adapter: defaults to false (legacy behavior)
     *
     * This is evaluated at runtime as: `auth?.enableFallback !== false && auth?.adapter`
     *
     * Set to `false` explicitly to disable fallback even with an adapter.
     *
     * @default undefined (evaluated as true when adapter exists, false otherwise)
     *
     * @example
     * ```typescript
     * // User has Keychain but it fails -> try posting key -> try HiveSigner
     * const authContext: AuthContextV2 = {
     *   adapter: myAdapter,
     *   enableFallback: true,
     *   fallbackChain: ['keychain', 'key', 'hivesigner'],
     * };
     * ```
     */
    enableFallback?: boolean;
    /**
     * Order of authentication methods to try during fallback.
     *
     * Available methods:
     * - 'key': Direct private key (adapter.getPostingKey or getActiveKey)
     * - 'hiveauth': HiveAuth protocol (adapter.broadcastWithHiveAuth)
     * - 'hivesigner': HiveSigner OAuth (adapter.getAccessToken)
     * - 'keychain': Keychain extension (adapter.broadcastWithKeychain)
     * - 'custom': Use AuthContext.broadcast()
     *
     * @default ['key', 'hiveauth', 'hivesigner', 'keychain', 'custom']
     *
     * @remarks
     * Set this to customize the order or exclude methods. For example:
     * - Mobile priority: ['hiveauth', 'hivesigner', 'key']
     * - Web priority: ['keychain', 'key', 'hivesigner']
     *
     * @see broadcastWithFallback for the runtime implementation
     */
    fallbackChain?: AuthMethod[];
}

/**
 * Authority levels for Hive blockchain operations.
 * - posting: Social operations (voting, commenting, reblogging)
 * - active: Financial and account management operations
 * - owner: Critical security operations (key changes, account recovery)
 * - memo: Memo encryption/decryption (rarely used for signing)
 */
type AuthorityLevel = 'posting' | 'active' | 'owner' | 'memo';
/**
 * Maps operation types to their required authority level.
 *
 * This mapping is used to determine which key is needed to sign a transaction,
 * enabling smart auth fallback and auth upgrade UI.
 *
 * @remarks
 * - Most social operations (vote, comment, reblog) require posting authority
 * - Financial operations (transfer, withdraw) require active authority
 * - Account management operations require active authority
 * - Security operations (password change, account recovery) require owner authority
 * - custom_json requires dynamic detection based on required_auths vs required_posting_auths
 */
declare const OPERATION_AUTHORITY_MAP: Record<string, AuthorityLevel>;
/**
 * Determines authority required for a custom_json operation.
 *
 * Custom JSON operations can require either posting or active authority
 * depending on which field is populated:
 * - required_auths (active authority)
 * - required_posting_auths (posting authority)
 *
 * @param customJsonOp - The custom_json operation to inspect
 * @returns 'active' if requires active authority, 'posting' if requires posting authority
 *
 * @example
 * ```typescript
 * // Reblog operation (posting authority)
 * const reblogOp: Operation = ['custom_json', {
 *   required_auths: [],
 *   required_posting_auths: ['alice'],
 *   id: 'reblog',
 *   json: '...'
 * }];
 * getCustomJsonAuthority(reblogOp); // Returns 'posting'
 *
 * // Some active authority custom_json
 * const activeOp: Operation = ['custom_json', {
 *   required_auths: ['alice'],
 *   required_posting_auths: [],
 *   id: 'some_active_op',
 *   json: '...'
 * }];
 * getCustomJsonAuthority(activeOp); // Returns 'active'
 * ```
 */
declare function getCustomJsonAuthority(customJsonOp: Operation): AuthorityLevel;
/**
 * Determines authority required for a proposal operation.
 *
 * Proposal operations (create_proposal, update_proposal) typically require
 * active authority as they involve financial commitments and funding allocations.
 *
 * @param proposalOp - The proposal operation to inspect
 * @returns 'active' authority requirement
 *
 * @remarks
 * Unlike custom_json, proposal operations don't have explicit required_auths fields.
 * They always use the creator's authority, which defaults to active for financial
 * operations involving the DAO treasury.
 *
 * @example
 * ```typescript
 * const proposalOp: Operation = ['create_proposal', {
 *   creator: 'alice',
 *   receiver: 'bob',
 *   subject: 'My Proposal',
 *   permlink: 'my-proposal',
 *   start: '2026-03-01T00:00:00',
 *   end: '2026-04-01T00:00:00',
 *   daily_pay: '100.000 HBD',
 *   extensions: []
 * }];
 * getProposalAuthority(proposalOp); // Returns 'active'
 * ```
 */
declare function getProposalAuthority(proposalOp: Operation): AuthorityLevel;
/**
 * Determines the required authority level for any operation.
 *
 * Uses the OPERATION_AUTHORITY_MAP for standard operations, and dynamic
 * detection for custom_json operations.
 *
 * @param op - The operation to check
 * @returns 'posting' or 'active' authority requirement
 *
 * @example
 * ```typescript
 * const voteOp: Operation = ['vote', { voter: 'alice', author: 'bob', permlink: 'post', weight: 10000 }];
 * getOperationAuthority(voteOp); // Returns 'posting'
 *
 * const transferOp: Operation = ['transfer', { from: 'alice', to: 'bob', amount: '1.000 HIVE', memo: '' }];
 * getOperationAuthority(transferOp); // Returns 'active'
 * ```
 */
declare function getOperationAuthority(op: Operation): AuthorityLevel;
/**
 * Determines the highest authority level required for a list of operations.
 *
 * Useful when broadcasting multiple operations together - the highest authority
 * level required by any operation determines what key is needed for the batch.
 *
 * Authority hierarchy: owner > active > posting > memo
 *
 * @param ops - Array of operations
 * @returns Highest authority level required ('owner', 'active', or 'posting')
 *
 * @example
 * ```typescript
 * const ops: Operation[] = [
 *   ['vote', { ... }],        // posting
 *   ['comment', { ... }],     // posting
 * ];
 * getRequiredAuthority(ops); // Returns 'posting'
 *
 * const mixedOps: Operation[] = [
 *   ['comment', { ... }],     // posting
 *   ['transfer', { ... }],    // active
 * ];
 * getRequiredAuthority(mixedOps); // Returns 'active'
 *
 * const securityOps: Operation[] = [
 *   ['transfer', { ... }],               // active
 *   ['change_recovery_account', { ... }], // owner
 * ];
 * getRequiredAuthority(securityOps); // Returns 'owner'
 * ```
 */
declare function getRequiredAuthority(ops: Operation[]): AuthorityLevel;

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
type BroadcastMode = 'sync' | 'async';
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
 * @internal Shared with broadcastJson's auth fallback; not part of the public API.
 */
declare function broadcastWithMethod(method: string, username: string, ops: Operation[], auth?: AuthContextV2, authority?: AuthorityLevel, fetchedKey?: string | null, fetchedToken?: string | null, broadcastMode?: BroadcastMode): Promise<TransactionConfirmation | BroadcastResult>;
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
declare function assertOperationsFitTransaction(ops: Operation[]): Promise<void>;
declare function useBroadcastMutation<T>(mutationKey: MutationKey | undefined, username: string | undefined, operations: (payload: T) => Operation[], onSuccess?: UseMutationOptions<unknown, Error, T>["onSuccess"], auth?: AuthContextV2, authority?: AuthorityLevel, options?: {
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
}): _tanstack_react_query.UseMutationResult<unknown, Error, T, unknown>;

declare enum Symbol {
    HIVE = "HIVE",
    HBD = "HBD",
    VESTS = "VESTS"
}
declare enum NaiMap {
    "@@000000021" = "HIVE",
    "@@000000013" = "HBD",
    "@@000000037" = "VESTS"
}
interface Asset {
    amount: number;
    symbol: Symbol;
}
declare function parseAsset(sval: string | SMTAsset): Asset;

declare function vestsToHp(vests: number, hivePerMVests: number): number;

declare function isEmptyDate(s: string | undefined): boolean;

interface AccountProfile {
    about?: string;
    cover_image?: string;
    location?: string;
    name?: string;
    profile_image?: string;
    website?: string;
    pinned?: string;
    reputation?: number;
    version?: number;
    beneficiary?: {
        account: string;
        weight: number;
    };
    tokens?: {
        symbol: string;
        type: string;
        meta: Record<string, any>;
    }[];
}

interface BaseTransaction {
    num: number;
    type: string;
    timestamp: string;
    trx_id: string;
}
interface CurationReward extends BaseTransaction {
    type: "curation_reward";
    comment_author?: string;
    comment_permlink?: string;
    author?: string;
    permlink?: string;
    curator: string;
    reward: string;
}
interface AuthorReward extends BaseTransaction {
    type: "author_reward";
    author: string;
    permlink: string;
    hbd_payout: string;
    hive_payout: string;
    vesting_payout: string;
}
interface CommentBenefactor extends BaseTransaction {
    type: "comment_benefactor_reward";
    benefactor: string;
    author: string;
    permlink: string;
    hbd_payout: string;
    hive_payout: string;
    vesting_payout: string;
}
interface ClaimRewardBalance extends BaseTransaction {
    type: "claim_reward_balance";
    account: string;
    reward_hbd: string;
    reward_hive: string;
    reward_vests: string;
}
interface Transfer extends BaseTransaction {
    type: "transfer";
    amount: string;
    memo: string;
    from: string;
    to: string;
}
interface TransferToVesting extends BaseTransaction {
    type: "transfer_to_vesting";
    amount: string;
    memo?: string;
    from: string;
    to: string;
}
interface SetWithdrawRoute extends BaseTransaction {
    type: "set_withdraw_vesting_route";
    from_account: string;
    to_account: string;
    percent: number;
    auto_vest: boolean;
}
interface TransferToSavings extends BaseTransaction {
    type: "transfer_to_savings";
    amount: string;
    memo?: string;
    from: string;
    to: string;
}
interface TransferFromSavings extends BaseTransaction {
    type: "transfer_from_savings";
    amount: string;
    memo?: string;
    from: string;
    to: string;
    request_id: number;
}
/** Virtual op emitted when a savings withdrawal's three-day timer completes. */
interface FillTransferFromSavings extends BaseTransaction {
    type: "fill_transfer_from_savings";
    amount: string;
    memo?: string;
    from: string;
    to: string;
    request_id: number;
}
interface CancelTransferFromSavings extends BaseTransaction {
    from: string;
    request_id: number;
    type: "cancel_transfer_from_savings";
}
interface WithdrawVesting extends BaseTransaction {
    type: "withdraw_vesting";
    acc: string;
    vesting_shares: string;
}
interface FillOrder extends BaseTransaction {
    type: "fill_order";
    current_pays: string;
    open_pays: string;
}
interface LimitOrderCancel extends BaseTransaction {
    type: "limit_order_cancel";
    owner: string;
    orderid: number;
}
interface ProducerReward extends BaseTransaction {
    type: "producer_reward";
    vesting_shares: string;
    producer: string;
}
interface Interest extends BaseTransaction {
    type: "interest";
    owner: string;
    interest: string;
}
interface FillConvertRequest extends BaseTransaction {
    type: "fill_convert_request";
    amount_in: string;
    amount_out: string;
}
interface FillCollateralizedConvertRequest extends BaseTransaction {
    type: "fill_collateralized_convert_request";
    owner: string;
    requestid: number;
    amount_in: string;
    amount_out: string;
    excess_collateral: string;
}
interface ReturnVestingDelegation extends BaseTransaction {
    type: "return_vesting_delegation";
    vesting_shares: string;
}
interface ProposalPay extends BaseTransaction {
    type: "proposal_pay";
    payment: string;
    receiver: string;
    proposal_id: number;
}
interface UpdateProposalVotes extends BaseTransaction {
    type: "update_proposal_votes";
    voter: string;
    proposal_ids: [number];
    approve: boolean;
}
interface CommentPayoutUpdate extends BaseTransaction {
    type: "comment_payout_update";
    author: string;
    permlink: string;
}
interface CommentReward extends BaseTransaction {
    type: "comment_reward";
    author: string;
    permlink: string;
    payout: string;
}
interface CollateralizedConvert extends BaseTransaction {
    type: "collateralized_convert";
    owner: string;
    requestid: number;
    amount: string;
}
interface RecurrentTransfers extends BaseTransaction {
    type: "recurrent_transfer";
    amount: string;
    memo: string;
    from: string;
    to: string;
    recurrence: number;
    executions: number;
}
interface FillRecurrentTransfers extends BaseTransaction {
    type: "fill_recurrent_transfer";
    amount: SMTAsset;
    memo: string;
    from: string;
    to: string;
    remaining_executions: number;
}
interface DelegateVestingShares extends BaseTransaction {
    type: "delegate_vesting_shares";
    delegator: string;
    delegatee: string;
    vesting_shares: string;
}
interface LimitOrderCreate extends BaseTransaction {
    type: "limit_order_create";
    owner: string;
    orderid: number;
    amount_to_sell: string;
    min_to_receive: string;
    expiration: string;
}
interface FillVestingWithdraw extends BaseTransaction {
    type: "fill_vesting_withdraw";
    from_account: string;
    to_account: string;
    withdrawn: string;
    deposited: string;
}
interface EffectiveCommentVote extends BaseTransaction {
    type: "effective_comment_vote";
    voter: string;
    author: string;
    permlink: string;
    pending_payout: string;
    total_vote_weight: number;
    rshares: number;
    weight: number;
}
interface VoteProxy extends BaseTransaction {
    type: "account_witness_proxy";
    account: string;
    proxy: string;
}
type Transaction = CurationReward | AuthorReward | CommentBenefactor | ClaimRewardBalance | Transfer | TransferToVesting | TransferToSavings | TransferFromSavings | FillTransferFromSavings | CancelTransferFromSavings | WithdrawVesting | SetWithdrawRoute | FillOrder | ProducerReward | Interest | FillConvertRequest | FillCollateralizedConvertRequest | ReturnVestingDelegation | ProposalPay | UpdateProposalVotes | CommentPayoutUpdate | CommentReward | CollateralizedConvert | RecurrentTransfers | FillRecurrentTransfers | LimitOrderCreate | LimitOrderCancel | FillVestingWithdraw | EffectiveCommentVote | VoteProxy | DelegateVestingShares;
type OperationGroup = "transfers" | "market-orders" | "interests" | "stake-operations" | "rewards";

interface DelegatedVestingShare {
    id: number;
    delegatee: string;
    delegator: string;
    min_delegation_time: string;
    vesting_shares: string;
}

interface WithdrawRoute {
    auto_vest: boolean;
    from_account: string;
    id: number;
    percent: number;
    to_account: string;
}

/**
 * One incoming HP delegation, as the received-delegation queries return it.
 *
 * `vesting_shares` is the legacy "n.nnnnnn VESTS" string. `timestamp` is
 * optional: the balance-api rows these are built from carry a block number
 * but no time, so it is absent there; only rows from the old Ecency endpoint
 * ever had it.
 */
interface ReceivedVestingShare {
    delegatee: string;
    delegator: string;
    timestamp?: string;
    vesting_shares: string;
}

declare enum AssetOperation {
    Transfer = "transfer",
    TransferToSavings = "transfer-saving",
    WithdrawFromSavings = "withdraw-saving",
    Delegate = "delegate",
    PowerUp = "power-up",
    PowerDown = "power-down",
    WithdrawRoutes = "withdraw-routes",
    ClaimInterest = "claim-interest",
    Swap = "swap",
    Convert = "convert",
    Gift = "gift",
    Promote = "promote",
    Claim = "claim",
    Buy = "buy",
    Stake = "stake",
    Unstake = "unstake",
    Undelegate = "undelegate"
}

interface GeneralAssetInfo {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr?: string;
    layer?: string;
    pendingRewards?: number;
    parts?: {
        name: string;
        balance: number;
    }[];
}

interface GeneralAssetTransaction {
    id: number | string;
    type: OperationName | number | string;
    created: Date;
    results: {
        amount: string | number;
        asset: string;
    }[];
    from?: string;
    to?: string;
    memo?: string;
}

type HiveBasedAssetSignType = "key" | "keychain" | "hivesigner" | "hiveauth";

type HiveTransaction = Transaction;

type HiveOperationGroup = "" | "transfers" | "market-orders" | "interests" | "stake-operations" | "rewards";

/**
 * All operation names (including virtual operations) extracted from hive-tx utils.
 * In hive-tx, utils.operations includes both real and virtual operations,
 * so there is no separate VirtualOperationName type.
 */
type HiveOperationName = keyof typeof operations;
type HiveOperationFilterValue = HiveOperationGroup | HiveOperationName;
type HiveOperationFilter = HiveOperationFilterValue | HiveOperationFilterValue[];
type HiveOperationFilterKey = string;

interface HiveMarketMetric {
    hive: {
        high: number;
        low: number;
        open: number;
        close: number;
        volume: number;
    };
    id: number;
    non_hive: {
        high: number;
        low: number;
        open: number;
        close: number;
        volume: number;
    };
    open: string;
    seconds: number;
}

declare function getHiveAssetGeneralInfoQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    parts?: undefined;
} | {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    parts: {
        name: string;
        balance: number;
    }[];
}, Error, {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    parts?: undefined;
} | {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    parts: {
        name: string;
        balance: number;
    }[];
}, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        name: string;
        title: string;
        price: number;
        accountBalance: number;
        parts?: undefined;
    } | {
        name: string;
        title: string;
        price: number;
        accountBalance: number;
        parts: {
            name: string;
            balance: number;
        }[];
    }, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: {
            name: string;
            title: string;
            price: number;
            accountBalance: number;
            parts?: undefined;
        } | {
            name: string;
            title: string;
            price: number;
            accountBalance: number;
            parts: {
                name: string;
                balance: number;
            }[];
        };
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHbdAssetGeneralInfoQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr?: undefined;
    parts?: undefined;
} | {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr: string;
    parts: {
        name: string;
        balance: number;
    }[];
}, Error, {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr?: undefined;
    parts?: undefined;
} | {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr: string;
    parts: {
        name: string;
        balance: number;
    }[];
}, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        name: string;
        title: string;
        price: number;
        accountBalance: number;
        apr?: undefined;
        parts?: undefined;
    } | {
        name: string;
        title: string;
        price: number;
        accountBalance: number;
        apr: string;
        parts: {
            name: string;
            balance: number;
        }[];
    }, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: {
            name: string;
            title: string;
            price: number;
            accountBalance: number;
            apr?: undefined;
            parts?: undefined;
        } | {
            name: string;
            title: string;
            price: number;
            accountBalance: number;
            apr: string;
            parts: {
                name: string;
                balance: number;
            }[];
        };
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHivePowerAssetGeneralInfoQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr?: undefined;
    parts?: undefined;
} | {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr: string;
    parts: {
        name: string;
        balance: number;
    }[];
}, Error, {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr?: undefined;
    parts?: undefined;
} | {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    apr: string;
    parts: {
        name: string;
        balance: number;
    }[];
}, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        name: string;
        title: string;
        price: number;
        accountBalance: number;
        apr?: undefined;
        parts?: undefined;
    } | {
        name: string;
        title: string;
        price: number;
        accountBalance: number;
        apr: string;
        parts: {
            name: string;
            balance: number;
        }[];
    }, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: {
            name: string;
            title: string;
            price: number;
            accountBalance: number;
            apr?: undefined;
            parts?: undefined;
        } | {
            name: string;
            title: string;
            price: number;
            accountBalance: number;
            apr: string;
            parts: {
                name: string;
                balance: number;
            }[];
        };
        [dataTagErrorSymbol]: Error;
    };
};

declare function resolveHiveOperationFilters(filters: HiveOperationFilter): {
    filterKey: HiveOperationFilterKey;
    filterArgs: any[];
};
/**
 * The filter values the caller passed, minus the "all" sentinel. Group aliases are
 * kept as-is: they never equal an operation name, so they simply never match.
 *
 * Used by the per-asset `select` filters so an operation a caller deliberately
 * requested is never silently dropped just because the asset filter has no opinion
 * about it. Passing no filter at all keeps the historical behaviour: the asset's own
 * allow-list decides, and nothing extra leaks in.
 */
declare function collectRequestedOperations(filters: HiveOperationFilter): Set<string>;
/**
 * Cursor for `condenser_api.get_account_history`.
 *
 * A page comes back in ASCENDING `num` order, so the OLDEST entry is at index 0 and
 * walking backwards means `page[0].num - 1`. Reading the LAST entry instead takes the
 * NEWEST row, which advances the window by a single operation per page (a page of 1000
 * overlaps its predecessor by 999) and, once `num` reaches 0, yields -1 — the "newest"
 * sentinel `initialPageParam` uses — so the walk restarts at the head of the history and
 * never terminates.
 */
declare function getNextAccountHistoryPageParam(lastPage: HiveTransaction[] | undefined): number | undefined;
/**
 * The `limit` to request for a given cursor.
 *
 * `condenser_api.get_account_history` asserts `start >= limit - 1`, because `start` is a
 * 0-based index into the account's operation list and the node walks `limit` entries back
 * from it. The cursor above is derived from `num` alone, so the last window before the
 * start of history is necessarily shorter than `limit`, and asking for the full `limit`
 * there fails the assert instead of returning the remaining rows.
 *
 * Narrowing the window to `pageParam + 1` asks for exactly what is left. The `-1`
 * sentinel ("give me the newest") is not an index and passes through untouched.
 */
declare function resolveAccountHistoryLimit(pageParam: number, limit: number): number;
declare function getHiveAssetTransactionsQueryOptions(username: string | undefined, limit?: number, filters?: HiveOperationFilter): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<Transaction[], Error, _tanstack_react_query.InfiniteData<Transaction[], unknown>, readonly unknown[], unknown>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Transaction[], readonly unknown[], unknown> | undefined;
} & {
    queryKey: readonly unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<Transaction[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHbdAssetTransactionsQueryOptions(username: string | undefined, limit?: number, filters?: HiveOperationFilter): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<Transaction[], Error, _tanstack_react_query.InfiniteData<Transaction[], unknown>, readonly unknown[], unknown>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Transaction[], readonly unknown[], unknown> | undefined;
} & {
    queryKey: readonly unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<Transaction[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHivePowerAssetTransactionsQueryOptions(username: string | undefined, limit?: number, filters?: HiveOperationFilter): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<Transaction[], Error, _tanstack_react_query.InfiniteData<Transaction[], unknown>, readonly unknown[], unknown>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Transaction[], readonly unknown[], unknown> | undefined;
} & {
    queryKey: readonly unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<Transaction[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHiveAssetMetricQueryOptions(bucketSeconds?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<{
    close: number;
    open: number;
    low: number;
    high: number;
    volume: number;
    time: Date;
}[], Error, _tanstack_react_query.InfiniteData<{
    close: number;
    open: number;
    low: number;
    high: number;
    volume: number;
    time: Date;
}[], unknown>, (string | number)[], Date[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        close: number;
        open: number;
        low: number;
        high: number;
        volume: number;
        time: Date;
    }[], (string | number)[], Date[]> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<{
            close: number;
            open: number;
            low: number;
            high: number;
            volume: number;
            time: Date;
        }[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHiveAssetWithdrawalRoutesQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<WithdrawRoute[], Error, WithdrawRoute[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WithdrawRoute[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: WithdrawRoute[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHivePowerDelegatesInfiniteQueryOptions(username: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<DelegatedVestingShare[], Error, DelegatedVestingShare[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<DelegatedVestingShare[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: DelegatedVestingShare[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * The same list as {@link getReceivedVestingSharesQueryOptions} under the key
 * the wallet's HP asset views use. Both read the HAF balance-api through the
 * shared account-delegations query, so neither depends on the Ecency
 * notification database.
 */
declare function getHivePowerDelegatingsQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<ReceivedVestingShare[], Error, ReceivedVestingShare[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ReceivedVestingShare[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: ReceivedVestingShare[];
        [dataTagErrorSymbol]: Error;
    };
};

interface Options$1 {
    refetch?: boolean;
    currency?: string;
}
declare function getAccountWalletAssetInfoQueryOptions(username: string, asset: string, options?: Options$1): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<GeneralAssetInfo | undefined, Error, GeneralAssetInfo | undefined, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<GeneralAssetInfo | undefined, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: GeneralAssetInfo | undefined;
        [dataTagErrorSymbol]: Error;
    };
};

interface WalletOperationPayload {
    from: string;
    to?: string;
    amount?: string;
    memo?: string;
    request_id?: number;
    from_account?: string;
    to_account?: string;
    percent?: number;
    auto_vest?: boolean;
    mode?: string;
    [key: string]: unknown;
}
/**
 * Meta-mutation hook that dispatches wallet operations based on asset and operation type.
 *
 * Supports HIVE, HBD, HP, POINTS, and Hive Engine tokens.
 * Uses `useBroadcastMutation` for unified auth handling via `AuthContextV2`.
 *
 * @param username - The Hive account performing the operation
 * @param asset - The asset symbol (e.g., "HIVE", "HBD", "HP", "POINTS", or engine token)
 * @param operation - The operation type from AssetOperation enum
 * @param auth - Auth context for broadcasting
 */
declare function useWalletOperation(username: string | undefined, asset: string, operation: AssetOperation, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, WalletOperationPayload, unknown>;

declare const HIVE_ACCOUNT_OPERATION_GROUPS: Record<HiveOperationGroup, number[]>;

declare const HIVE_OPERATION_LIST: HiveOperationName[];

declare const HIVE_OPERATION_ORDERS: Record<"vote" | "comment" | "transfer" | "transfer_to_vesting" | "withdraw_vesting" | "account_create" | "account_create_with_delegation" | "account_update" | "account_update2" | "account_witness_vote" | "account_witness_proxy" | "convert" | "collateralized_convert" | "custom" | "custom_json" | "claim_account" | "create_claimed_account" | "claim_reward_balance" | "delegate_vesting_shares" | "delete_comment" | "comment_options" | "set_withdraw_vesting_route" | "witness_update" | "witness_set_properties" | "decline_voting_rights" | "reset_account" | "set_reset_account" | "transfer_to_savings" | "transfer_from_savings" | "cancel_transfer_from_savings" | "limit_order_create" | "limit_order_create2" | "limit_order_cancel" | "feed_publish" | "escrow_transfer" | "escrow_dispute" | "escrow_release" | "escrow_approve" | "recover_account" | "request_account_recovery" | "change_recovery_account" | "recurrent_transfer" | "create_proposal" | "update_proposal" | "update_proposal_votes" | "remove_proposal" | "curation_reward" | "author_reward" | "comment_benefactor_reward" | "fill_transfer_from_savings" | "fill_order" | "producer_reward" | "interest" | "fill_convert_request" | "fill_collateralized_convert_request" | "return_vesting_delegation" | "proposal_pay" | "comment_payout_update" | "comment_reward" | "fill_recurrent_transfer" | "fill_vesting_withdraw" | "effective_comment_vote" | "pow" | "report_over_production" | "pow2" | "custom_binary" | "liquidity_reward" | "shutdown_witness" | "hardfork" | "clear_null_account_balance" | "sps_fund" | "hardfork_hive" | "hardfork_hive_restore" | "delayed_voting" | "consolidate_treasury_balance" | "ineffective_delete_comment" | "sps_convert" | "expired_account_notification" | "changed_recovery_account" | "transfer_to_vesting_completed" | "pow_reward" | "vesting_shares_split" | "account_created" | "system_warning" | "failed_recurrent_transfer" | "limit_order_cancelled" | "producer_missed" | "proposal_fee" | "collateralized_convert_immediate_conversion" | "escrow_approved" | "escrow_rejected" | "proxy_cleared" | "declined_voting_rights", number>;
declare const HIVE_OPERATION_NAME_BY_ID: Record<number, HiveOperationName>;

declare enum PointTransactionType {
    CHECKIN = 10,
    LOGIN = 20,
    CHECKIN_EXTRA = 30,
    POST = 100,
    COMMENT = 110,
    VOTE = 120,
    REBLOG = 130,
    DELEGATION = 150,
    REFERRAL = 160,
    COMMUNITY = 170,
    TRANSFER_SENT = 998,
    TRANSFER_INCOMING = 999,
    MINTED = 991,
    /**
     * Points burned out of supply rather than moved to the treasury. Written by the
     * AI surfaces (assist, image, transcribe), which pay a real per-request vendor
     * bill, so the Points are consumed rather than parked.
     *
     * The row carries no counterparty at all, which is what distinguishes it from
     * TRANSFER_SENT: `sender` and `receiver` are both null. A refund of a burn comes
     * back as this same type with a positive amount, so read the sign rather than
     * assuming a burn is always a debit.
     */
    BURNED = 997
}

interface PointTransaction {
    id: number;
    type: PointTransactionType;
    created: string;
    memo: string | null;
    amount: string;
    sender: string | null;
    receiver: string | null;
}
interface Points {
    points: string;
    uPoints: string;
    transactions: PointTransaction[];
}

interface PointsResponse {
    points: string;
    unclaimed_points: string;
}

declare function getPointsQueryOptions(username?: string, filter?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    readonly points: string;
    readonly uPoints: string;
    readonly transactions: PointTransaction[];
}, Error, {
    readonly points: string;
    readonly uPoints: string;
    readonly transactions: PointTransaction[];
}, (string | number | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        readonly points: string;
        readonly uPoints: string;
        readonly transactions: PointTransaction[];
    }, (string | number | undefined)[], never> | undefined;
} & {
    queryKey: (string | number | undefined)[] & {
        [dataTagSymbol]: {
            readonly points: string;
            readonly uPoints: string;
            readonly transactions: PointTransaction[];
        };
        [dataTagErrorSymbol]: Error;
    };
};

declare function getPointsAssetGeneralInfoQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    name: string;
    title: string;
    price: number;
    accountBalance: number;
}, Error, {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
}, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        name: string;
        title: string;
        price: number;
        accountBalance: number;
    }, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: {
            name: string;
            title: string;
            price: number;
            accountBalance: number;
        };
        [dataTagErrorSymbol]: Error;
    };
};

declare function getPointsAssetTransactionsQueryOptions(username: string | undefined, type?: PointTransactionType): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    created: Date;
    type: PointTransactionType;
    results: {
        amount: number;
        asset: string;
    }[];
    id: number;
    from: string | undefined;
    to: string | undefined;
    memo: string | undefined;
}[], Error, {
    created: Date;
    type: PointTransactionType;
    results: {
        amount: number;
        asset: string;
    }[];
    id: number;
    from: string | undefined;
    to: string | undefined;
    memo: string | undefined;
}[], (string | PointTransactionType | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        created: Date;
        type: PointTransactionType;
        results: {
            amount: number;
            asset: string;
        }[];
        id: number;
        from: string | undefined;
        to: string | undefined;
        memo: string | undefined;
    }[], (string | PointTransactionType | undefined)[], never> | undefined;
} & {
    queryKey: (string | PointTransactionType | undefined)[] & {
        [dataTagSymbol]: {
            created: Date;
            type: PointTransactionType;
            results: {
                amount: number;
                asset: string;
            }[];
            id: number;
            from: string | undefined;
            to: string | undefined;
            memo: string | undefined;
        }[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * POST a points claim and return the parsed JSON body.
 *
 * The endpoint normally answers with JSON, but an edge/proxy layer can
 * occasionally return a 2xx whose body is an HTML interstitial or plain text
 * (ECENCY-NEXT-1FCJ). Calling `response.json()` on that throws a bare
 * `SyntaxError` that names neither the endpoint nor the cause. Instead we check
 * the content type first and fail with a STABLE, low-cardinality message
 * (content type + status) — never the raw body — so these group as a single
 * Sentry issue instead of fragmenting on every distinct HTML page.
 */
declare function claimPointsRequest(username: string | undefined, accessToken: string | undefined): Promise<any>;
declare function useClaimPoints(username: string | undefined, accessToken: string | undefined, onSuccess?: () => void, onError?: Parameters<typeof useMutation>["0"]["onError"]): _tanstack_react_query.UseMutationResult<any, unknown, unknown, unknown>;

interface HiveEngineMarketResponse {
    _id: number;
    symbol: string;
    volume: string;
    volumeExpiration: number;
    lastPrice: string;
    lowestAsk: string;
    highestBid: string;
    lastDayPrice: string;
    lastDayPriceExpiration: number;
    priceChangeHive: string;
    priceChangePercent: string;
}

interface HiveEngineTokenMetadataResponse {
    issuer: string;
    symbol: string;
    name: string;
    metadata: string;
    precision: number;
    maxSupply: string;
    supply: string;
    circulatingSupply: string;
    stakingEnabled: boolean;
    unstakingCooldown: number;
    delegationEnabled: boolean;
    undelegationCooldown: number;
    numberTransactions: number;
    totalStaked: string;
}

interface HiveEngineTokenBalance {
    account: string;
    balance: string;
    delegationsIn: string;
    delegationsOut: string;
    pendingUndelegations: string;
    pendingUnstake: string;
    stake: string;
    symbol: string;
}

interface HiveEngineTransaction {
    _id: string;
    blockNumber: number;
    transactionId: string;
    timestamp: number;
    operation: string;
    from: string;
    to: string;
    symbol: string;
    quantity: string;
    memo: any;
    account: string;
    authorperm?: string;
}

interface HiveEngineMetric {
    baseVolume: string;
    close: string;
    high: string;
    low: string;
    open: string;
    quoteVolume: string;
    timestamp: number;
}

interface HiveEngineTokenStatus {
    symbol: string;
    pending_token: number;
    precision: number;
}

interface HiveEngineTokenInfo {
    highestBid: string;
    lastDayPrice: string;
    lastDayPriceExpiration: number;
    lastPrice: string;
    lowestAsk: string;
    priceChangeHive: string;
    priceChangePercent: string;
    symbol: string;
    volume: string;
    volumeExpiration: number;
}

interface HiveEngineOrderBookEntry {
    _id: number;
    txId: string;
    timestamp: number;
    account: string;
    symbol: string;
    quantity: string;
    price: string;
    expiration: number;
    tokensLocked?: string;
}

interface HiveEngineOpenOrder {
    id: string;
    type: "buy" | "sell";
    account: string;
    symbol: string;
    quantity: string;
    price: string;
    total: string;
    timestamp: number;
}

interface Token {
    issuer: string;
    symbol: string;
    name: string;
    metadata: string;
    precision: number;
    maxSupply: string;
    supply: string;
    circulatingSupply: string;
    stakingEnabled: boolean;
    unstakingCooldown: number;
    delegationEnabled: boolean;
    undelegationCooldown: number;
    numberTransactions: number;
    totalStaked: string;
}

interface TokenMetadata {
    desc: string;
    url: string;
    icon: string;
}

interface Options {
    fractionDigits?: number;
    prefix?: string;
    suffix?: string;
}
declare function formattedNumber(value: number | string, options?: Options | undefined): string;

interface HiveEngineTokenProps {
    symbol: string;
    name: string;
    icon: string;
    precision: number;
    stakingEnabled: boolean;
    delegationEnabled: boolean;
    balance: string;
    stake: string;
    delegationsIn: string;
    delegationsOut: string;
    usdValue: number;
}
declare class HiveEngineToken {
    symbol: string;
    name?: string;
    icon?: string;
    precision?: number;
    stakingEnabled?: boolean;
    delegationEnabled?: boolean;
    balance: number;
    stake: number;
    stakedBalance: number;
    delegationsIn: number;
    delegationsOut: number;
    usdValue: number;
    constructor(props: HiveEngineTokenProps);
    hasDelegations: () => boolean;
    delegations: () => string;
    staked: () => string;
    balanced: () => string;
}

declare function getHiveEngineTokensBalancesQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<HiveEngineTokenBalance[], Error, HiveEngineTokenBalance[], readonly ["assets", "hive-engine", "balances", string]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveEngineTokenBalance[], readonly ["assets", "hive-engine", "balances", string], never> | undefined;
} & {
    queryKey: readonly ["assets", "hive-engine", "balances", string] & {
        [dataTagSymbol]: HiveEngineTokenBalance[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHiveEngineTokensMarketQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<HiveEngineMarketResponse[], Error, HiveEngineMarketResponse[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveEngineMarketResponse[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: HiveEngineMarketResponse[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHiveEngineTokensMetadataQueryOptions(tokens: string[]): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<HiveEngineTokenMetadataResponse[], Error, HiveEngineTokenMetadataResponse[], readonly ["assets", "hive-engine", "metadata-list", string[]]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveEngineTokenMetadataResponse[], readonly ["assets", "hive-engine", "metadata-list", string[]], never> | undefined;
} & {
    queryKey: readonly ["assets", "hive-engine", "metadata-list", string[]] & {
        [dataTagSymbol]: HiveEngineTokenMetadataResponse[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHiveEngineTokenTransactionsQueryOptions(username: string | undefined, symbol: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<HiveEngineTransaction[], Error, _tanstack_react_query.InfiniteData<HiveEngineTransaction[], unknown>, readonly unknown[], unknown>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveEngineTransaction[], readonly unknown[], unknown> | undefined;
} & {
    queryKey: readonly unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<HiveEngineTransaction[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHiveEngineTokensMetricsQueryOptions(symbol: string, interval?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<HiveEngineMetric[], Error, HiveEngineMetric[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveEngineMetric[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: HiveEngineMetric[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHiveEngineUnclaimedRewardsQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<HiveEngineTokenStatus[], Error, HiveEngineTokenStatus[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveEngineTokenStatus[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: HiveEngineTokenStatus[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAllHiveEngineTokensQueryOptions(account?: string, symbol?: string | string[]): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<HiveEngineTokenInfo[], Error, HiveEngineTokenInfo[], readonly ["assets", "hive-engine", "all-tokens", string | undefined, string | string[] | undefined]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveEngineTokenInfo[], readonly ["assets", "hive-engine", "all-tokens", string | undefined, string | string[] | undefined], never> | undefined;
} & {
    queryKey: readonly ["assets", "hive-engine", "all-tokens", string | undefined, string | string[] | undefined] & {
        [dataTagSymbol]: HiveEngineTokenInfo[];
        [dataTagErrorSymbol]: Error;
    };
};

interface DynamicProps {
    base: number;
    quote: number;
}
declare function getHiveEngineBalancesWithUsdQueryOptions(account: string, dynamicProps?: DynamicProps, allTokens?: HiveEngineTokenInfo[]): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<HiveEngineToken[], Error, HiveEngineToken[], readonly ["assets", "hive-engine", "balances-with-usd", string, DynamicProps | undefined, HiveEngineTokenInfo[] | undefined]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveEngineToken[], readonly ["assets", "hive-engine", "balances-with-usd", string, DynamicProps | undefined, HiveEngineTokenInfo[] | undefined], never> | undefined;
} & {
    queryKey: readonly ["assets", "hive-engine", "balances-with-usd", string, DynamicProps | undefined, HiveEngineTokenInfo[] | undefined] & {
        [dataTagSymbol]: HiveEngineToken[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHiveEngineTokenGeneralInfoQueryOptions(username?: string, symbol?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    layer: string;
    parts: {
        name: string;
        balance: number;
    }[];
}, Error, {
    name: string;
    title: string;
    price: number;
    accountBalance: number;
    layer: string;
    parts: {
        name: string;
        balance: number;
    }[];
}, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        name: string;
        title: string;
        price: number;
        accountBalance: number;
        layer: string;
        parts: {
            name: string;
            balance: number;
        }[];
    }, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: {
            name: string;
            title: string;
            price: number;
            accountBalance: number;
            layer: string;
            parts: {
                name: string;
                balance: number;
            }[];
        };
        [dataTagErrorSymbol]: Error;
    };
};

export { type ProducerReward as $, type AccountProfile as A, type HiveEngineTokenBalance as B, type CancelTransferFromSavings as C, type DelegateVestingShares as D, type EffectiveCommentVote as E, type FillCollateralizedConvertRequest as F, type GeneralAssetInfo as G, type HiveEngineTokenMetadataResponse as H, type HiveEngineTokenInfo as I, type HiveEngineTokenStatus as J, type HiveEngineTransaction as K, type HiveMarketMetric as L, type HiveOperationFilter as M, type HiveOperationFilterKey as N, type HiveOperationFilterValue as O, type HiveOperationGroup as P, type HiveOperationName as Q, type HiveTransaction as R, type Interest as S, type LimitOrderCancel as T, type LimitOrderCreate as U, NaiMap as V, type WithdrawRoute as W, type PointTransaction as X, PointTransactionType as Y, type Points as Z, type PointsResponse as _, type AuthContext as a, broadcastOperationsWithKeys as a$, type ProposalPay as a0, type ReceivedVestingShare as a1, type RecurrentTransfers as a2, type ReturnVestingDelegation as a3, type SetWithdrawRoute as a4, Symbol as a5, type Token as a6, type TokenMetadata as a7, type Transfer as a8, type TransferToSavings as a9, getPointsAssetGeneralInfoQueryOptions as aA, getPointsAssetTransactionsQueryOptions as aB, getPointsQueryOptions as aC, isEmptyDate as aD, parseAsset as aE, resolveHiveOperationFilters as aF, useClaimPoints as aG, useWalletOperation as aH, vestsToHp as aI, type AuthContextV2 as aJ, type PlatformAdapter as aK, type BroadcastMode as aL, type TransactionConfirmation as aM, type OperationGroup as aN, type Transaction as aO, type RCAccount as aP, type AuthMethod as aQ, type AuthorityLevel as aR, type AuthorityType as aS, type FillTransferFromSavings as aT, OPERATION_AUTHORITY_MAP as aU, type SMTAsset as aV, type TransferFromSavings as aW, type User as aX, assertOperationsFitTransaction as aY, broadcastOperations as aZ, broadcastOperationsAsync as a_, type TransferToVesting as aa, type UpdateProposalVotes as ab, type VoteProxy as ac, type WalletOperationPayload as ad, type WithdrawVesting as ae, formattedNumber as af, getAccountWalletAssetInfoQueryOptions as ag, getAllHiveEngineTokensQueryOptions as ah, getHbdAssetGeneralInfoQueryOptions as ai, getHbdAssetTransactionsQueryOptions as aj, getHiveAssetGeneralInfoQueryOptions as ak, getHiveAssetMetricQueryOptions as al, getHiveAssetTransactionsQueryOptions as am, getHiveAssetWithdrawalRoutesQueryOptions as an, getHiveEngineBalancesWithUsdQueryOptions as ao, getHiveEngineTokenGeneralInfoQueryOptions as ap, getHiveEngineTokenTransactionsQueryOptions as aq, getHiveEngineTokensBalancesQueryOptions as ar, getHiveEngineTokensMarketQueryOptions as as, getHiveEngineTokensMetadataQueryOptions as at, getHiveEngineTokensMetricsQueryOptions as au, getHiveEngineUnclaimedRewardsQueryOptions as av, getHivePowerAssetGeneralInfoQueryOptions as aw, getHivePowerAssetTransactionsQueryOptions as ax, getHivePowerDelegatesInfiniteQueryOptions as ay, getHivePowerDelegatingsQueryOptions as az, AssetOperation as b, broadcastWithMethod as b0, calculateRCMana as b1, calculateVPMana as b2, claimPointsRequest as b3, collectRequestedOperations as b4, getCustomJsonAuthority as b5, getNextAccountHistoryPageParam as b6, getOperationAuthority as b7, getProposalAuthority as b8, getRequiredAuthority as b9, isWif as ba, resolveAccountHistoryLimit as bb, sha256 as bc, useBroadcastMutation as bd, type Asset as c, type AuthorReward as d, type ClaimRewardBalance as e, type CollateralizedConvert as f, type CommentBenefactor as g, type CommentPayoutUpdate as h, type CommentReward as i, type CurationReward as j, type DelegatedVestingShare as k, type FillConvertRequest as l, type FillOrder as m, type FillRecurrentTransfers as n, type FillVestingWithdraw as o, type GeneralAssetTransaction as p, HIVE_ACCOUNT_OPERATION_GROUPS as q, HIVE_OPERATION_LIST as r, HIVE_OPERATION_NAME_BY_ID as s, HIVE_OPERATION_ORDERS as t, type HiveBasedAssetSignType as u, type HiveEngineMarketResponse as v, type HiveEngineMetric as w, type HiveEngineOpenOrder as x, type HiveEngineOrderBookEntry as y, HiveEngineToken as z };
