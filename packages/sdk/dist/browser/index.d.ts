import * as _tanstack_react_query from '@tanstack/react-query';
import { MutationKey, UseMutationOptions, QueryClient, QueryKey, InfiniteData, UseQueryOptions, UseInfiniteQueryOptions, useMutation } from '@tanstack/react-query';
import { O as Operation, P as PrivateKey, B as BroadcastResult, A as APIMethods, R as ResilienceOptions, a as Authority, b as PublicKey, c as OperationName, o as operations } from './hive-DmLj3VWL.js';
export { d as AccountCreateOperation, e as AssetSymbol, C as CustomJsonOperation, T as HiveTxTransaction, M as Memo, f as OperationBody, S as Signature, g as callREST, h as callRPC, i as callRPCBroadcast, j as callWithQuorum, k as hiveTxConfig, u as hiveTxUtils } from './hive-DmLj3VWL.js';

interface AiGenerationPrice {
    aspect_ratio: string;
    cost: number;
}
interface AiImagePowerTier {
    power: number;
    multiplier: number;
}
interface AiImagePriceResponse {
    prices: AiGenerationPrice[];
    power: AiImagePowerTier[];
}
interface AiGenerationRequest {
    prompt: string;
    aspect_ratio?: string;
    power?: number;
    idempotency_key?: string;
}
interface AiGenerationResponse {
    url: string;
    prompt: string;
    aspect_ratio: string;
    power: number;
    cost: number;
    generation_id: string;
    idempotent_replay?: boolean;
}
interface AiAssistPrice {
    action: string;
    cost: number;
    free_limit: number;
    free_remaining?: number;
}
interface AiAssistResponse {
    action: string;
    output: string;
    cost: number;
    is_free: boolean;
    request_id: string;
    idempotent_replay?: boolean;
}

declare function getAiGeneratePriceQueryOptions(accessToken: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AiImagePriceResponse, Error, AiImagePriceResponse, readonly ["ai", "prices"]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AiImagePriceResponse, readonly ["ai", "prices"], never> | undefined;
} & {
    queryKey: readonly ["ai", "prices"] & {
        [dataTagSymbol]: AiImagePriceResponse;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAiAssistPriceQueryOptions(username: string | undefined, accessToken: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AiAssistPrice[], Error, AiAssistPrice[], readonly ["ai", "assist-prices", string | undefined]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AiAssistPrice[], readonly ["ai", "assist-prices", string | undefined], never> | undefined;
} & {
    queryKey: readonly ["ai", "assist-prices", string | undefined] & {
        [dataTagSymbol]: AiAssistPrice[];
        [dataTagErrorSymbol]: Error;
    };
};

interface GenerateImageParams {
    prompt: string;
    aspect_ratio?: string;
    power?: number;
    idempotency_key?: string;
}
declare function useGenerateImage(username: string | undefined, accessToken: string | undefined): _tanstack_react_query.UseMutationResult<AiGenerationResponse, Error, GenerateImageParams, unknown>;

interface AiAssistParams {
    action: string;
    text: string;
    code?: string;
}
declare function useAiAssist(username: string | undefined, accessToken: string | undefined): _tanstack_react_query.UseMutationResult<AiAssistResponse, Error, AiAssistParams, unknown>;

interface DynamicProps$1 {
    hivePerMVests: number;
    base: number;
    quote: number;
    fundRewardBalance: number;
    fundRecentClaims: number;
    votePowerReserveRate: number;
    authorRewardCurve: string;
    contentConstant: number;
    currentHardforkVersion: string;
    lastHardfork: number;
    hbdPrintRate: number;
    hbdInterestRate: number;
    headBlock: number;
    totalVestingFund: number;
    totalVestingShares: number;
    virtualSupply: number;
    vestingRewardPercent: number;
    accountCreationFee: string;
    raw?: {
        globalDynamic: Record<string, any>;
        feedHistory: Record<string, any>;
        chainProps: Record<string, any>;
        rewardFund: Record<string, any>;
        hardforkProps: Record<string, any>;
    };
}

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
     * Custom broadcast function for platform-specific signing.
     * @deprecated Use platform adapter's broadcastWithKeychain/broadcastWithHiveAuth instead.
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
 * Generic pagination metadata for wrapped API responses
 */
interface PaginationMeta {
    total: number;
    limit: number;
    offset: number;
    has_next: boolean;
}
/**
 * Generic wrapped response with pagination metadata
 */
interface WrappedResponse<T> {
    data: T[];
    pagination: PaginationMeta;
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

declare function broadcastJson<T>(username: string | undefined, id: string, payload: T, auth?: AuthContext): Promise<any>;

/**
 * Delay (ms) before invalidating chain-derived queries after an async
 * broadcast. ~1.3 Hive blocks (3s/block) so the just-broadcast transaction has
 * landed in a block before we refetch — otherwise the refetch returns pre-tx
 * state (e.g. a stale wallet balance).
 */
declare const BROADCAST_INCLUSION_DELAY_MS = 4000;
/**
 * Invalidate queries after a broadcast, accounting for broadcast mode.
 *
 * - `'sync'`: the transaction already waited for block inclusion, so refetch
 *   immediately (returns the adapter's promise so callers may await it).
 * - `'async'` (default) / undefined: the transaction is only in the mempool, so
 *   a refetch now would read pre-tx state — defer by ~1 block.
 *
 * No-ops when the adapter can't invalidate.
 */
declare function invalidateAfterBroadcast(adapter: PlatformAdapter | null | undefined, broadcastMode: BroadcastMode | undefined, keys: any[][]): void | Promise<void>;

declare function withTimeoutSignal(timeoutMs: number, signal?: AbortSignal): AbortSignal;

/** Timeout for internal API calls (search, private API). */
declare const INTERNAL_API_TIMEOUT_MS = 10000;
declare const CONFIG: {
    privateApiHost: string;
    /**
     * First-party client identifier sent as the `X-Ecency-Client` header on
     * search/private API requests. Lets the origin distinguish Ecency's own
     * web/mobile/SSR traffic from third-party integrators (who should use the
     * keyed api.hivesearcher.com backend instead of the public proxy). This is
     * a routing marker, not a secret. Apps may override via
     * `ConfigManager.setClientId` (e.g. "web" or "mobile") for observability.
     */
    clientId: string;
    imageHost: string;
    /** Current Hive RPC nodes. Reads from the unified hive-tx config. */
    readonly hiveNodes: string[];
    heliusApiKey: string | undefined;
    /**
     * The React Query client all SDK code reads through `getQueryClient()`.
     * Backed by a resolver so an SSR host can scope it per request — see the
     * `queryClientResolver` note above. Assigning replaces the resolver with one
     * that always returns the assigned client, preserving the previous
     * "one client, set once" behaviour for browser and native hosts.
     */
    queryClient: QueryClient;
    pollsApiHost: string;
    plausibleHost: string;
    dmcaAccounts: string[];
    dmcaTags: string[];
    dmcaPatterns: string[];
    dmcaTagRegexes: RegExp[];
    dmcaPatternRegexes: RegExp[];
    _dmcaInitialized: boolean;
};
type DmcaListsInput = {
    accounts?: string[];
    tags?: string[];
    posts?: string[];
};
declare namespace ConfigManager {
    function setQueryClient(client: QueryClient): void;
    /**
     * Register how the SDK should obtain its React Query client, for hosts where
     * a single shared instance is wrong — principally SSR, where one process
     * serves many requests and a shared cache both leaks memory and risks serving
     * one request's data to another.
     *
     * `resolve` is called on every SDK cache access and should return the client
     * belonging to the request currently being handled. In a Next.js App Router
     * host that means wrapping the factory in React's `cache()`, which memoises
     * per request:
     *
     * ```ts
     * ConfigManager.setQueryClientResolver(() => getQueryClient());
     * ```
     *
     * Registering a resolver supersedes any client previously passed to
     * `setQueryClient`; assigning a client afterwards supersedes the resolver.
     */
    function setQueryClientResolver(resolve: () => QueryClient): void;
    /**
     * Set the private API host
     * @param host - The private API host URL (e.g., "https://ecency.com" or "" for relative URLs)
     */
    function setPrivateApiHost(host: string): void;
    /**
     * Set the first-party client identifier sent as the `X-Ecency-Client` header
     * on search/private API requests (e.g. "web" or "mobile"). Defaults to
     * "ecency-sdk". Used by the origin to tell Ecency's own apps apart from
     * third-party integrators.
     * @param clientId - Short client label
     */
    function setClientId(clientId: string): void;
    /**
     * Get a validated base URL for API requests
     * Returns a valid base URL that can be used with new URL(path, baseUrl)
     *
     * Priority:
     * 1. CONFIG.privateApiHost if set (dev/staging or explicit config)
     * 2. window.location.origin if in browser (production with relative URLs)
     * 3. 'https://ecency.com' as fallback for SSR (production default)
     *
     * @returns A valid base URL string
     * @throws Never throws - always returns a valid URL
     */
    function getValidatedBaseUrl(): string;
    /**
     * Set the polls API host
     * @param host - The polls API host URL (e.g., "https://poll.ecency.com")
     */
    function setPollsApiHost(host: string): void;
    /**
     * Set the image host
     * @param host - The image host URL (e.g., "https://i.ecency.com")
     */
    function setImageHost(host: string): void;
    /**
     * Set Hive RPC nodes, replacing the default list.
     * Delegates to the unified hive-tx `setNodes` (single validated setter,
     * shared with the lean `@ecency/sdk/hive` entry) so node configuration is
     * defined in exactly one place.
     * @param nodes - Array of Hive RPC node URLs
     */
    function setHiveNodes(nodes: string[]): void;
    /**
     * Set the REST-API node list, replacing the default `restNodes`. Lets an app
     * add/remove REST hosts at runtime (e.g. drop an own node being decommissioned,
     * or widen the public pool) without forking + republishing the SDK. Delegates to
     * the unified hive-tx `setRestNodes` (validated, shared with `@ecency/sdk/hive`).
     * @param nodes - Array of REST-capable node URLs (without a trailing slash)
     */
    function setRestNodes(nodes: string[]): void;
    /**
     * Merge per-API REST node overrides. For each API a non-empty valid list pins it
     * to those hosts (so `callREST` never wastes its retry budget on a node that
     * 404/503s the API); an empty list removes the pin (falls back to `restNodes`).
     * Other APIs' pins (e.g. the built-in `hivesense`) are preserved. Delegates to the
     * unified hive-tx `setRestNodesByApi`.
     * @param map - Partial map of REST API name → capable node URLs
     */
    function setRestNodesByApi(map: Partial<Record<APIMethods, string[]>>): void;
    /**
     * Set the User-Agent sent on server-side (Node) requests to Hive nodes.
     * Lets an app label its own SSR/server traffic (otherwise Node's fetch sends a
     * bare `node` UA). No effect in browsers (User-Agent is a forbidden header) or
     * React Native (keeps its native UA). Delegates to the unified hive-tx setter.
     * @param userAgent - The User-Agent string (e.g. "ecency-web-ssr (+https://ecency.com)")
     */
    function setUserAgent(userAgent: string): void;
    /**
     * Tune read-call tail-latency resilience: adaptive per-attempt timeouts
     * (default on) and hedged requests (default OFF — a duplicate request races
     * the next healthy node when the primary stalls, bounded by a token bucket so
     * only the slow tail hedges and pool-wide slowness self-disables it). Partial:
     * only the fields provided are changed; invalid values are ignored
     * field-by-field. Delegates to the unified hive-tx `setResilience`.
     * @param opts - e.g. `{ hedge: true }` to opt into hedged reads
     */
    function setResilience(opts: Partial<ResilienceOptions>): void;
    /**
     * Set DMCA filtering lists
     * @param lists - DMCA lists object containing accounts/tags/posts arrays
     */
    function setDmcaLists(lists?: DmcaListsInput): void;
}

/**
 * Chain error handling utilities
 * Extracted from web's operations.ts and mobile's dhive.ts error handling patterns
 */
declare enum ErrorType {
    COMMON = "common",
    INFO = "info",
    INSUFFICIENT_RESOURCE_CREDITS = "insufficient_resource_credits",
    MISSING_AUTHORITY = "missing_authority",
    TOKEN_EXPIRED = "token_expired",
    NETWORK = "network",
    TIMEOUT = "timeout",
    VALIDATION = "validation"
}
interface ParsedChainError {
    message: string;
    type: ErrorType;
    originalError?: any;
}
/**
 * Parses Hive blockchain errors into standardized format.
 * Extracted from web's operations.ts and mobile's dhive.ts error handling.
 *
 * @param error - The error object or string from a blockchain operation
 * @returns Parsed error with user-friendly message and categorized type
 *
 * @example
 * ```typescript
 * try {
 *   await vote(...);
 * } catch (error) {
 *   const parsed = parseChainError(error);
 *   console.log(parsed.message); // "Insufficient Resource Credits. Please wait or power up."
 *   console.log(parsed.type); // ErrorType.INSUFFICIENT_RESOURCE_CREDITS
 * }
 * ```
 */
declare function parseChainError(error: any): ParsedChainError;
/**
 * Formats error for display to user.
 * Returns tuple of [message, type] for backward compatibility with existing code.
 *
 * This function maintains compatibility with the old formatError signature from
 * web's operations.ts (line 59-84) and mobile's dhive.ts error handling.
 *
 * @param error - The error object or string
 * @returns Tuple of [user-friendly message, error type]
 *
 * @example
 * ```typescript
 * try {
 *   await transfer(...);
 * } catch (error) {
 *   const [message, type] = formatError(error);
 *   showToast(message, type);
 * }
 * ```
 */
declare function formatError(error: any): [string, ErrorType];
/**
 * Checks if error indicates missing authority and should trigger auth fallback.
 * Used by the SDK's useBroadcastMutation to determine if it should retry with
 * an alternate authentication method.
 *
 * @param error - The error object or string
 * @returns true if auth fallback should be attempted
 *
 * @example
 * ```typescript
 * try {
 *   await broadcast(operations);
 * } catch (error) {
 *   if (shouldTriggerAuthFallback(error)) {
 *     // Try with alternate auth method
 *     await broadcastWithHiveAuth(operations);
 *   }
 * }
 * ```
 */
declare function shouldTriggerAuthFallback(error: any): boolean;
/**
 * Checks if error is a resource credits (RC) error.
 * Useful for showing specific UI feedback about RC issues.
 *
 * @param error - The error object or string
 * @returns true if the error is related to insufficient RC
 *
 * @example
 * ```typescript
 * try {
 *   await vote(...);
 * } catch (error) {
 *   if (isResourceCreditsError(error)) {
 *     showRCWarning(); // Show specific RC education/power up UI
 *   }
 * }
 * ```
 */
declare function isResourceCreditsError(error: any): boolean;
/**
 * Checks if error is informational (not critical).
 * Informational errors typically don't need retry logic.
 *
 * @param error - The error object or string
 * @returns true if the error is informational
 */
declare function isInfoError(error: any): boolean;
/**
 * Checks if error is network-related and should be retried.
 *
 * @param error - The error object or string
 * @returns true if the error is network-related
 */
declare function isNetworkError(error: any): boolean;

/**
 * Builds a client with the SDK's defaults. It is only a factory — request
 * scoping is the host's job, via `ConfigManager.setQueryClientResolver`, since
 * only the host knows where one request ends and the next begins.
 */
declare function makeQueryClient(): QueryClient;
declare const getQueryClient: () => QueryClient;
declare namespace EcencyQueriesManager {
    function getQueryData<T>(queryKey: QueryKey): T | undefined;
    function getInfiniteQueryData<T>(queryKey: QueryKey): InfiniteData<T, unknown> | undefined;
    function prefetchQuery<T>(options: UseQueryOptions<T>): Promise<T | undefined>;
    function prefetchInfiniteQuery<T, P>(options: UseInfiniteQueryOptions<T, Error, InfiniteData<T>, QueryKey, P>): Promise<InfiniteData<T, unknown> | undefined>;
    function generateClientServerQuery<T>(options: UseQueryOptions<T>): {
        prefetch: () => Promise<T | undefined>;
        getData: () => T | undefined;
        useClientQuery: () => _tanstack_react_query.UseQueryResult<_tanstack_react_query.NoInfer<T>, Error>;
        fetchAndGet: () => Promise<T>;
    };
    function generateClientServerInfiniteQuery<T, P>(options: UseInfiniteQueryOptions<T, Error, InfiniteData<T>, QueryKey, P>): {
        prefetch: () => Promise<InfiniteData<T, unknown> | undefined>;
        getData: () => InfiniteData<T, unknown> | undefined;
        useClientQuery: () => _tanstack_react_query.UseInfiniteQueryResult<InfiniteData<T, unknown>, Error>;
        fetchAndGet: () => Promise<InfiniteData<T, P>>;
    };
}

declare function getDynamicPropsQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<DynamicProps$1, Error, DynamicProps$1, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<DynamicProps$1, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: DynamicProps$1;
        [dataTagErrorSymbol]: Error;
    };
};

interface RewardFund {
    id: number;
    name: string;
    reward_balance: string;
    recent_claims: string;
    last_update: string;
    content_constant: string;
    percent_curation_rewards: number;
    percent_content_rewards: number;
    author_reward_curve: string;
    curation_reward_curve: string;
}
/**
 * Get reward fund information from the blockchain
 * @param fundName - Name of the reward fund (default: 'post')
 */
declare function getRewardFundQueryOptions(fundName?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<RewardFund, Error, RewardFund, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<RewardFund, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: RewardFund;
        [dataTagErrorSymbol]: Error;
    };
};

declare const QueryKeys: {
    readonly posts: {
        readonly entry: (entryPath: string) => string[];
        readonly postHeader: (author: string, permlink?: string) => (string | undefined)[];
        readonly content: (author: string, permlink: string) => string[];
        readonly contentReplies: (author: string, permlink: string) => string[];
        readonly accountPosts: (username: string, filter: string, limit: number, observer: string) => (string | number)[];
        readonly accountPostsPage: (username: string, filter: string, startAuthor: string, startPermlink: string, limit: number, observer: string) => (string | number)[];
        readonly userPostVote: (username: string, author: string, permlink: string) => string[];
        readonly reblogs: (username: string, limit: number) => (string | number)[];
        readonly entryActiveVotes: (author?: string, permlink?: string) => (string | undefined)[];
        readonly rebloggedBy: (author: string, permlink: string) => string[];
        readonly tips: (author: string, permlink: string) => string[];
        readonly normalize: (author: string, permlink: string) => string[];
        readonly drafts: (activeUsername?: string) => (string | undefined)[];
        readonly draftsInfinite: (activeUsername?: string, limit?: number) => unknown[];
        readonly schedules: (activeUsername?: string) => (string | undefined)[];
        readonly schedulesInfinite: (activeUsername?: string, limit?: number) => unknown[];
        readonly fragments: (username?: string) => (string | undefined)[];
        readonly fragmentsInfinite: (username?: string, limit?: number) => unknown[];
        readonly images: (username?: string) => (string | undefined)[];
        readonly galleryImages: (activeUsername?: string) => (string | undefined)[];
        readonly imagesInfinite: (username?: string, limit?: number) => unknown[];
        readonly promoted: (type: string) => string[];
        readonly _promotedPrefix: readonly ["posts", "promoted"];
        readonly accountPostsBlogPrefix: (username: string) => readonly ["posts", "account-posts", string, "blog"];
        readonly postsRanked: (sort: string, tag: string, limit: number, observer: string) => (string | number)[];
        readonly postsRankedPage: (sort: string, startAuthor: string, startPermlink: string, limit: number, tag: string, observer: string) => (string | number)[];
        readonly discussions: (author: string, permlink: string, order: string, observer: string) => string[];
        readonly discussion: (author: string, permlink: string, observer: string) => string[];
        readonly deletedEntry: (entryPath: string) => string[];
        readonly commentHistory: (author: string, permlink: string, onlyMeta: boolean) => (string | boolean)[];
        readonly trendingTags: () => string[];
        readonly trendingTagsWithStats: (limit: number) => (string | number)[];
        readonly wavesFeed: (params?: {
            containers?: string[];
            tag?: string;
            following?: string;
            author?: string;
            observer?: string;
            limit?: number;
        }) => (string | number)[];
        readonly shortsFeed: (params?: {
            containers?: string[];
            tag?: string;
            author?: string;
            observer?: string;
            limit?: number;
        }) => (string | number)[];
        readonly wavesByHost: (host: string) => string[];
        readonly wavesByTag: (host: string, tag: string) => string[];
        readonly wavesFollowing: (host: string, username: string) => string[];
        readonly wavesTrendingTags: (host: string, hours: number) => (string | number)[];
        readonly wavesByAccount: (host: string, username: string) => string[];
        readonly wavesTrendingAuthors: (host: string) => string[];
        readonly _prefix: readonly ["posts"];
    };
    readonly accounts: {
        readonly full: (username?: string) => (string | undefined)[];
        readonly list: (...usernames: string[]) => string[];
        readonly friends: (following: string, mode: string, followType: string, limit: number) => (string | number)[];
        readonly searchFriends: (username: string, mode: string, query: string) => string[];
        readonly subscriptions: (username: string) => string[];
        readonly followCount: (username: string) => string[];
        readonly recoveries: (username: string) => string[];
        readonly pendingRecovery: (username: string) => string[];
        readonly checkWalletPending: (username: string, code: string | null) => (string | null)[];
        readonly mutedUsers: (username: string) => string[];
        readonly following: (follower: string, startFollowing: string, followType: string, limit: number) => (string | number)[];
        readonly followers: (following: string, startFollower: string, followType: string, limit: number) => (string | number)[];
        readonly search: (query: string, excludeList?: string[]) => (string | string[] | undefined)[];
        readonly profiles: (accounts: string[], observer: string) => (string | string[])[];
        readonly lookup: (query: string, limit: number) => (string | number)[];
        readonly transactions: (username: string, group: string, limit: number) => (string | number)[];
        readonly favorites: (activeUsername?: string) => (string | undefined)[];
        readonly favoritesInfinite: (activeUsername?: string, limit?: number) => unknown[];
        readonly checkFavorite: (activeUsername: string, targetUsername: string) => string[];
        readonly relations: (reference: string | undefined, target: string | undefined) => (string | undefined)[];
        readonly bots: () => string[];
        readonly voteHistory: (username: string, limit: number) => (string | number)[];
        readonly reputations: (query: string, limit: number) => (string | number)[];
        readonly bookmarks: (activeUsername?: string) => (string | undefined)[];
        readonly bookmarksInfinite: (activeUsername?: string, limit?: number) => unknown[];
        readonly referrals: (username: string) => string[];
        readonly referralsStats: (username: string) => string[];
        readonly proMembers: () => string[];
        readonly _prefix: readonly ["accounts"];
    };
    readonly notifications: {
        readonly announcements: () => string[];
        readonly spotlights: () => string[];
        readonly list: (activeUsername?: string, filter?: string) => (string | undefined)[];
        readonly unreadCount: (activeUsername?: string) => (string | undefined)[];
        readonly settings: (activeUsername?: string) => (string | undefined)[];
        readonly _prefix: readonly ["notifications"];
    };
    readonly core: {
        readonly rewardFund: (fundName: string) => string[];
        readonly dynamicProps: () => string[];
        readonly chainProperties: () => string[];
        readonly _prefix: readonly ["core"];
    };
    readonly communities: {
        readonly single: (name?: string, observer?: string) => (string | undefined)[];
        /** Prefix key for matching all observer variants of a community */
        readonly singlePrefix: (name: string) => readonly ["community", "single", string];
        readonly context: (username: string, communityName: string) => string[];
        readonly rewarded: () => string[];
        readonly list: (sort: string, query: string, limit: number) => (string | number)[];
        readonly subscribers: (communityName: string) => string[];
        readonly accountNotifications: (account: string, limit: number) => (string | number)[];
    };
    readonly proposals: {
        readonly list: () => string[];
        readonly proposal: (id: number) => (string | number)[];
        readonly votes: (proposalId: number, voter: string, limit: number) => (string | number)[];
        readonly votesPrefix: (proposalId: number) => readonly ["proposals", "votes", number];
        readonly votesByUser: (voter: string) => string[];
    };
    readonly search: {
        readonly topics: (q: string, limit: number) => (string | number)[];
        readonly path: (q: string) => string[];
        readonly account: (q: string, limit: number) => (string | number)[];
        readonly results: (q: string, sort: string, hideLow: boolean | string, since?: string, scrollId?: string, votes?: number) => readonly ["search", string, string, boolean, string | undefined, string | undefined, number | undefined];
        readonly controversialRising: (what: string, tag: string) => string[];
        readonly similarEntries: (author: string, permlink: string, content?: string) => string[];
        readonly api: (q: string, sort: string, hideLow: boolean, since?: string, votes?: number, includeNsfw?: boolean) => unknown[];
    };
    readonly witnesses: {
        readonly list: (limit: number) => (string | number)[];
        readonly votes: (username: string | undefined) => (string | undefined)[];
        readonly proxy: () => string[];
        readonly voters: (witness: string, page: number, pageSize: number, sort: string, direction: string) => (string | number)[];
        readonly voterCount: (witness: string) => string[];
    };
    readonly wallet: {
        readonly outgoingRcDelegations: (username: string, limit: number) => (string | number)[];
        readonly vestingDelegations: (username: string, limit: number) => (string | number)[];
        readonly withdrawRoutes: (account: string) => string[];
        readonly incomingRc: (username: string) => string[];
        readonly conversionRequests: (account: string) => string[];
        readonly receivedVestingShares: (username: string) => string[];
        readonly savingsWithdraw: (account: string) => string[];
        readonly openOrders: (user: string) => string[];
        readonly collateralizedConversionRequests: (account: string) => string[];
        readonly recurrentTransfers: (username: string) => string[];
        readonly balanceHistory: (username: string, coinType: string, pageSize: number) => (string | number)[];
        readonly aggregatedHistory: (username: string, coinType: string, granularity?: "yearly" | "monthly" | "daily") => string[];
        readonly portfolio: (username: string, onlyEnabled: string, currency: string) => string[];
    };
    readonly assets: {
        readonly hiveGeneralInfo: (username: string) => string[];
        readonly hiveTransactions: (username: string, limit: number, filterKey: string) => (string | number)[];
        readonly hiveWithdrawalRoutes: (username: string) => string[];
        readonly hiveMetrics: (bucketSeconds: number) => (string | number)[];
        readonly hbdGeneralInfo: (username: string) => string[];
        readonly hbdTransactions: (username: string, limit: number, filterKey: string) => (string | number)[];
        readonly hivePowerGeneralInfo: (username: string) => string[];
        readonly hivePowerDelegates: (username: string) => string[];
        readonly hivePowerDelegatings: (username: string) => string[];
        readonly hivePowerTransactions: (username: string, limit: number, filterKey: string) => (string | number)[];
        readonly pointsGeneralInfo: (username: string) => string[];
        readonly pointsTransactions: (username: string, type: string) => string[];
        readonly ecencyAssetInfo: (username: string, asset: string, currency: string) => string[];
    };
    readonly market: {
        readonly statistics: () => string[];
        readonly orderBook: (limit: number) => (string | number)[];
        readonly history: (seconds: number, startDate: number, endDate: number) => (string | number)[];
        readonly feedHistory: () => string[];
        readonly hiveHbdStats: () => string[];
        readonly data: (coin: string, vsCurrency: string, fromTs: number, toTs: number) => (string | number)[];
        readonly tradeHistory: (limit: number, start: number, end: number) => (string | number)[];
        readonly currentMedianHistoryPrice: () => string[];
    };
    readonly analytics: {
        readonly discoverCuration: (duration: string) => string[];
        readonly pageStats: (url: string, dimensions: string, metrics: string, dateRange: string) => string[];
        readonly discoverLeaderboard: (duration: string) => string[];
    };
    readonly promotions: {
        readonly promotePrice: () => string[];
        readonly boostPlusPrices: () => string[];
        readonly boostPlusAccounts: (account: string) => string[];
    };
    readonly resourceCredits: {
        readonly account: (username: string) => string[];
        readonly stats: () => string[];
    };
    readonly points: {
        readonly points: (username: string, filter: number) => (string | number)[];
        readonly _prefix: (username: string) => string[];
    };
    readonly polls: {
        readonly details: (author: string, permlink: string) => string[];
        readonly vote: (author?: string, permlink?: string) => string[];
        readonly _prefix: readonly ["polls"];
    };
    readonly operations: {
        readonly chainProperties: () => string[];
    };
    readonly games: {
        readonly statusCheck: (gameType: string, username: string) => string[];
    };
    readonly quests: {
        readonly status: (username: string | undefined) => (string | undefined)[];
    };
    readonly support: {
        readonly settings: (username: string | undefined) => (string | undefined)[];
        readonly _prefix: readonly ["support"];
    };
    readonly badActors: {
        readonly list: () => string[];
        readonly _prefix: readonly ["bad-actors"];
    };
    readonly ai: {
        readonly prices: () => readonly ["ai", "prices"];
        readonly assistPrices: (username?: string) => readonly ["ai", "assist-prices", string | undefined];
        readonly _prefix: readonly ["ai"];
    };
};

declare function encodeObj(o: any): string;
declare function decodeObj(o: any): any;

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

declare function getBoundFetch(): typeof fetch;

declare function isCommunity(value: unknown): boolean;

/**
 * Type guard to check if response is wrapped with pagination metadata
 */
declare function isWrappedResponse<T>(response: any): response is WrappedResponse<T>;
/**
 * Normalize response to wrapped format for backwards compatibility
 * If the backend returns old format (array), convert it to wrapped format
 */
declare function normalizeToWrappedResponse<T>(response: T[] | WrappedResponse<T>, limit: number): WrappedResponse<T>;

declare function vestsToHp(vests: number, hivePerMVests: number): number;

declare function isEmptyDate(s: string | undefined): boolean;

interface AccountFollowStats {
    follower_count: number;
    following_count: number;
    account: string;
}

interface AccountReputation {
    account: string;
    reputation: number;
}

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

interface FullAccount {
    name: string;
    owner: Authority;
    active: Authority;
    posting: Authority;
    memo_key: string;
    post_count: number;
    created: string;
    reputation: string | number;
    json_metadata: string;
    posting_json_metadata: string;
    last_vote_time: string;
    last_post: string;
    reward_hbd_balance: string;
    reward_vesting_hive: string;
    reward_hive_balance: string;
    reward_vesting_balance: string;
    balance: string;
    vesting_shares: string;
    hbd_balance: string;
    savings_balance: string;
    savings_hbd_balance: string;
    savings_hbd_seconds: string;
    savings_hbd_last_interest_payment: string;
    savings_hbd_seconds_last_update: string;
    next_vesting_withdrawal: string;
    pending_claimed_accounts: number;
    delegated_vesting_shares: string;
    received_vesting_shares: string;
    vesting_withdraw_rate: string;
    to_withdraw: string;
    withdrawn: string;
    witness_votes: string[];
    proxy: string;
    recovery_account: string;
    proxied_vsf_votes: number[] | string[];
    voting_manabar: {
        current_mana: string | number;
        last_update_time: number;
    };
    voting_power: number;
    downvote_manabar: {
        current_mana: string | number;
        last_update_time: number;
    };
    profile?: AccountProfile;
    follow_stats?: AccountFollowStats;
    proxyVotes?: [];
}

interface AccountRelationship {
    follows: boolean;
    ignores: boolean;
    blacklists: boolean;
    follows_muted: boolean;
    follows_blacklists: boolean;
}

interface AccountBookmark {
    _id: string;
    author: string;
    permlink: string;
    timestamp: number;
    created: string;
}

interface AccountFavorite {
    _id: string;
    account: string;
    timestamp: number;
}

interface Recoveries {
    username: string;
    email: string;
    publicKeys: Record<string, number>;
}
interface GetRecoveriesEmailResponse extends Recoveries {
    _id: string;
}

interface Follow {
    follower: string;
    following: string;
    what: string[];
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
type Transaction = CurationReward | AuthorReward | CommentBenefactor | ClaimRewardBalance | Transfer | TransferToVesting | TransferToSavings | CancelTransferFromSavings | WithdrawVesting | SetWithdrawRoute | FillOrder | ProducerReward | Interest | FillConvertRequest | FillCollateralizedConvertRequest | ReturnVestingDelegation | ProposalPay | UpdateProposalVotes | CommentPayoutUpdate | CommentReward | CollateralizedConvert | RecurrentTransfers | FillRecurrentTransfers | LimitOrderCreate | LimitOrderCancel | FillVestingWithdraw | EffectiveCommentVote | VoteProxy | DelegateVestingShares;
type OperationGroup = "transfers" | "market-orders" | "interests" | "stake-operations" | "rewards";

interface ReferralItem {
    id: number;
    username: string;
    referrer: string;
    created: string;
    rewarded: number;
    v: number;
}
interface ReferralItems {
    data: ReferralItem[];
}
interface ReferralStat {
    total: number;
    rewarded: number;
}

/**
 * Account profile information from bridge API
 * Returned by get_profiles endpoint
 */
interface Profile {
    id: number;
    name: string;
    created: string;
    active: string;
    post_count: number;
    reputation: number;
    blacklists: string[];
    stats: {
        rank: number;
        following: number;
        followers: number;
    };
    metadata: {
        profile: {
            about?: string;
            blacklist_description?: string;
            cover_image?: string;
            location?: string;
            muted_list_description?: string;
            name?: string;
            profile_image?: string;
            website?: string;
        };
    };
}

/**
 * Friends list row data
 * The `active` field contains raw timestamp - app should format it
 */
interface FriendsRow {
    name: string;
    reputation: number;
    active: string;
}
/**
 * Friend search result with additional profile information
 * The `active` field contains raw timestamp - app should format it
 */
interface FriendSearchResult {
    name: string;
    full_name: string;
    reputation: number;
    active: string;
}

type BalanceCoinType = "HIVE" | "HBD" | "VESTS";
interface BalanceHistoryEntry {
    block_num: number;
    operation_id: string;
    op_type_id: number;
    balance: string;
    prev_balance: string;
    balance_change: string;
    timestamp: string;
}
interface BalanceHistoryResponse {
    total_operations: number;
    total_pages: number;
    operations_result: BalanceHistoryEntry[];
}
interface AggregatedBalanceEntry {
    date: string;
    balance: {
        balance: string;
        savings_balance: string;
    };
    prev_balance: {
        balance: string;
        savings_balance: string;
    };
    min_balance: {
        balance: string;
        savings_balance: string;
    };
    max_balance: {
        balance: string;
        savings_balance: string;
    };
}

interface Payload$4 {
    profile: Partial<AccountProfile>;
    tokens: AccountProfile["tokens"];
}
/**
 * React Query mutation hook for updating account profile metadata.
 *
 * This mutation broadcasts an account_update2 operation to update the user's
 * profile information (name, about, location, avatar, cover image, etc.).
 *
 * @param username - The username to update (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Profile Fields:**
 * - name: Display name
 * - about: Bio/description
 * - location: Location
 * - website: Website URL
 * - profile_image: Avatar URL
 * - cover_image: Cover/banner URL
 * - tokens: Social tokens (Twitter, Facebook, etc.)
 * - version: Profile metadata version (auto-set to 2)
 *
 * **Authentication:**
 * - Uses posting authority (account_update2 operation)
 * - Supports all auth methods via platform adapter
 *
 * **Post-Broadcast Actions:**
 * - Optimistically updates account cache with new profile data
 * - Invalidates account cache to refetch from blockchain
 *
 * @example
 * ```typescript
 * const updateProfile = useAccountUpdate(username, {
 *   adapter: myAdapter,
 * });
 *
 * // Update profile
 * updateProfile.mutate({
 *   profile: {
 *     name: "John Doe",
 *     about: "Hive enthusiast",
 *     profile_image: "https://...",
 *   }
 * });
 * ```
 */
declare function useAccountUpdate(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, Partial<Payload$4>, unknown>;

type Kind = "toggle-ignore" | "toggle-follow";
declare function useAccountRelationsUpdate(reference: string | undefined, target: string | undefined, auth: AuthContext | undefined, onSuccess: (data: Partial<AccountRelationship> | undefined) => void, onError: (e: Error) => void): _tanstack_react_query.UseMutationResult<{
    ignores: boolean | undefined;
    follows: boolean | undefined;
    blacklists?: boolean | undefined;
    follows_muted?: boolean | undefined;
    follows_blacklists?: boolean | undefined;
}, Error, Kind, unknown>;

/**
 * Payload for following an account.
 */
interface FollowPayload {
    /** Account to follow */
    following: string;
}
/**
 * React Query mutation hook for following an account.
 *
 * This mutation broadcasts a follow operation to the Hive blockchain,
 * adding the target account to the follower's "blog" follow list.
 *
 * @param username - The username of the follower (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates relationship cache to show updated follow status
 * - Invalidates account cache to refetch updated follower/following counts
 *
 * @example
 * ```typescript
 * const followMutation = useFollow(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Follow an account
 * followMutation.mutate({
 *   following: 'alice'
 * });
 * ```
 */
declare function useFollow(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, FollowPayload, unknown>;

/**
 * Payload for unfollowing an account.
 */
interface UnfollowPayload {
    /** Account to unfollow */
    following: string;
}
/**
 * React Query mutation hook for unfollowing an account.
 *
 * This mutation broadcasts an unfollow operation to the Hive blockchain,
 * removing the target account from the follower's follow list.
 *
 * @param username - The username of the follower (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates relationship cache to show updated follow status
 * - Invalidates account cache to refetch updated follower/following counts
 *
 * @example
 * ```typescript
 * const unfollowMutation = useUnfollow(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Unfollow an account
 * unfollowMutation.mutate({
 *   following: 'alice'
 * });
 * ```
 */
declare function useUnfollow(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, UnfollowPayload, unknown>;

interface Payload$3 {
    author: string;
    permlink: string;
}
declare function useBookmarkAdd(username: string | undefined, code: string | undefined, onSuccess: () => void, onError: (e: Error) => void): _tanstack_react_query.UseMutationResult<any, Error, Payload$3, unknown>;

declare function useBookmarkDelete(username: string | undefined, code: string | undefined, onSuccess: () => void, onError: (e: Error) => void): _tanstack_react_query.UseMutationResult<any, Error, string, unknown>;

declare function useAccountFavoriteAdd(username: string | undefined, code: string | undefined, onSuccess: () => void, onError: (e: Error) => void): _tanstack_react_query.UseMutationResult<any, Error, string, unknown>;

declare function useAccountFavoriteDelete(username: string | undefined, code: string | undefined, onSuccess: () => void, onError: (e: Error) => void): _tanstack_react_query.UseMutationResult<any, Error, string, {
    previousList: AccountFavorite[] | undefined;
    previousInfinite: Map<readonly unknown[], InfiniteData<WrappedResponse<AccountFavorite>, unknown> | undefined>;
    previousCheck: boolean | undefined;
} | undefined>;

interface Keys {
    owner: PrivateKey;
    active: PrivateKey;
    posting: PrivateKey;
    memo_key: PrivateKey;
}
interface Payload$2 {
    keepCurrent?: boolean;
    currentKey: PrivateKey;
    keys: Keys[];
    keysToRevoke?: string[];
    keysToRevokeByAuthority?: Partial<Record<keyof Keys, string[]>>;
}
declare function dedupeAndSortKeyAuths(existing: Authority["key_auths"], additions: [string, number][]): Authority["key_auths"];
type UpdateKeyAuthsOptions = Pick<UseMutationOptions<unknown, Error, Payload$2>, "onSuccess" | "onError">;
declare function useAccountUpdateKeyAuths(username: string, options?: UpdateKeyAuthsOptions): _tanstack_react_query.UseMutationResult<TransactionConfirmation, Error, Payload$2, unknown>;

interface Payload$1 {
    newPassword: string;
    currentPassword: string;
    keepCurrent?: boolean;
}
/**
 * Only native Hive and custom passwords could be updated here
 * Seed based password cannot be updated here, it will be in an account always for now
 */
type UpdatePasswordOptions = Pick<UseMutationOptions<unknown, Error, Payload$1>, "onSuccess" | "onError">;
declare function useAccountUpdatePassword(username: string, options?: UpdatePasswordOptions): _tanstack_react_query.UseMutationResult<TransactionConfirmation, Error, Payload$1, unknown>;

type SignType$1 = "key" | "keychain" | "hivesigner";
interface CommonPayload$1 {
    accountName: string;
    type: SignType$1;
    key?: PrivateKey;
}
type RevokePostingOptions = Pick<UseMutationOptions<unknown, Error, CommonPayload$1>, "onSuccess" | "onError"> & {
    hsCallbackUrl?: string;
};
declare function useAccountRevokePosting(username: string | undefined, options: RevokePostingOptions, auth?: AuthContext): _tanstack_react_query.UseMutationResult<unknown, Error, CommonPayload$1, unknown>;

type SignType = "key" | "keychain" | "hivesigner" | "ecency";
interface CommonPayload {
    accountName: string;
    type: SignType;
    key?: PrivateKey;
    email?: string;
}
type UpdateRecoveryOptions = Pick<UseMutationOptions<unknown, Error, CommonPayload>, "onSuccess" | "onError"> & {
    hsCallbackUrl?: string;
};
declare function useAccountUpdateRecovery(username: string | undefined, code: string | undefined, options: UpdateRecoveryOptions, auth?: AuthContext): _tanstack_react_query.UseMutationResult<unknown, Error, CommonPayload, unknown>;

interface Payload {
    currentKey: PrivateKey;
    /** Keys to revoke. Accepts a single key or an array. */
    revokingKey: PublicKey | PublicKey[];
}
/**
 * Revoke one or more keys from an account on the Hive blockchain.
 *
 * When revoking keys that exist only in active/posting authorities,
 * the owner field is omitted from the operation so active-level
 * signing is sufficient.
 */
type RevokeKeyOptions = Pick<UseMutationOptions<unknown, Error, Payload>, "onSuccess" | "onError">;
declare function useAccountRevokeKey(username: string | undefined, options?: RevokeKeyOptions): _tanstack_react_query.UseMutationResult<TransactionConfirmation, Error, Payload, unknown>;

/**
 * Check whether an authority would still meet its weight_threshold
 * after removing the given keys. This prevents revoking keys that
 * would leave an authority unable to sign (especially for multisig).
 */
declare function canRevokeFromAuthority(auth: Authority, revokingKeyStrs: Set<string>): boolean;
/**
 * Build an account_update operation that removes the given public keys
 * from the relevant authorities.
 *
 * Only includes the `owner` field when a revoking key actually exists
 * in the owner authority - omitting it allows active-level signing.
 *
 * Returns the operation payload (without the "account_update" tag) so
 * callers can wrap it as needed for their broadcast method.
 */
declare function buildRevokeKeysOp(accountData: FullAccount, revokingKeys: PublicKey[]): {
    account: string;
    json_metadata: string;
    owner: Authority | undefined;
    active: Authority;
    posting: Authority;
    memo_key: string;
};

/**
 * Payload for claiming account creation tokens.
 */
interface ClaimAccountPayload {
    /** Creator account claiming the token */
    creator: string;
    /** Fee for claiming (usually "0.000 HIVE" for RC-based claims) */
    fee?: string;
}
/**
 * React Query mutation hook for claiming account creation tokens.
 *
 * This mutation broadcasts a claim_account operation to claim an account
 * creation token using Resource Credits (RC). The claimed token can later
 * be used to create a new account for free using the create_claimed_account
 * operation.
 *
 * @param username - The username claiming the account token (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates account cache to update pending_claimed_accounts count
 * - Updates account query data to set pending_claimed_accounts = 0 optimistically
 *
 * **Operation Details:**
 * - Uses native claim_account operation
 * - Fee: "0.000 HIVE" (uses RC instead of HIVE)
 * - Authority: Active key (required for claiming)
 *
 * **RC Requirements:**
 * - Requires sufficient Resource Credits (RC)
 * - RC amount varies based on network conditions
 * - Claiming without sufficient RC will fail
 *
 * **Use Case:**
 * - Claim tokens in advance when RC is available
 * - Create accounts later without paying HIVE fee
 * - Useful for onboarding services and apps
 *
 * @example
 * ```typescript
 * const claimMutation = useClaimAccount(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Claim account token using RC
 * claimMutation.mutate({
 *   creator: 'alice',
 *   fee: '0.000 HIVE'
 * });
 * ```
 */
declare function useClaimAccount(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, ClaimAccountPayload, unknown>;

/**
 * Content Operations
 * Operations for creating, voting, and managing content on Hive blockchain
 */
/**
 * Builds a vote operation.
 * @param voter - Account casting the vote
 * @param author - Author of the post/comment
 * @param permlink - Permlink of the post/comment
 * @param weight - Vote weight (-10000 to 10000, where 10000 = 100% upvote, -10000 = 100% downvote)
 * @returns Vote operation
 */
declare function buildVoteOp(voter: string, author: string, permlink: string, weight: number): Operation;
/**
 * Builds a comment operation (for posts or replies).
 * @param author - Author of the comment/post
 * @param permlink - Permlink of the comment/post
 * @param parentAuthor - Parent author (empty string for top-level posts)
 * @param parentPermlink - Parent permlink (category/tag for top-level posts)
 * @param title - Title of the post (empty for comments)
 * @param body - Content body (required - cannot be empty)
 * @param jsonMetadata - JSON metadata object
 * @returns Comment operation
 */
declare function buildCommentOp(author: string, permlink: string, parentAuthor: string, parentPermlink: string, title: string, body: string, jsonMetadata: Record<string, any>): Operation;
/**
 * Builds a comment options operation (for setting beneficiaries, rewards, etc.).
 * @param author - Author of the comment/post
 * @param permlink - Permlink of the comment/post
 * @param maxAcceptedPayout - Maximum accepted payout (e.g., "1000000.000 HBD")
 * @param percentHbd - Percent of payout in HBD (10000 = 100%)
 * @param allowVotes - Allow votes on this content
 * @param allowCurationRewards - Allow curation rewards
 * @param extensions - Extensions array (for beneficiaries, etc.)
 * @returns Comment options operation
 */
declare function buildCommentOptionsOp(author: string, permlink: string, maxAcceptedPayout: string, percentHbd: number, allowVotes: boolean, allowCurationRewards: boolean, extensions: any[]): Operation;
/**
 * Builds a delete comment operation.
 * @param author - Author of the comment/post to delete
 * @param permlink - Permlink of the comment/post to delete
 * @returns Delete comment operation
 */
declare function buildDeleteCommentOp(author: string, permlink: string): Operation;
/**
 * Builds a reblog operation (custom_json).
 * @param account - Account performing the reblog
 * @param author - Original post author
 * @param permlink - Original post permlink
 * @param deleteReblog - If true, removes the reblog
 * @returns Custom JSON operation for reblog
 */
declare function buildReblogOp(account: string, author: string, permlink: string, deleteReblog?: boolean): Operation;

/**
 * Wallet Operations
 * Operations for managing tokens, savings, vesting, and conversions
 */
/**
 * Builds a transfer operation.
 * @param from - Sender account
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @returns Transfer operation
 */
declare function buildTransferOp(from: string, to: string, amount: string, memo: string): Operation;
/**
 * Builds multiple transfer operations for multiple recipients.
 * @param from - Sender account
 * @param destinations - Comma or space separated list of recipient accounts
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @returns Array of transfer operations
 */
declare function buildMultiTransferOps(from: string, destinations: string, amount: string, memo: string): Operation[];
/**
 * Builds a recurrent transfer operation.
 * @param from - Sender account
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @param recurrence - Recurrence in hours
 * @param executions - Number of executions (2 = executes twice)
 * @returns Recurrent transfer operation
 */
declare function buildRecurrentTransferOp(from: string, to: string, amount: string, memo: string, recurrence: number, executions: number): Operation;
/**
 * Builds a transfer to savings operation.
 * @param from - Sender account
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @returns Transfer to savings operation
 */
declare function buildTransferToSavingsOp(from: string, to: string, amount: string, memo: string): Operation;
/**
 * Builds a transfer from savings operation.
 * @param from - Sender account
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "1.000 HIVE")
 * @param memo - Transfer memo
 * @param requestId - Unique request ID (use timestamp)
 * @returns Transfer from savings operation
 */
declare function buildTransferFromSavingsOp(from: string, to: string, amount: string, memo: string, requestId: number): Operation;
/**
 * Builds a cancel transfer from savings operation.
 * @param from - Account that initiated the savings withdrawal
 * @param requestId - Request ID to cancel
 * @returns Cancel transfer from savings operation
 */
declare function buildCancelTransferFromSavingsOp(from: string, requestId: number): Operation;
/**
 * Builds operations to claim savings interest.
 * Creates a transfer_from_savings and immediately cancels it to claim interest.
 * @param from - Account claiming interest
 * @param to - Receiver account
 * @param amount - Amount with asset symbol (e.g., "0.001 HIVE")
 * @param memo - Transfer memo
 * @param requestId - Unique request ID
 * @returns Array of operations [transfer_from_savings, cancel_transfer_from_savings]
 */
declare function buildClaimInterestOps(from: string, to: string, amount: string, memo: string, requestId: number): Operation[];
/**
 * Builds a transfer to vesting operation (power up).
 * @param from - Account sending HIVE
 * @param to - Account receiving Hive Power
 * @param amount - Amount with HIVE symbol (e.g., "1.000 HIVE")
 * @returns Transfer to vesting operation
 */
declare function buildTransferToVestingOp(from: string, to: string, amount: string): Operation;
/**
 * Builds a withdraw vesting operation (power down).
 * @param account - Account withdrawing vesting
 * @param vestingShares - Amount of VESTS to withdraw (e.g., "1.000000 VESTS")
 * @returns Withdraw vesting operation
 */
declare function buildWithdrawVestingOp(account: string, vestingShares: string): Operation;
/**
 * Builds a delegate vesting shares operation (HP delegation).
 * @param delegator - Account delegating HP
 * @param delegatee - Account receiving HP delegation
 * @param vestingShares - Amount of VESTS to delegate (e.g., "1000.000000 VESTS")
 * @returns Delegate vesting shares operation
 */
declare function buildDelegateVestingSharesOp(delegator: string, delegatee: string, vestingShares: string): Operation;
/**
 * Builds a set withdraw vesting route operation.
 * @param fromAccount - Account withdrawing vesting
 * @param toAccount - Account receiving withdrawn vesting
 * @param percent - Percentage to route (0-10000, where 10000 = 100%)
 * @param autoVest - Auto convert to vesting
 * @returns Set withdraw vesting route operation
 */
declare function buildSetWithdrawVestingRouteOp(fromAccount: string, toAccount: string, percent: number, autoVest: boolean): Operation;
/**
 * Builds a convert operation (HBD to HIVE).
 * @param owner - Account converting HBD
 * @param amount - Amount of HBD to convert (e.g., "1.000 HBD")
 * @param requestId - Unique request ID (use timestamp)
 * @returns Convert operation
 */
declare function buildConvertOp(owner: string, amount: string, requestId: number): Operation;
/**
 * Builds a collateralized convert operation (HIVE to HBD via collateral).
 * @param owner - Account converting HIVE
 * @param amount - Amount of HIVE to convert (e.g., "1.000 HIVE")
 * @param requestId - Unique request ID (use timestamp)
 * @returns Collateralized convert operation
 */
declare function buildCollateralizedConvertOp(owner: string, amount: string, requestId: number): Operation;
/**
 * Builds a Hive Engine custom_json operation.
 * @param from - Account performing the operation
 * @param contractAction - Engine contract action (e.g., "transfer", "stake")
 * @param contractPayload - Payload for the contract action
 * @param contractName - Engine contract name (defaults to "tokens")
 * @returns Custom JSON operation
 */
declare function buildEngineOp(from: string, contractAction: string, contractPayload: Record<string, string>, contractName?: string): Operation;
/**
 * Builds a scot_claim_token operation (posting authority).
 * @param account - Account claiming rewards
 * @param tokens - Array of token symbols to claim
 * @returns Custom JSON operation
 */
declare function buildEngineClaimOp(account: string, tokens: string[]): Operation;
/**
 * Builds a delegate RC operation (custom_json).
 * @param from - Account delegating RC
 * @param delegatees - Single delegatee or comma-separated list
 * @param maxRc - Maximum RC to delegate (in mana units)
 * @returns Custom JSON operation for RC delegation
 */
declare function buildDelegateRcOp(from: string, delegatees: string, maxRc: string | number): Operation;

/**
 * Social Operations
 * Operations for following, muting, and managing social relationships
 */
/**
 * Builds a follow operation (custom_json).
 * @param follower - Account following
 * @param following - Account to follow
 * @returns Custom JSON operation for follow
 */
declare function buildFollowOp(follower: string, following: string): Operation;
/**
 * Builds an unfollow operation (custom_json).
 * @param follower - Account unfollowing
 * @param following - Account to unfollow
 * @returns Custom JSON operation for unfollow
 */
declare function buildUnfollowOp(follower: string, following: string): Operation;
/**
 * Builds an ignore/mute operation (custom_json).
 * @param follower - Account ignoring
 * @param following - Account to ignore
 * @returns Custom JSON operation for ignore
 */
declare function buildIgnoreOp(follower: string, following: string): Operation;
/**
 * Builds an unignore/unmute operation (custom_json).
 * @param follower - Account unignoring
 * @param following - Account to unignore
 * @returns Custom JSON operation for unignore
 */
declare function buildUnignoreOp(follower: string, following: string): Operation;
/**
 * Builds a Hive Notify set last read operation (custom_json).
 * @param username - Account setting last read
 * @param date - ISO date string (defaults to now)
 * @returns Array of custom JSON operations for setting last read
 */
declare function buildSetLastReadOps(username: string, date?: string): Operation[];

/**
 * Governance Operations
 * Operations for witness voting, proposals, and proxy management
 */
/**
 * Builds an account witness vote operation.
 * @param account - Account voting
 * @param witness - Witness account name
 * @param approve - True to approve, false to disapprove
 * @returns Account witness vote operation
 */
declare function buildWitnessVoteOp(account: string, witness: string, approve: boolean): Operation;
/**
 * Builds an account witness proxy operation.
 * @param account - Account setting proxy
 * @param proxy - Proxy account name (empty string to remove proxy)
 * @returns Account witness proxy operation
 */
declare function buildWitnessProxyOp(account: string, proxy: string): Operation;
/**
 * Payload for proposal creation
 */
interface ProposalCreatePayload {
    receiver: string;
    subject: string;
    permlink: string;
    start: string;
    end: string;
    dailyPay: string;
}
/**
 * Builds a create proposal operation.
 * @param creator - Account creating the proposal
 * @param payload - Proposal details (must include start, end, and dailyPay)
 * @returns Create proposal operation
 */
declare function buildProposalCreateOp(creator: string, payload: ProposalCreatePayload): Operation;
/**
 * Builds an update proposal votes operation.
 * @param voter - Account voting
 * @param proposalIds - Array of proposal IDs
 * @param approve - True to approve, false to disapprove
 * @returns Update proposal votes operation
 */
declare function buildProposalVoteOp(voter: string, proposalIds: number[], approve: boolean): Operation;
/**
 * Builds a remove proposal operation.
 * @param proposalOwner - Owner of the proposal
 * @param proposalIds - Array of proposal IDs to remove
 * @returns Remove proposal operation
 */
declare function buildRemoveProposalOp(proposalOwner: string, proposalIds: number[]): Operation;
/**
 * Builds an update proposal operation.
 * @param proposalId - Proposal ID to update (must be a valid number, including 0)
 * @param creator - Account that created the proposal
 * @param dailyPay - New daily pay amount
 * @param subject - New subject
 * @param permlink - New permlink
 * @returns Update proposal operation
 */
declare function buildUpdateProposalOp(proposalId: number, creator: string, dailyPay: string, subject: string, permlink: string): Operation;

/**
 * Community Operations
 * Operations for managing Hive communities
 */
/**
 * Builds a subscribe to community operation (custom_json).
 * @param username - Account subscribing
 * @param community - Community name (e.g., "hive-123456")
 * @returns Custom JSON operation for subscribe
 */
declare function buildSubscribeOp(username: string, community: string): Operation;
/**
 * Builds an unsubscribe from community operation (custom_json).
 * @param username - Account unsubscribing
 * @param community - Community name (e.g., "hive-123456")
 * @returns Custom JSON operation for unsubscribe
 */
declare function buildUnsubscribeOp(username: string, community: string): Operation;
/**
 * Builds a set user role in community operation (custom_json).
 * @param username - Account setting the role (must have permission)
 * @param community - Community name (e.g., "hive-123456")
 * @param account - Account to set role for
 * @param role - Role name (e.g., "admin", "mod", "member", "guest")
 * @returns Custom JSON operation for setRole
 */
declare function buildSetRoleOp(username: string, community: string, account: string, role: string): Operation;
/**
 * Community properties for update
 */
interface CommunityProps {
    title: string;
    about: string;
    lang: string;
    description: string;
    flag_text: string;
    is_nsfw: boolean;
}
/**
 * Builds an update community properties operation (custom_json).
 * @param username - Account updating (must be community admin)
 * @param community - Community name (e.g., "hive-123456")
 * @param props - Properties to update
 * @returns Custom JSON operation for updateProps
 */
declare function buildUpdateCommunityOp(username: string, community: string, props: CommunityProps): Operation;
/**
 * Builds a pin/unpin post in community operation (custom_json).
 * @param username - Account pinning (must have permission)
 * @param community - Community name (e.g., "hive-123456")
 * @param account - Post author
 * @param permlink - Post permlink
 * @param pin - True to pin, false to unpin
 * @returns Custom JSON operation for pinPost/unpinPost
 */
declare function buildPinPostOp(username: string, community: string, account: string, permlink: string, pin: boolean): Operation;
/**
 * Builds a mute/unmute post in community operation (custom_json).
 * @param username - Account muting (must have permission)
 * @param community - Community name (e.g., "hive-123456")
 * @param account - Post author
 * @param permlink - Post permlink
 * @param notes - Mute reason/notes
 * @param mute - True to mute, false to unmute
 * @returns Custom JSON operation for mutePost/unmutePost
 */
declare function buildMutePostOp(username: string, community: string, account: string, permlink: string, notes: string, mute: boolean): Operation;
/**
 * Builds a mute/unmute user in community operation (custom_json).
 * @param username - Account performing mute (must have permission)
 * @param community - Community name (e.g., "hive-123456")
 * @param account - Account to mute/unmute
 * @param notes - Mute reason/notes
 * @param mute - True to mute, false to unmute
 * @returns Custom JSON operation for muteUser/unmuteUser
 */
declare function buildMuteUserOp(username: string, community: string, account: string, notes: string, mute: boolean): Operation;
/**
 * Builds a flag post in community operation (custom_json).
 * @param username - Account flagging
 * @param community - Community name (e.g., "hive-123456")
 * @param account - Post author
 * @param permlink - Post permlink
 * @param notes - Flag reason/notes
 * @returns Custom JSON operation for flagPost
 */
declare function buildFlagPostOp(username: string, community: string, account: string, permlink: string, notes: string): Operation;

/**
 * Market Operations
 * Operations for trading on the internal Hive market
 */
/**
 * Transaction type for buy/sell operations
 */
declare enum BuySellTransactionType {
    Buy = "buy",
    Sell = "sell"
}
/**
 * Order ID prefix for different order types
 */
declare enum OrderIdPrefix {
    EMPTY = "",
    SWAP = "9"
}
/**
 * Builds a limit order create operation.
 * @param owner - Account creating the order
 * @param amountToSell - Amount and asset to sell
 * @param minToReceive - Minimum amount and asset to receive
 * @param fillOrKill - If true, order must be filled immediately or cancelled
 * @param expiration - Expiration date (ISO string)
 * @param orderId - Unique order ID
 * @returns Limit order create operation
 */
declare function buildLimitOrderCreateOp(owner: string, amountToSell: string, minToReceive: string, fillOrKill: boolean, expiration: string, orderId: number): Operation;
/**
 * Builds a limit order create operation with automatic formatting.
 * This is a convenience method that handles buy/sell logic and formatting.
 *
 * For Buy orders: You're buying HIVE with HBD
 *   - amountToSell: HBD amount you're spending
 *   - minToReceive: HIVE amount you want to receive
 *
 * For Sell orders: You're selling HIVE for HBD
 *   - amountToSell: HIVE amount you're selling
 *   - minToReceive: HBD amount you want to receive
 *
 * @param owner - Account creating the order
 * @param amountToSell - Amount to sell (number)
 * @param minToReceive - Minimum to receive (number)
 * @param orderType - Buy or Sell
 * @param idPrefix - Order ID prefix
 * @returns Limit order create operation
 */
declare function buildLimitOrderCreateOpWithType(owner: string, amountToSell: number, minToReceive: number, orderType: BuySellTransactionType, idPrefix?: OrderIdPrefix): Operation;
/**
 * Builds a limit order cancel operation.
 * @param owner - Account cancelling the order
 * @param orderId - Order ID to cancel
 * @returns Limit order cancel operation
 */
declare function buildLimitOrderCancelOp(owner: string, orderId: number): Operation;
/**
 * Builds a claim reward balance operation.
 * @param account - Account claiming rewards
 * @param rewardHive - HIVE reward to claim (e.g., "0.000 HIVE")
 * @param rewardHbd - HBD reward to claim (e.g., "0.000 HBD")
 * @param rewardVests - VESTS reward to claim (e.g., "0.000000 VESTS")
 * @returns Claim reward balance operation
 */
declare function buildClaimRewardBalanceOp(account: string, rewardHive: string, rewardHbd: string, rewardVests: string): Operation;

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
declare function buildAccountUpdateOp(account: string, owner: Authority | undefined, active: Authority | undefined, posting: Authority | undefined, memoKey: string, jsonMetadata: string): Operation;
/**
 * Builds an account update2 operation (for posting_json_metadata).
 * @param account - Account name
 * @param jsonMetadata - Account JSON metadata (legacy, usually empty)
 * @param postingJsonMetadata - Posting JSON metadata string
 * @param extensions - Extensions array
 * @returns Account update2 operation
 */
declare function buildAccountUpdate2Op(account: string, jsonMetadata: string, postingJsonMetadata: string, extensions: any[]): Operation;
/**
 * Public keys for account creation
 */
interface AccountKeys {
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
declare function buildAccountCreateOp(creator: string, newAccountName: string, keys: AccountKeys, fee: string): Operation;
/**
 * Builds a create claimed account operation (using account creation tokens).
 * @param creator - Creator account name
 * @param newAccountName - New account name
 * @param keys - Public keys for the new account
 * @returns Create claimed account operation
 */
declare function buildCreateClaimedAccountOp(creator: string, newAccountName: string, keys: AccountKeys): Operation;
/**
 * Builds a claim account operation.
 * @param creator - Account claiming the token
 * @param fee - Fee for claiming (usually "0.000 HIVE" for RC-based claims)
 * @returns Claim account operation
 */
declare function buildClaimAccountOp(creator: string, fee: string): Operation;
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
declare function buildGrantPostingPermissionOp(account: string, currentPosting: Authority, grantedAccount: string, weightThreshold: number, memoKey: string, jsonMetadata: string): Operation;
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
declare function buildRevokePostingPermissionOp(account: string, currentPosting: Authority, revokedAccount: string, memoKey: string, jsonMetadata: string): Operation;
/**
 * Builds a change recovery account operation.
 * @param accountToRecover - Account to change recovery account for
 * @param newRecoveryAccount - New recovery account name
 * @param extensions - Extensions array
 * @returns Change recovery account operation
 */
declare function buildChangeRecoveryAccountOp(accountToRecover: string, newRecoveryAccount: string, extensions?: any[]): Operation;
/**
 * Builds a request account recovery operation.
 * @param recoveryAccount - Recovery account performing the recovery
 * @param accountToRecover - Account to recover
 * @param newOwnerAuthority - New owner authority
 * @param extensions - Extensions array
 * @returns Request account recovery operation
 */
declare function buildRequestAccountRecoveryOp(recoveryAccount: string, accountToRecover: string, newOwnerAuthority: Authority, extensions?: any[]): Operation;
/**
 * Builds a recover account operation.
 * @param accountToRecover - Account to recover
 * @param newOwnerAuthority - New owner authority
 * @param recentOwnerAuthority - Recent owner authority (for proof)
 * @param extensions - Extensions array
 * @returns Recover account operation
 */
declare function buildRecoverAccountOp(accountToRecover: string, newOwnerAuthority: Authority, recentOwnerAuthority: Authority, extensions?: any[]): Operation;

/**
 * Ecency-Specific Operations
 * Custom operations for Ecency platform features (Points, Boost, Promote, etc.)
 */
/**
 * Builds an Ecency Boost Plus subscription operation (custom_json).
 * @param user - User account
 * @param account - Account to subscribe
 * @param duration - Subscription duration in days (must be a valid finite number)
 * @returns Custom JSON operation for boost plus
 */
declare function buildBoostPlusOp(user: string, account: string, duration: number): Operation;
/**
 * Builds an Ecency RC top-up operation (custom_json): a short-term, RC-only
 * delegation to the user's OWN account, paid for with Ecency Points. Distinct
 * from Boost Plus (which delegates Hive Power). The RC amount is fixed
 * server-side, so the user only chooses a duration. Signed with active
 * authority because it spends Points. The actual on-chain `delegate_rc` is
 * broadcast by the Ecency relay account, not here.
 * @param user - User account (payer and recipient of the RC)
 * @param duration - Delegation duration in days (must be a valid finite number)
 * @returns Custom JSON operation for the RC top-up
 */
declare function buildRcDelegationOp(user: string, duration: number): Operation;
/**
 * Builds an Ecency promote operation (custom_json).
 * @param user - User account
 * @param author - Post author
 * @param permlink - Post permlink
 * @param duration - Promotion duration in days (must be a valid finite number)
 * @returns Custom JSON operation for promote
 */
declare function buildPromoteOp(user: string, author: string, permlink: string, duration: number): Operation;
/**
 * Builds an Ecency point transfer operation (custom_json).
 * @param sender - Sender account
 * @param receiver - Receiver account
 * @param amount - Amount to transfer
 * @param memo - Transfer memo
 * @returns Custom JSON operation for point transfer
 */
declare function buildPointTransferOp(sender: string, receiver: string, amount: string, memo: string): Operation;
/**
 * Builds multiple Ecency point transfer operations for multiple recipients.
 * @param sender - Sender account
 * @param destinations - Comma or space separated list of recipients
 * @param amount - Amount to transfer
 * @param memo - Transfer memo
 * @returns Array of custom JSON operations for point transfers
 */
declare function buildMultiPointTransferOps(sender: string, destinations: string, amount: string, memo: string): Operation[];
/**
 * Builds an Ecency community rewards registration operation (custom_json).
 * @param name - Account name to register
 * @returns Custom JSON operation for community registration
 */
declare function buildCommunityRegistrationOp(name: string): Operation;
/**
 * Builds a generic active authority custom_json operation.
 * Used for various Ecency operations that require active authority.
 * @param username - Account performing the operation
 * @param operationId - Custom JSON operation ID
 * @param json - JSON payload
 * @returns Custom JSON operation with active authority
 */
declare function buildActiveCustomJsonOp(username: string, operationId: string, json: Record<string, any>): Operation;
/**
 * Builds a generic posting authority custom_json operation.
 * Used for various operations that require posting authority.
 * @param username - Account performing the operation
 * @param operationId - Custom JSON operation ID
 * @param json - JSON payload
 * @returns Custom JSON operation with posting authority
 */
declare function buildPostingCustomJsonOp(username: string, operationId: string, json: Record<string, any> | any[]): Operation;

interface GrantPostingPermissionPayload {
    currentPosting: Authority;
    grantedAccount: string;
    weightThreshold: number;
    memoKey: string;
    jsonMetadata: string;
}
declare function useGrantPostingPermission(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, GrantPostingPermissionPayload, unknown>;

interface CreateAccountPayload {
    newAccountName: string;
    keys: AccountKeys;
    fee: string;
    /** If true, uses a claimed account token instead of paying the fee */
    useClaimed?: boolean;
}
declare function useCreateAccount(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, CreateAccountPayload, unknown>;

declare function useSignOperationByKey(username: string | undefined): _tanstack_react_query.UseMutationResult<TransactionConfirmation, Error, {
    operation: Operation;
    keyOrSeed: string;
}, unknown>;

declare function useSignOperationByKeychain(username: string | undefined, auth?: AuthContext, keyType?: "owner" | "active" | "posting" | "memo"): _tanstack_react_query.UseMutationResult<unknown, Error, {
    operation: Operation;
}, unknown>;

declare function useSignOperationByHivesigner(callbackUri?: string): _tanstack_react_query.UseMutationResult<string | void, Error, {
    operation: Operation;
}, unknown>;

declare function getChainPropertiesQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<any, Error, any, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<any, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: any;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAccountFullQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    name: string;
    owner: Authority;
    active: Authority;
    posting: Authority;
    memo_key: string;
    post_count: number;
    created: string;
    posting_json_metadata: string;
    last_vote_time: string;
    last_post: string;
    json_metadata: string;
    reward_hive_balance: string;
    reward_hbd_balance: string;
    reward_vesting_hive: string;
    reward_vesting_balance: string;
    balance: string;
    hbd_balance: string;
    savings_balance: string;
    savings_hbd_balance: string;
    savings_hbd_last_interest_payment: string;
    savings_hbd_seconds_last_update: string;
    savings_hbd_seconds: string;
    next_vesting_withdrawal: string;
    pending_claimed_accounts: number;
    vesting_shares: string;
    delegated_vesting_shares: string;
    received_vesting_shares: string;
    vesting_withdraw_rate: string;
    to_withdraw: string;
    withdrawn: string;
    witness_votes: string[];
    proxy: string;
    recovery_account: string;
    proxied_vsf_votes: string[] | number[];
    voting_manabar: {
        current_mana: string | number;
        last_update_time: number;
    };
    voting_power: number;
    downvote_manabar: {
        current_mana: string | number;
        last_update_time: number;
    };
    follow_stats: AccountFollowStats | undefined;
    reputation: number;
    profile: AccountProfile;
} | null, Error, {
    name: string;
    owner: Authority;
    active: Authority;
    posting: Authority;
    memo_key: string;
    post_count: number;
    created: string;
    posting_json_metadata: string;
    last_vote_time: string;
    last_post: string;
    json_metadata: string;
    reward_hive_balance: string;
    reward_hbd_balance: string;
    reward_vesting_hive: string;
    reward_vesting_balance: string;
    balance: string;
    hbd_balance: string;
    savings_balance: string;
    savings_hbd_balance: string;
    savings_hbd_last_interest_payment: string;
    savings_hbd_seconds_last_update: string;
    savings_hbd_seconds: string;
    next_vesting_withdrawal: string;
    pending_claimed_accounts: number;
    vesting_shares: string;
    delegated_vesting_shares: string;
    received_vesting_shares: string;
    vesting_withdraw_rate: string;
    to_withdraw: string;
    withdrawn: string;
    witness_votes: string[];
    proxy: string;
    recovery_account: string;
    proxied_vsf_votes: string[] | number[];
    voting_manabar: {
        current_mana: string | number;
        last_update_time: number;
    };
    voting_power: number;
    downvote_manabar: {
        current_mana: string | number;
        last_update_time: number;
    };
    follow_stats: AccountFollowStats | undefined;
    reputation: number;
    profile: AccountProfile;
} | null, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        name: string;
        owner: Authority;
        active: Authority;
        posting: Authority;
        memo_key: string;
        post_count: number;
        created: string;
        posting_json_metadata: string;
        last_vote_time: string;
        last_post: string;
        json_metadata: string;
        reward_hive_balance: string;
        reward_hbd_balance: string;
        reward_vesting_hive: string;
        reward_vesting_balance: string;
        balance: string;
        hbd_balance: string;
        savings_balance: string;
        savings_hbd_balance: string;
        savings_hbd_last_interest_payment: string;
        savings_hbd_seconds_last_update: string;
        savings_hbd_seconds: string;
        next_vesting_withdrawal: string;
        pending_claimed_accounts: number;
        vesting_shares: string;
        delegated_vesting_shares: string;
        received_vesting_shares: string;
        vesting_withdraw_rate: string;
        to_withdraw: string;
        withdrawn: string;
        witness_votes: string[];
        proxy: string;
        recovery_account: string;
        proxied_vsf_votes: string[] | number[];
        voting_manabar: {
            current_mana: string | number;
            last_update_time: number;
        };
        voting_power: number;
        downvote_manabar: {
            current_mana: string | number;
            last_update_time: number;
        };
        follow_stats: AccountFollowStats | undefined;
        reputation: number;
        profile: AccountProfile;
    } | null, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: {
            name: string;
            owner: Authority;
            active: Authority;
            posting: Authority;
            memo_key: string;
            post_count: number;
            created: string;
            posting_json_metadata: string;
            last_vote_time: string;
            last_post: string;
            json_metadata: string;
            reward_hive_balance: string;
            reward_hbd_balance: string;
            reward_vesting_hive: string;
            reward_vesting_balance: string;
            balance: string;
            hbd_balance: string;
            savings_balance: string;
            savings_hbd_balance: string;
            savings_hbd_last_interest_payment: string;
            savings_hbd_seconds_last_update: string;
            savings_hbd_seconds: string;
            next_vesting_withdrawal: string;
            pending_claimed_accounts: number;
            vesting_shares: string;
            delegated_vesting_shares: string;
            received_vesting_shares: string;
            vesting_withdraw_rate: string;
            to_withdraw: string;
            withdrawn: string;
            witness_votes: string[];
            proxy: string;
            recovery_account: string;
            proxied_vsf_votes: string[] | number[];
            voting_manabar: {
                current_mana: string | number;
                last_update_time: number;
            };
            voting_power: number;
            downvote_manabar: {
                current_mana: string | number;
                last_update_time: number;
            };
            follow_stats: AccountFollowStats | undefined;
            reputation: number;
            profile: AccountProfile;
        } | null;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAccountsQueryOptions(usernames: string[]): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<FullAccount[], Error, FullAccount[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<FullAccount[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: FullAccount[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get follow count (followers and following) for an account
 */
declare function getFollowCountQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AccountFollowStats, Error, AccountFollowStats, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AccountFollowStats, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: AccountFollowStats;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get list of accounts following a user
 *
 * @param following - The account being followed
 * @param startFollower - Pagination start point (account name)
 * @param followType - Type of follow relationship (default: "blog")
 * @param limit - Maximum number of results (default: 100)
 */
declare function getFollowersQueryOptions(following: string | undefined, startFollower: string, followType?: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Follow[], Error, Follow[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Follow[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: Follow[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get list of accounts that a user is following
 *
 * @param follower - The account doing the following
 * @param startFollowing - Pagination start point (account name)
 * @param followType - Type of follow relationship (default: "blog")
 * @param limit - Maximum number of results (default: 100)
 */
declare function getFollowingQueryOptions(follower: string, startFollowing: string, followType?: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Follow[], Error, Follow[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Follow[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: Follow[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get list of users that an account has muted
 *
 * @param username - The account username
 * @param limit - Maximum number of results (default: 100)
 */
declare function getMutedUsersQueryOptions(username: string | undefined, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<string[], Error, string[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: string[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Lookup accounts by username prefix
 *
 * @param query - Username prefix to search for
 * @param limit - Maximum number of results (default: 50)
 */
declare function lookupAccountsQueryOptions(query: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<string[], Error, string[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: string[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getSearchAccountsByUsernameQueryOptions(query: string, limit?: number, excludeList?: string[]): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<string[], Error, string[], (string | string[] | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], (string | string[] | undefined)[], never> | undefined;
} & {
    queryKey: (string | string[] | undefined)[] & {
        [dataTagSymbol]: string[];
        [dataTagErrorSymbol]: Error;
    };
};

type AccountProfileToken = NonNullable<AccountProfile["tokens"]>[number];
type WalletMetadataCandidate = Partial<AccountProfileToken> & {
    currency?: string;
    show?: boolean;
    address?: string;
    publicKey?: string;
    privateKey?: string;
    username?: string;
};
interface CheckUsernameWalletsPendingResponse {
    exist: boolean;
    tokens?: WalletMetadataCandidate[];
    wallets?: WalletMetadataCandidate[];
}
declare function checkUsernameWalletsPendingQueryOptions(username: string, code: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<CheckUsernameWalletsPendingResponse, Error, CheckUsernameWalletsPendingResponse, readonly unknown[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<CheckUsernameWalletsPendingResponse, readonly unknown[], never> | undefined;
} & {
    queryKey: readonly unknown[] & {
        [dataTagSymbol]: CheckUsernameWalletsPendingResponse;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getRelationshipBetweenAccountsQueryOptions(reference: string | undefined, target: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AccountRelationship, Error, AccountRelationship, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AccountRelationship, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: AccountRelationship;
        [dataTagErrorSymbol]: Error;
    };
};

type Subscriptions = string[];
declare function getAccountSubscriptionsQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Subscriptions, Error, Subscriptions, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Subscriptions, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Subscriptions;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getBookmarksQueryOptions(activeUsername: string | undefined, code: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AccountBookmark[], Error, AccountBookmark[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AccountBookmark[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: AccountBookmark[];
        [dataTagErrorSymbol]: Error;
    };
};
declare function getBookmarksInfiniteQueryOptions(activeUsername: string | undefined, code: string | undefined, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WrappedResponse<AccountBookmark>, Error, _tanstack_react_query.InfiniteData<WrappedResponse<AccountBookmark>, unknown>, unknown[], number>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WrappedResponse<AccountBookmark>, unknown[], number> | undefined;
} & {
    queryKey: unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WrappedResponse<AccountBookmark>, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getFavoritesQueryOptions(activeUsername: string | undefined, code: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AccountFavorite[], Error, AccountFavorite[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AccountFavorite[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: AccountFavorite[];
        [dataTagErrorSymbol]: Error;
    };
};
declare function getFavoritesInfiniteQueryOptions(activeUsername: string | undefined, code: string | undefined, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WrappedResponse<AccountFavorite>, Error, _tanstack_react_query.InfiniteData<WrappedResponse<AccountFavorite>, unknown>, unknown[], number>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WrappedResponse<AccountFavorite>, unknown[], number> | undefined;
} & {
    queryKey: unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WrappedResponse<AccountFavorite>, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Query options to check if a specific account is in the active user's favorites
 * @param activeUsername - The logged-in user's username
 * @param code - Access token for authentication
 * @param targetUsername - The username to check if favorited
 * @returns Query options for checking if target is favorited
 */
declare function checkFavoriteQueryOptions(activeUsername: string | undefined, code: string | undefined, targetUsername: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<boolean, Error, boolean, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<boolean, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: boolean;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAccountRecoveriesQueryOptions(username: string | undefined, code: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<GetRecoveriesEmailResponse[], Error, GetRecoveriesEmailResponse[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<GetRecoveriesEmailResponse[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: GetRecoveriesEmailResponse[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAccountPendingRecoveryQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<any, Error, any, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<any, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: any;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAccountReputationsQueryOptions(query: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AccountReputation[], Error, AccountReputation[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AccountReputation[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: AccountReputation[];
        [dataTagErrorSymbol]: Error;
    };
};

declare const ACCOUNT_OPERATION_GROUPS: Record<OperationGroup, number[]>;
declare const ALL_ACCOUNT_OPERATIONS: number[];
interface TxPageRaw {
    entries: Transaction[];
    currentPage: number;
}
/**
 * Cursor for transaction pagination.
 * null = first request (returns newest page, API omits page param).
 * number = specific page to fetch (decrementing for older data).
 */
type TxCursor = number | null;
/**
 * Get account transaction history with pagination and filtering.
 * Uses the hafah-api REST endpoint for server-side op-type filtering
 * and real pagination metadata.
 *
 * @param username - Account name to get transactions for
 * @param limit - Number of transactions per page
 * @param group - Filter by operation group (transfers, market-orders, etc.)
 */
declare function getTransactionsInfiniteQueryOptions(username?: string, limit?: number, group?: OperationGroup | ""): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<TxPageRaw, Error, InfiniteData<TxPageRaw, TxCursor>, (string | number)[], TxCursor>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<TxPageRaw, (string | number)[], TxCursor> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<TxPageRaw, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getBotsQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<string[], Error, string[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: string[];
        [dataTagErrorSymbol]: Error;
    };
};

type PageParam$3 = {
    maxId?: number;
};
declare function getReferralsInfiniteQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<ReferralItem[], Error, _tanstack_react_query.InfiniteData<ReferralItem[], unknown>, string[], PageParam$3>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ReferralItem[], string[], PageParam$3> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<ReferralItem[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getReferralsStatsQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<ReferralStat, Error, ReferralStat, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ReferralStat, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: ReferralStat;
        [dataTagErrorSymbol]: Error;
    };
};

interface FriendsPageParam {
    startFollowing: string;
}
type FriendsPage = FriendsRow[];
/**
 * Get list of friends (following/followers) with profile information
 *
 * @param following - The account whose friends to get
 * @param mode - "following" or "followers"
 * @param followType - Type of follow relationship (default: "blog")
 * @param limit - Number of results per page (default: 100)
 * @param enabled - Whether query is enabled (default: true)
 */
declare function getFriendsInfiniteQueryOptions(following: string, mode: "following" | "followers", options?: {
    followType?: string;
    limit?: number;
    enabled?: boolean;
}): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<FriendsPage, Error, InfiniteData<FriendsPage, FriendsPageParam>, (string | number)[], FriendsPageParam>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<FriendsPage, (string | number)[], FriendsPageParam> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<FriendsPage, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Search friends (following/followers) by query string
 *
 * @param username - The account whose friends to search
 * @param mode - "following" or "followers"
 * @param query - Search query string
 */
declare function getSearchFriendsQueryOptions(username: string, mode: "following" | "followers", query: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<FriendSearchResult[], Error, FriendSearchResult[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<FriendSearchResult[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: FriendSearchResult[];
        [dataTagErrorSymbol]: Error;
    };
};

interface TrendingTag {
    comments: number;
    name: string;
    top_posts: number;
    total_payouts: string;
}

interface Fragment {
    id: string;
    title: string;
    body: string;
    created: string;
    modified: string;
}

interface EntryBeneficiaryRoute {
    account: string;
    weight: number;
}
interface EntryVote {
    voter: string;
    rshares: number;
}
interface EntryStat {
    flag_weight: number;
    gray: boolean;
    hide: boolean;
    total_votes: number;
    is_pinned?: boolean;
}
interface JsonMetadata {
    tags?: string[];
    description?: string | null;
    app?: any;
    canonical_url?: string;
    format?: string;
    original_author?: string;
    original_permlink?: string;
    image?: string[];
    pinned_reply?: string;
    location?: {
        coordinates: {
            lat: number;
            lng: number;
        };
        address?: string;
    };
}
interface JsonPollMetadata {
    content_type: "poll";
    version: number;
    question: string;
    choices: string[];
    preferred_interpretation: string;
    token: string;
    vote_change: boolean;
    hide_votes: boolean;
    filters: {
        account_age: number;
    };
    end_time: number;
    max_choices_voted?: number;
}
interface Entry$1 {
    last_update?: string;
    active_votes: EntryVote[];
    author: string;
    author_payout_value: string;
    author_reputation: number;
    author_role?: string;
    author_title?: string;
    beneficiaries: EntryBeneficiaryRoute[];
    blacklists: string[];
    body: string;
    category: string;
    children: number;
    community?: string;
    community_title?: string;
    created: string;
    total_votes?: number;
    curator_payout_value: string;
    depth: number;
    is_paidout: boolean;
    json_metadata: JsonMetadata | null;
    max_accepted_payout: string;
    net_rshares: number;
    net_votes?: number;
    tip_count?: number;
    tipped_by_viewer?: boolean;
    parent_author?: string;
    parent_permlink?: string;
    payout: number;
    payout_at: string;
    pending_payout_value: string;
    percent_hbd: number;
    permlink: string;
    post_id: any;
    id?: number;
    num?: number;
    promoted: string;
    reblogs?: number;
    reblogged_by?: string[] | any;
    replies: any[];
    stats: EntryStat | null;
    title: string;
    updated: string;
    url: string;
    original_entry?: Entry$1;
    is_optimistic?: boolean;
}
interface EntryHeader {
    author: string;
    category: string;
    permlink: string;
    depth: number;
}
interface Vote {
    percent: number;
    reputation: number;
    rshares: string;
    time: string;
    timestamp?: number;
    voter: string;
    weight: number;
}

interface PostTip {
    sender: string;
    receiver: string;
    amount: number;
    currency: string;
    memo: string;
    source: string;
    timestamp: string;
}
interface PostTipsResponse {
    meta: {
        count: number;
        totals: Record<string, number>;
    };
    list: PostTip[];
}

interface ThreadItemEntry extends Entry$1 {
    host: string;
    container: WaveEntry;
    parent?: Entry$1;
}
type WaveEntry = ThreadItemEntry & Required<Pick<Entry$1, "id">>;
interface WaveTrendingTag {
    tag: string;
    posts: number;
}
interface WaveTrendingAuthor {
    author: string;
    posts: number;
}

type DraftRewardType = "default" | "sp" | "dp";
interface DraftMetadata {
    beneficiaries?: Array<{
        account: string;
        weight: number;
    }>;
    rewardType?: DraftRewardType;
    videos?: Record<string, any>;
    poll?: any;
    [key: string]: any;
}
interface Draft {
    body: string;
    created: string;
    modified: string;
    post_type: string;
    tags_arr: string[];
    tags: string;
    timestamp: number;
    title: string;
    _id: string;
    meta?: DraftMetadata;
}
type DraftsWrappedResponse = WrappedResponse<Draft>;

interface Schedule {
    _id: string;
    username: string;
    permlink: string;
    title: string;
    body: string;
    tags: string[];
    tags_arr: string;
    schedule: string;
    original_schedule: string;
    reblog: boolean;
    status: 1 | 2 | 3 | 4;
    message: string | null;
}

interface UserImage {
    created: string;
    timestamp: number;
    url: string;
    _id: string;
}

interface VoteHistoryPageParam {
    start: number;
}
interface VoteHistoryPage {
    lastDate: number;
    lastItemFetched: number;
    entries: Entry$1[];
}
/**
 * Get account vote history with entries
 *
 * @param username - Account name to get vote history for
 * @param limit - Number of history items per page (default: 20)
 * @param filters - Additional filters to pass to get_account_history
 * @param dayLimit - Only include votes from last N days (default: 7)
 */
declare function getAccountVoteHistoryInfiniteQueryOptions<F>(username: string, options?: {
    limit?: number;
    filters?: F[];
    dayLimit?: number;
}): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<VoteHistoryPage, Error, InfiniteData<VoteHistoryPage, VoteHistoryPageParam>, (string | number)[], VoteHistoryPageParam>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<VoteHistoryPage, (string | number)[], VoteHistoryPageParam> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<VoteHistoryPage, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getProfilesQueryOptions(accounts: string[], observer?: string, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Profile[], Error, Profile[], (string | string[])[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Profile[], (string | string[])[], never> | undefined;
} & {
    queryKey: (string | string[])[] & {
        [dataTagSymbol]: Profile[];
        [dataTagErrorSymbol]: Error;
    };
};

interface BalanceHistoryPage {
    entries: BalanceHistoryEntry[];
    currentPage: number;
}
/**
 * Cursor for balance history pagination.
 * null = first request (returns the newest page).
 * number = specific page to fetch (decrementing for older data).
 */
type BalanceHistoryCursor = number | null;
/**
 * Get balance history for an account with pagination, newest first.
 * Uses the balance-api REST endpoint with direction=desc.
 *
 * Pagination: first call omits `page` to get the newest data.
 * The response includes `total_pages` so we know the current page number.
 * Subsequent calls decrement the page number to load older data.
 *
 * @param username - Account name
 * @param coinType - HIVE, HBD, or VESTS
 * @param pageSize - Number of entries per page
 */
declare function getBalanceHistoryInfiniteQueryOptions(username?: string, coinType?: BalanceCoinType, pageSize?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<BalanceHistoryPage, Error, InfiniteData<BalanceHistoryPage, BalanceHistoryCursor>, (string | number)[], BalanceHistoryCursor>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<BalanceHistoryPage, (string | number)[], BalanceHistoryCursor> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<BalanceHistoryPage, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

type BalanceAggregationGranularity = "yearly" | "monthly" | "daily";
/**
 * Get aggregated balance history for an account.
 * Uses the balance-api REST endpoint - enables yearly/monthly/daily summary
 * widgets that are impossible via RPC.
 *
 * @param username - Account name
 * @param coinType - HIVE, HBD, or VESTS
 * @param granularity - yearly (default), monthly, or daily
 */
declare function getAggregatedBalanceQueryOptions(username?: string, coinType?: BalanceCoinType, granularity?: BalanceAggregationGranularity): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AggregatedBalanceEntry[], Error, AggregatedBalanceEntry[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AggregatedBalanceEntry[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: AggregatedBalanceEntry[];
        [dataTagErrorSymbol]: Error;
    };
};

interface ProMembersResponse {
    /** Usernames of active Ecency Pro members. */
    members: string[];
    count: number;
}
/**
 * Public, cached roster of Ecency Pro members. Backed by a lightweight private-api
 * endpoint (no auth) so any surface can decorate a username with a Pro badge without
 * a per-user request. The list changes slowly, so it stays fresh for ~5 minutes.
 */
declare function getProMembersQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<ProMembersResponse, Error, ProMembersResponse, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ProMembersResponse, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: ProMembersResponse;
        [dataTagErrorSymbol]: Error;
    };
};
/** Lowercased set of member usernames for O(1), case-insensitive membership checks. */
declare function proMembersSet(members?: string[]): Set<string>;

type ProfileTokens = AccountProfile["tokens"];
interface BuildProfileMetadataArgs {
    existingProfile?: AccountProfile;
    profile?: Partial<AccountProfile> | null;
    tokens?: ProfileTokens | null;
}
declare function parseProfileMetadata(postingJsonMetadata?: string | null): AccountProfile;
declare function extractAccountProfile(data?: Pick<FullAccount, "posting_json_metadata"> | null): AccountProfile;
/**
 * Choose between two account snapshots for a posting-metadata merge base.
 * Prefers `preferred` (typically the freshest cache entry) unless `fallback`
 * carries strictly more profile keys — guarding read-modify-write flows
 * against a snapshot whose metadata was served stripped by a misbehaving node
 * while another snapshot still holds the real profile. A partial update must
 * never shrink the profile while any snapshot still knows the full one.
 */
declare function pickRicherMetadataSnapshot<T extends Pick<FullAccount, "posting_json_metadata">>(preferred: T | null | undefined, fallback: T | null | undefined): T | null | undefined;
/**
 * Parse the FULL root object of posting_json_metadata, not just its `profile`
 * key. Returns {} for missing/invalid input or a non-object root.
 *
 * `parseProfileMetadata` intentionally returns only `parsed.profile`; this
 * helper exists so writers can carry forward any sibling top-level keys that
 * live alongside `profile` (data other Hive apps may store there) instead of
 * dropping them on the next update.
 */
declare function parsePostingMetadataRoot(postingJsonMetadata?: string | null): Record<string, unknown>;
/**
 * Build the serialized `posting_json_metadata` string for an account_update2
 * operation. It deep-merges the profile (via {@link buildProfileMetadata}) over
 * the account's CURRENT on-chain profile AND preserves any non-`profile`
 * top-level keys present in the existing metadata, so a partial profile update
 * (e.g. only `pinned` or only `tokens`) never clobbers unrelated fields.
 */
declare function buildPostingJsonMetadata({ existingPostingJsonMetadata, profile, tokens, }: {
    existingPostingJsonMetadata?: string | null;
    profile?: Partial<AccountProfile> | null;
    tokens?: ProfileTokens | null;
}): string;
declare function buildProfileMetadata({ existingProfile, profile, tokens, }: BuildProfileMetadataArgs): AccountProfile;

/**
 * Parses raw account data from Hive API into FullAccount type
 * Handles profile metadata extraction from posting_json_metadata or json_metadata
 */
declare function parseAccounts(rawAccounts: any[]): FullAccount[];

declare function votingRshares(account: FullAccount, dynamicProps: DynamicProps$1, votingPowerValue: number, weight?: number): number;
declare function votingPower(account: FullAccount): number;
declare function powerRechargeTime(power: number): number;
declare function downVotingPower(account: FullAccount): number;
declare function rcPower(account: RCAccount): number;
declare function votingValue(account: FullAccount, dynamicProps: DynamicProps$1, votingPowerValue: number, weight?: number): number;

declare function getTrendingTagsQueryOptions(limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<string[], Error, _tanstack_react_query.InfiniteData<string[], unknown>, string[], {
    afterTag: string;
}>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], string[], {
        afterTag: string;
    }> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<string[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getTrendingTagsWithStatsQueryOptions(limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<TrendingTag[], Error, _tanstack_react_query.InfiniteData<TrendingTag[], unknown>, (string | number)[], {
    afterTag: string;
}>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<TrendingTag[], (string | number)[], {
        afterTag: string;
    }> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<TrendingTag[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getFragmentsQueryOptions(username: string, code?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Fragment[], Error, Fragment[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Fragment[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: Fragment[];
        [dataTagErrorSymbol]: Error;
    };
};
declare function getFragmentsInfiniteQueryOptions(username: string | undefined, code?: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WrappedResponse<Fragment>, Error, _tanstack_react_query.InfiniteData<WrappedResponse<Fragment>, unknown>, unknown[], number>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WrappedResponse<Fragment>, unknown[], number> | undefined;
} & {
    queryKey: unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WrappedResponse<Fragment>, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getPromotedPostsQuery<T extends any>(type?: "feed" | "waves"): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<T[], Error, T[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<T[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: T[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getEntryActiveVotesQueryOptions(entry?: Entry$1): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Vote[], Error, Vote[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Vote[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: Vote[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get a specific user's vote on a post
 * Useful when post has >1000 votes to efficiently get one user's vote
 *
 * @param username - The voter's username
 * @param author - The post author
 * @param permlink - The post permlink
 */
declare function getUserPostVoteQueryOptions(username: string | undefined, author: string | undefined, permlink: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Vote | null, Error, Vote | null, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Vote | null, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Vote | null;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getContentQueryOptions(author: string, permlink: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Entry$1, Error, Entry$1, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Entry$1;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getContentRepliesQueryOptions(author: string, permlink: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Entry$1[], Error, Entry$1[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Entry$1[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getPostHeaderQueryOptions(author: string, permlink: string): Omit<_tanstack_react_query.UseQueryOptions<Entry$1 | null, Error, Entry$1 | null, (string | undefined)[]>, "queryFn"> & {
    initialData: Entry$1 | (() => Entry$1 | null) | null;
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1 | null, (string | undefined)[]> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: Entry$1 | null;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getPostQueryOptions(author: string, permlink?: string, observer?: string, num?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Entry$1 | null | undefined, Error, Entry$1 | null | undefined, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1 | null | undefined, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Entry$1 | null | undefined;
        [dataTagErrorSymbol]: Error;
    };
};

declare enum SortOrder {
    trending = "trending",
    author_reputation = "author_reputation",
    votes = "votes",
    created = "created"
}
declare function sortDiscussions(entry: Entry$1, discussion: Entry$1[], order: SortOrder): Entry$1[];
declare function getDiscussionsQueryOptions(entry: Entry$1, order?: SortOrder, enabled?: boolean, observer?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Entry$1[], Error, Entry$1[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Entry$1[];
        [dataTagErrorSymbol]: Error;
    };
};
declare function getDiscussionQueryOptions(author: string, permlink: string, observer?: string, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Record<string, Entry$1> | null, Error, Record<string, Entry$1> | null, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Record<string, Entry$1> | null, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Record<string, Entry$1> | null;
        [dataTagErrorSymbol]: Error;
    };
};

type PageParam$2 = {
    author: string | undefined;
    permlink: string | undefined;
    hasNextPage: boolean;
};
type Page = Entry$1[];
declare function getAccountPostsInfiniteQueryOptions(username: string | undefined, filter?: string, limit?: number, observer?: string, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<Page, Error, InfiniteData<Page, PageParam$2>, (string | number)[], PageParam$2>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Page, (string | number)[], PageParam$2> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<Page, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};
declare function getAccountPostsQueryOptions(username: string | undefined, filter?: string, start_author?: string, start_permlink?: string, limit?: number, observer?: string, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Entry$1[], Error, Entry$1[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: Entry$1[];
        [dataTagErrorSymbol]: Error;
    };
};

type PageParam$1 = {
    author: string | undefined;
    permlink: string | undefined;
    hasNextPage: boolean;
};
interface GetPostsRankedOptions {
    resolvePosts?: boolean;
}
declare function getPostsRankedInfiniteQueryOptions(sort: string, tag: string, limit?: number, observer?: string, enabled?: boolean, _options?: GetPostsRankedOptions): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<Entry$1[], Error, InfiniteData<Entry$1[], PageParam$1>, (string | number)[], PageParam$1>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1[], (string | number)[], PageParam$1> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<Entry$1[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};
declare function getPostsRankedQueryOptions(sort: string, start_author?: string, start_permlink?: string, limit?: number, tag?: string, observer?: string, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Entry$1[], Error, Entry$1[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: Entry$1[];
        [dataTagErrorSymbol]: Error;
    };
};

interface BlogEntry {
    author: string;
    permlink: string;
    blog: string;
    reblog_on: string;
    reblogged_on: string;
    entry_id: number;
}
interface Reblog {
    author: string;
    permlink: string;
}
declare function getReblogsQueryOptions(username?: string, activeUsername?: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Reblog[], Error, Reblog[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Reblog[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: Reblog[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get list of usernames who reblogged a specific post
 */
declare function getRebloggedByQueryOptions(author?: string, permlink?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<string[], Error, string[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: string[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getSchedulesQueryOptions(activeUsername: string | undefined, code?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Schedule[], Error, Schedule[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Schedule[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: Schedule[];
        [dataTagErrorSymbol]: Error;
    };
};
declare function getSchedulesInfiniteQueryOptions(activeUsername: string | undefined, code?: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WrappedResponse<Schedule>, Error, _tanstack_react_query.InfiniteData<WrappedResponse<Schedule>, unknown>, unknown[], number>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WrappedResponse<Schedule>, unknown[], number> | undefined;
} & {
    queryKey: unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WrappedResponse<Schedule>, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getDraftsQueryOptions(activeUsername: string | undefined, code?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Draft[], Error, Draft[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Draft[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: Draft[];
        [dataTagErrorSymbol]: Error;
    };
};
declare function getDraftsInfiniteQueryOptions(activeUsername: string | undefined, code?: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WrappedResponse<Draft>, Error, _tanstack_react_query.InfiniteData<WrappedResponse<Draft>, unknown>, unknown[], number>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WrappedResponse<Draft>, unknown[], number> | undefined;
} & {
    queryKey: unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WrappedResponse<Draft>, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getImagesQueryOptions(username?: string, code?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<UserImage[], Error, UserImage[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<UserImage[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: UserImage[];
        [dataTagErrorSymbol]: Error;
    };
};
declare function getGalleryImagesQueryOptions(activeUsername: string | undefined, code?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<UserImage[], Error, UserImage[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<UserImage[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: UserImage[];
        [dataTagErrorSymbol]: Error;
    };
};
declare function getImagesInfiniteQueryOptions(username: string | undefined, code?: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WrappedResponse<UserImage>, Error, _tanstack_react_query.InfiniteData<WrappedResponse<UserImage>, unknown>, unknown[], number>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WrappedResponse<UserImage>, unknown[], number> | undefined;
} & {
    queryKey: unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WrappedResponse<UserImage>, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

interface CommentHistoryListItem {
    title: string;
    body: string;
    tags: string[];
    timestamp: string;
    v: number;
}
interface CommentHistory {
    meta: {
        count: number;
    };
    list: CommentHistoryListItem[];
}

declare function getCommentHistoryQueryOptions(author: string, permlink: string, onlyMeta?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<CommentHistory, Error, CommentHistory, (string | boolean)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<CommentHistory, (string | boolean)[], never> | undefined;
} & {
    queryKey: (string | boolean)[] & {
        [dataTagSymbol]: CommentHistory;
        [dataTagErrorSymbol]: Error;
    };
};

interface DeletedEntry {
    body: string;
    title: string;
    tags: string[];
}
declare function getDeletedEntryQueryOptions(author: string, permlink: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<CommentHistory, Error, DeletedEntry | null, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<CommentHistory, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: CommentHistory;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getPostTipsQueryOptions(author: string, permlink: string, isEnabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<PostTipsResponse, Error, PostTipsResponse, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<PostTipsResponse, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: PostTipsResponse;
        [dataTagErrorSymbol]: Error;
    };
};

type WavesFeedEntry = WaveEntry & {
    _cursor?: string;
};
interface WavesFeedParams {
    /** Scope to one or more container accounts; omit for the full combined feed. */
    containers?: string[];
    /** Only waves carrying this tag (across all containers). */
    tag?: string;
    /** Only waves from accounts this user follows (across all containers). */
    following?: string;
    /** Only this author's waves (across all containers); the per-author feed. */
    author?: string;
    /** The viewing user; exclude authors they currently mute. */
    observer?: string;
    /** Page size (default 20). */
    limit?: number;
}
/**
 * Combined cross-container waves feed (the chronological "For You" stream, and
 * the Following / Tag feeds via filters).
 *
 * A single esync-backed call returns the newest waves across every indexed
 * container, already merged and time-ordered, with keyset (cursor) pagination,
 * replacing the per-container chain-RPC scan. The optional `tag` / `following`
 * filters narrow the same stream without changing the cursor.
 */
declare function getWavesFeedQueryOptions(params?: WavesFeedParams): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WavesFeedEntry[], Error, _tanstack_react_query.InfiniteData<WavesFeedEntry[], unknown>, (string | number)[], string | undefined>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WavesFeedEntry[], (string | number)[], string | undefined> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WavesFeedEntry[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};
/**
 * Page-one of the combined feed as a plain (non-infinite) query under a distinct
 * key, for the "new waves" poll. Separate from {@link getWavesFeedQueryOptions}
 * so refreshing it never truncates the infinite feed's loaded pages.
 */
declare function getWavesLatestFeedQueryOptions(params?: WavesFeedParams): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<WavesFeedEntry[], Error, WavesFeedEntry[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WavesFeedEntry[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: WavesFeedEntry[];
        [dataTagErrorSymbol]: Error;
    };
};

/** The 3Speak video a short embeds, as returned by esync /api/waves/shorts. */
interface ShortVideo {
    platform: string;
    author: string;
    permlink: string;
    embed_url: string;
    thumbnail_url: string | null;
    duration_secs: number | null;
}
type ShortsFeedEntry = WaveEntry & {
    /** The embedded 3Speak video reference for the reels player. */
    video?: ShortVideo;
    _cursor?: string;
};
interface ShortsFeedParams {
    /** Scope to one or more container accounts; omit for the full combined feed. */
    containers?: string[];
    /** Only shorts carrying this tag (across all containers). */
    tag?: string;
    /** Only this author's shorts (across all containers). */
    author?: string;
    /** The viewing user; exclude authors they currently mute. */
    observer?: string;
    /** Page size (default 20). */
    limit?: number;
}
/**
 * Combined cross-container shorts (reels) feed: waves that embed a 3Speak video.
 *
 * Backed by esync /api/waves/shorts (via /private-api/waves/shorts). Same shape,
 * keyset pagination and filters as {@link getWavesFeedQueryOptions}, plus a
 * `video` block per item for the vertical reels player. There is no `following`
 * filter in v1.
 */
declare function getShortsFeedQueryOptions(params?: ShortsFeedParams): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<ShortsFeedEntry[], Error, _tanstack_react_query.InfiniteData<ShortsFeedEntry[], unknown>, (string | number)[], string | undefined>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ShortsFeedEntry[], (string | number)[], string | undefined> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<ShortsFeedEntry[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

type WavesPage = WaveEntry[];
type WavesCursor = WaveEntry | undefined;
declare function getWavesByHostQueryOptions(host: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WavesPage, Error, InfiniteData<WavesPage, WavesCursor>, string[], WavesCursor>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WavesPage, string[], WavesCursor> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: InfiniteData<WavesPage, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getWavesByTagQueryOptions(host: string, tag: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WaveEntry[], Error, _tanstack_react_query.InfiniteData<WaveEntry[], unknown>, string[], undefined>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WaveEntry[], string[], undefined> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WaveEntry[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getWavesFollowingQueryOptions(host: string, username?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WaveEntry[], Error, _tanstack_react_query.InfiniteData<WaveEntry[], unknown>, string[], undefined>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WaveEntry[], string[], undefined> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WaveEntry[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getWavesTrendingTagsQueryOptions(host?: string, hours?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<WaveTrendingTag[], Error, WaveTrendingTag[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WaveTrendingTag[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: WaveTrendingTag[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getWavesByAccountQueryOptions(host: string, username?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WaveEntry[], Error, _tanstack_react_query.InfiniteData<WaveEntry[], unknown>, string[], undefined>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WaveEntry[], string[], undefined> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<WaveEntry[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getWavesTrendingAuthorsQueryOptions(host: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<WaveTrendingAuthor[], Error, WaveTrendingAuthor[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WaveTrendingAuthor[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: WaveTrendingAuthor[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getNormalizePostQueryOptions(post: {
    author?: string;
    permlink?: string;
} | undefined, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Entry$1 | null, Error, Entry$1 | null, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Entry$1 | null, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Entry$1 | null;
        [dataTagErrorSymbol]: Error;
    };
};

declare function useAddFragment(username: string, code: string | undefined): _tanstack_react_query.UseMutationResult<Fragment, Error, {
    title: string;
    body: string;
}, unknown>;

declare function useEditFragment(username: string, code: string | undefined): _tanstack_react_query.UseMutationResult<Fragment, Error, {
    fragmentId: string;
    title: string;
    body: string;
}, unknown>;

declare function useRemoveFragment(username: string, code: string | undefined): _tanstack_react_query.UseMutationResult<Response, Error, {
    fragmentId: string;
}, unknown>;

declare function useAddDraft(username: string | undefined, code: string | undefined, onSuccess?: () => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<{
    drafts: Draft[];
}, Error, {
    title: string;
    body: string;
    tags: string;
    meta: DraftMetadata;
}, unknown>;

declare function useUpdateDraft(username: string | undefined, code: string | undefined, onSuccess?: () => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<{
    drafts: Draft[];
}, Error, {
    draftId: string;
    title: string;
    body: string;
    tags: string;
    meta: DraftMetadata;
}, unknown>;

declare function useDeleteDraft(username: string | undefined, code: string | undefined, onSuccess?: () => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<Record<string, unknown>, Error, {
    draftId: string;
}, {
    previousList: Draft[] | undefined;
    previousInfinite: Map<readonly unknown[], InfiniteData<WrappedResponse<Draft>, unknown> | undefined>;
} | undefined>;

declare function useAddSchedule(username: string | undefined, code: string | undefined, onSuccess?: () => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<Record<string, unknown>, Error, {
    permlink: string;
    title: string;
    body: string;
    meta: Record<string, unknown>;
    options: Record<string, unknown> | null;
    schedule: string;
    reblog: boolean;
}, unknown>;

declare function useDeleteSchedule(username: string | undefined, code: string | undefined, onSuccess?: () => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<Record<string, unknown>, Error, {
    id: string;
}, unknown>;

declare function useMoveSchedule(username: string | undefined, code: string | undefined, onSuccess?: () => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<Schedule[], Error, {
    id: string;
}, unknown>;

/**
 * Hook to add an image URL to the user's Ecency gallery
 *
 * @param username - Current user's username
 * @param code - Access token for authentication
 * @param onSuccess - Optional callback on successful addition
 * @param onError - Optional callback on error
 *
 * @example
 * const addImageMutation = useAddImage(username, code);
 * addImageMutation.mutate({ url: 'https://...' });
 */
declare function useAddImage(username: string | undefined, code: string | undefined, onSuccess?: () => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<Record<string, unknown>, Error, {
    url: string;
    code?: string;
}, unknown>;

/**
 * Hook to delete an image from the user's Ecency gallery
 *
 * @param username - Current user's username
 * @param code - Access token for authentication
 * @param onSuccess - Optional callback on successful deletion
 * @param onError - Optional callback on error
 *
 * @example
 * const deleteImageMutation = useDeleteImage(username, code);
 * deleteImageMutation.mutate({ imageId: '123' });
 */
declare function useDeleteImage(username: string | undefined, code: string | undefined, onSuccess?: () => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<Record<string, unknown>, Error, {
    imageId: string;
}, unknown>;

/**
 * Hook to upload an image file to Ecency image hosting
 *
 * @param onSuccess - Optional callback on successful upload, receives { url: string }
 * @param onError - Optional callback on error
 *
 * Note: This hook uploads to Ecency's image server and requires a signature token.
 * The token should be generated using the user's posting key signature.
 *
 * @example
 * const uploadMutation = useUploadImage(
 *   (data) => console.log('Uploaded:', data.url)
 * );
 * uploadMutation.mutate({ file, token });
 */
declare function useUploadImage(onSuccess?: (data: {
    url: string;
}) => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<{
    url: string;
}, Error, {
    file: File;
    token: string;
    signal?: AbortSignal;
}, unknown>;

/**
 * Whether the cached active_votes list already reflects the broadcast vote:
 * the voter is present for a vote (weight !== 0) or absent for an unvote
 * (weight === 0). Used to avoid stacking the SDK's post-broadcast optimistic
 * update on top of a platform-level optimistic update applied at press time.
 */
declare function isVoteAlreadyReflected(activeVotes: Array<{
    voter: string;
}>, voter: string | undefined, weight: number): boolean;
/**
 * Payload for voting on a post or comment.
 */
interface VotePayload {
    /** Author of the post/comment to vote on */
    author: string;
    /** Permlink of the post/comment to vote on */
    permlink: string;
    /** Vote weight (-10000 to 10000, where 10000 = 100% upvote, -10000 = 100% downvote) */
    weight: number;
    /** Optional estimated payout change for optimistic UI */
    estimated?: number;
}
/**
 * Post-broadcast optimistic cache update for a vote: replaces the voter's
 * active_votes record and bumps the payout by `estimated`. Skipped when the
 * cached entry already reflects this vote (voter present for a vote, absent
 * for an unvote): platforms with their own at-press optimistic layer (e.g.
 * the mobile app) have applied it by the time the broadcast resolves, and
 * stacking a second update here double-counts the payout and clobbers the
 * platform's richer vote record until the deferred invalidation.
 */
declare function applyVoteCacheUpdate(username: string | undefined, variables: VotePayload, qc?: QueryClient): void;
/**
 * React Query mutation hook for voting on posts and comments.
 *
 * This mutation broadcasts a vote operation to the Hive blockchain,
 * supporting upvotes (positive weight) and downvotes (negative weight).
 *
 * @param username - The username of the voter (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Records activity (type 120) if adapter.recordActivity is available
 * - Invalidates post cache to refetch updated vote data
 * - Invalidates voting power cache to show updated VP
 *
 * **Vote Weight:**
 * - 10000 = 100% upvote
 * - 0 = remove vote
 * - -10000 = 100% downvote
 *
 * @example
 * ```typescript
 * const voteMutation = useVote(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Upvote a post
 * voteMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post',
 *   weight: 10000
 * });
 *
 * // Remove vote
 * voteMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post',
 *   weight: 0
 * });
 *
 * // Downvote
 * voteMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post',
 *   weight: -10000
 * });
 * ```
 *
 * @remarks
 * broadcastMode: async — Votes don't require block confirmation.
 * The vote is accepted into the mempool immediately; UI can optimistically update.
 */
declare function useVote(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, VotePayload, unknown>;

/**
 * Payload for reblogging a post.
 */
interface ReblogPayload {
    /** Original post author */
    author: string;
    /** Original post permlink */
    permlink: string;
    /** If true, removes the reblog instead of creating it */
    deleteReblog?: boolean;
}
/**
 * React Query mutation hook for reblogging posts.
 *
 * This mutation broadcasts a custom_json operation to reblog (or un-reblog)
 * a post to the user's blog feed.
 *
 * @param username - The username performing the reblog (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Records activity (type 130) if adapter.recordActivity is available
 * - Invalidates blog feed cache to show the reblogged post
 * - Invalidates post cache to update reblog status
 *
 * **Reblog vs Delete:**
 * - deleteReblog: false (default) - Creates a reblog
 * - deleteReblog: true - Removes an existing reblog
 *
 * @example
 * ```typescript
 * const reblogMutation = useReblog(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Reblog a post
 * reblogMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post'
 * });
 *
 * // Remove a reblog
 * reblogMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post',
 *   deleteReblog: true
 * });
 * ```
 */
declare function useReblog(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, ReblogPayload, unknown>;

/**
 * Beneficiary account and weight.
 */
interface Beneficiary {
    /** Beneficiary account name */
    account: string;
    /** Beneficiary weight (10000 = 100%) */
    weight: number;
}
/**
 * Payload for creating a comment or post.
 */
interface CommentPayload {
    /** Author of the comment/post */
    author: string;
    /** Permlink of the comment/post */
    permlink: string;
    /** Parent author (empty string for top-level posts) */
    parentAuthor: string;
    /** Parent permlink (category/tag for top-level posts) */
    parentPermlink: string;
    /** Title of the post (empty for comments) */
    title: string;
    /** Content body */
    body: string;
    /** JSON metadata object */
    jsonMetadata: Record<string, any>;
    /** Optional: Root post author (for nested replies, used for discussions cache invalidation) */
    rootAuthor?: string;
    /** Optional: Root post permlink (for nested replies, used for discussions cache invalidation) */
    rootPermlink?: string;
    /** Optional: Comment options (beneficiaries, rewards) */
    options?: {
        /** Maximum accepted payout (e.g., "1000000.000 HBD") */
        maxAcceptedPayout?: string;
        /** Percent of payout in HBD (10000 = 100%) */
        percentHbd?: number;
        /** Allow votes on this content */
        allowVotes?: boolean;
        /** Allow curation rewards */
        allowCurationRewards?: boolean;
        /** Beneficiaries array */
        beneficiaries?: Beneficiary[];
    };
}
/**
 * React Query mutation hook for creating posts and comments.
 *
 * This mutation broadcasts a comment operation (and optionally comment_options)
 * to create a new post or reply on the Hive blockchain.
 *
 * @param username - The username creating the comment/post (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Records activity (type 100 for posts, 110 for comments) if adapter.recordActivity is available
 * - Invalidates feed caches to show the new content
 * - Invalidates parent post cache if this is a reply
 *
 * **Operations:**
 * - Always includes a comment operation
 * - Optionally includes comment_options operation for beneficiaries/rewards
 *
 * **Post vs Comment:**
 * - Post: parentAuthor = "", parentPermlink = category/tag
 * - Comment: parentAuthor = parent author, parentPermlink = parent permlink
 *
 * @example
 * ```typescript
 * const commentMutation = useComment(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Create a post
 * commentMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post-20260209',
 *   parentAuthor: '',
 *   parentPermlink: 'technology',
 *   title: 'My Awesome Post',
 *   body: 'This is the post content...',
 *   jsonMetadata: {
 *     tags: ['technology', 'hive'],
 *     app: 'ecency/3.0.0'
 *   },
 *   options: {
 *     beneficiaries: [
 *       { account: 'ecency', weight: 500 }
 *     ]
 *   }
 * });
 *
 * // Create a comment
 * commentMutation.mutate({
 *   author: 'bob',
 *   permlink: 're-alice-my-awesome-post-20260209',
 *   parentAuthor: 'alice',
 *   parentPermlink: 'my-awesome-post-20260209',
 *   title: '',
 *   body: 'Great post!',
 *   jsonMetadata: { app: 'ecency/3.0.0' }
 * });
 * ```
 */
declare function useComment(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, CommentPayload, unknown>;

/**
 * Payload for deleting a comment or post.
 */
interface DeleteCommentPayload {
    /** Author of the comment/post to delete */
    author: string;
    /** Permlink of the comment/post to delete */
    permlink: string;
    /** Optional: Parent author (for cache invalidation of discussions) */
    parentAuthor?: string;
    /** Optional: Parent permlink (for cache invalidation of discussions) */
    parentPermlink?: string;
    /** Optional: Root post author (for nested replies, used for discussions cache invalidation) */
    rootAuthor?: string;
    /** Optional: Root post permlink (for nested replies, used for discussions cache invalidation) */
    rootPermlink?: string;
}
/**
 * React Query mutation hook for deleting posts and comments.
 *
 * This mutation broadcasts a delete_comment operation to the Hive blockchain.
 * Includes optimistic removal from discussions cache with rollback on error.
 *
 * @param username - The username deleting the comment/post (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 */
declare function useDeleteComment(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, DeleteCommentPayload, unknown>;

/**
 * Payload for creating a cross-post.
 */
interface CrossPostPayload {
    /** Author of the cross-post (current user) */
    author: string;
    /** Permlink of the cross-post (usually: original-permlink-community-id) */
    permlink: string;
    /** Community ID to cross-post to (used as parent_permlink) */
    parentPermlink: string;
    /** Title of the cross-post (same as original) */
    title: string;
    /** Body of the cross-post (includes reference to original) */
    body: string;
    /** JSON metadata (must include original_author, original_permlink, tags, app) */
    jsonMetadata: Record<string, any>;
    /** Optional: Comment options (beneficiaries, rewards) */
    options?: {
        /** Maximum accepted payout (e.g., "0.000 HBD" for declined payout) */
        maxAcceptedPayout?: string;
        /** Percent of payout in HBD (10000 = 100%) */
        percentHbd?: number;
        /** Allow votes on this content */
        allowVotes?: boolean;
        /** Allow curation rewards */
        allowCurationRewards?: boolean;
    };
}
/**
 * React Query mutation hook for creating cross-posts.
 *
 * A cross-post is a special type of post that references an original post
 * and publishes it to a different community.
 *
 * @param username - The username creating the cross-post (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates feed/blog caches to show the new cross-post
 *
 * **Operations:**
 * - Always includes a comment operation (with empty parent_author for top-level post)
 * - Optionally includes comment_options operation for rewards/beneficiaries
 *
 * **Metadata Requirements:**
 * The jsonMetadata must include:
 * - `original_author`: Author of the original post
 * - `original_permlink`: Permlink of the original post
 * - `tags`: Tags for the cross-post (typically ["cross-post"])
 * - `app`: Application identifier (e.g., "ecency/3.0.0-vision")
 *
 * @example
 * ```typescript
 * const crossPostMutation = useCrossPost(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Create a cross-post
 * crossPostMutation.mutate({
 *   author: 'alice',
 *   permlink: 'great-post-hive-123456',
 *   parentPermlink: 'hive-123456', // community ID
 *   title: 'Great Post',
 *   body: 'This is a cross post of [@bob/great-post](/technology/@bob/great-post) by @alice.<br><br>Check this out!',
 *   jsonMetadata: {
 *     app: 'ecency/3.0.0-vision',
 *     tags: ['cross-post'],
 *     original_author: 'bob',
 *     original_permlink: 'great-post'
 *   },
 *   options: {
 *     maxAcceptedPayout: '0.000 HBD',
 *     allowCurationRewards: false
 *   }
 * });
 * ```
 */
declare function useCrossPost(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, CrossPostPayload, unknown>;

/**
 * Payload for updating a reply/comment.
 */
interface UpdateReplyPayload {
    /** Author of the comment/post */
    author: string;
    /** Permlink of the comment/post being updated */
    permlink: string;
    /** Parent author */
    parentAuthor: string;
    /** Parent permlink */
    parentPermlink: string;
    /** Title (empty for comments) */
    title: string;
    /** Updated content body */
    body: string;
    /** Updated JSON metadata object */
    jsonMetadata: Record<string, any>;
    /** Optional: Root post author (for nested replies, used for discussions cache invalidation) */
    rootAuthor?: string;
    /** Optional: Root post permlink (for nested replies, used for discussions cache invalidation) */
    rootPermlink?: string;
    /** Optional: Comment options (beneficiaries, rewards) */
    options?: {
        /** Maximum accepted payout (e.g., "1000000.000 HBD") */
        maxAcceptedPayout?: string;
        /** Percent of payout in HBD (10000 = 100%) */
        percentHbd?: number;
        /** Allow votes on this content */
        allowVotes?: boolean;
        /** Allow curation rewards */
        allowCurationRewards?: boolean;
        /** Beneficiaries array */
        beneficiaries?: Beneficiary[];
    };
}
/**
 * React Query mutation hook for updating existing replies/comments.
 *
 * This mutation broadcasts a comment operation (and optionally comment_options)
 * to update an existing reply/comment on the Hive blockchain.
 *
 * @param username - The username updating the comment (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates parent post cache to reflect the updated comment
 * - Invalidates discussions cache (all sort orders)
 * - Invalidates RC cache (RC decreases after updating)
 *
 * **Operations:**
 * - Always includes a comment operation
 * - Optionally includes comment_options operation for beneficiaries/rewards
 *
 * **Important:**
 * - Updates use the same comment operation as creating new comments
 * - The blockchain identifies this as an update based on matching author/permlink
 * - Only the author can update their own content
 * - Content can only be updated before payout (within 7 days)
 *
 * @example
 * ```typescript
 * const updateReplyMutation = useUpdateReply(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Update a reply
 * updateReplyMutation.mutate({
 *   author: 'alice',
 *   permlink: 're-bob-my-post-20260209',
 *   parentAuthor: 'bob',
 *   parentPermlink: 'my-post-20260209',
 *   title: '',
 *   body: 'Updated comment content!',
 *   jsonMetadata: {
 *     tags: ['comment'],
 *     app: 'ecency/3.0.0-vision'
 *   },
 *   rootAuthor: 'bob',
 *   rootPermlink: 'my-post-20260209'
 * });
 * ```
 */
declare function useUpdateReply(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, UpdateReplyPayload, unknown>;

/**
 * Payload for promoting a post using Ecency Points.
 */
interface PromotePayload {
    /** Post author */
    author: string;
    /** Post permlink */
    permlink: string;
    /** Promotion duration in days */
    duration: number;
}
/**
 * React Query mutation hook for promoting posts.
 *
 * This mutation broadcasts a custom_json operation to promote a post
 * using Ecency Points. The post will appear in promoted feeds for the
 * specified duration.
 *
 * @param username - The username promoting the post (required for broadcast, deducts points from this user)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates promoted posts cache to show newly promoted content
 * - Invalidates user points balance
 * - Invalidates post cache to update promotion status
 *
 * **Operation Details:**
 * - Uses custom_json operation with id "ecency_promote"
 * - JSON: {"user": "username", "author": "postauthor", "permlink": "postpermlink", "duration": 7}
 * - Authority: Active key (required for point spending)
 *
 * **Cost:**
 * - Costs Ecency Points based on duration
 * - User must have sufficient points balance
 *
 * @example
 * ```typescript
 * const promoteMutation = usePromote(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Promote a post for 7 days
 * promoteMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-great-post',
 *   duration: 7
 * });
 * ```
 */
declare function usePromote(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, PromotePayload, unknown>;

/**
 * SDK-level entry cache utilities. These operate on SDK cache keys
 * (["posts", "entry", "/@author/permlink"]).
 *
 * Web layer can bridge these to its own QueryIdentifiers.ENTRY keys
 * during the migration period.
 */
declare namespace EntriesCacheManagement {
    function updateVotes(author: string, permlink: string, votes: EntryVote[], payout: number, qc?: QueryClient): void;
    function updateReblogsCount(author: string, permlink: string, count: number, qc?: QueryClient): void;
    function updateRepliesCount(author: string, permlink: string, count: number, qc?: QueryClient): void;
    function addReply(reply: Entry$1, parentAuthor: string, parentPermlink: string, qc?: QueryClient): void;
    function updateEntries(entries: Entry$1[], qc?: QueryClient): void;
    function invalidateEntry(author: string, permlink: string, qc?: QueryClient): void;
    function getEntry(author: string, permlink: string, qc?: QueryClient): Entry$1 | undefined;
}

/**
 * Adds an optimistic entry to all discussions caches for the given root post.
 * Uses predicate matching to find all sort order variants.
 */
declare function addOptimisticDiscussionEntry(entry: Entry$1, rootAuthor: string, rootPermlink: string, qc?: QueryClient): void;
/**
 * Removes an entry from all discussions caches for the given root post.
 * Returns the previous state for rollback.
 */
declare function removeOptimisticDiscussionEntry(author: string, permlink: string, rootAuthor: string, rootPermlink: string, qc?: QueryClient): Map<readonly unknown[], Entry$1[]>;
/**
 * Restores discussion cache snapshots (for rollback on error).
 */
declare function restoreDiscussionSnapshots(snapshots: Map<readonly unknown[], Entry$1[]>, qc?: QueryClient): void;
/**
 * Updates a specific entry in the SDK entry cache.
 * Returns the previous entry for rollback.
 */
declare function updateEntryInCache(author: string, permlink: string, updates: Partial<Entry$1>, qc?: QueryClient): Entry$1 | undefined;
/**
 * Restores an entry in cache (for rollback on error).
 */
declare function restoreEntryInCache(author: string, permlink: string, entry: Entry$1, qc?: QueryClient): void;

type EntryWithPostId = Entry$1 & {
    post_id: number;
};
declare function normalizeWaveEntryFromApi(entry: (Entry$1 & {
    post_id: number;
    container?: EntryWithPostId | null;
    parent?: EntryWithPostId | null;
}) | null | undefined, host: string): WaveEntry | null;
declare function toEntryArray(x: unknown): Entry$1[];
declare function getVisibleFirstLevelThreadItems(container: WaveEntry): Promise<Entry$1[]>;
declare function mapThreadItemsToWaveEntries(items: Entry$1[], container: WaveEntry, host: string): WaveEntry[];

type ValidatePostCreatingOptions = {
    delays?: number[];
};
declare function validatePostCreating(author: string, permlink: string, attempts?: number, options?: ValidatePostCreatingOptions): Promise<void>;

type ActivityType = "post-created" | "post-updated" | "post-scheduled" | "draft-created" | "video-published" | "legacy-post-created" | "legacy-post-updated" | "legacy-post-scheduled" | "legacy-draft-created" | "legacy-video-published" | "perks-points-by-qr" | "perks-account-boost" | "perks-promote" | "perks-boost-plus" | "points-claimed" | "spin-rolled" | "signed-up-with-wallets" | "signed-up-with-email";
interface RecordActivityOptions {
    url?: string;
    domain?: string;
}
declare function useRecordActivity(username: string | undefined, activityType: ActivityType, options?: RecordActivityOptions): _tanstack_react_query.UseMutationResult<void, Error, void, unknown>;

type index_RecordActivityOptions = RecordActivityOptions;
declare const index_useRecordActivity: typeof useRecordActivity;
declare namespace index {
  export { type index_RecordActivityOptions as RecordActivityOptions, index_useRecordActivity as useRecordActivity };
}

interface LeaderBoardItem {
    _id: string;
    count: number;
    points: string;
    /** true when the user completed all of today's daily quests (recognition badge) */
    quests_done?: boolean;
}
type LeaderBoardDuration = "day" | "week" | "month";

interface CurationItem {
    efficiency: number;
    account: string;
    /** Curation reward for the period, in Hive Power. */
    hp: number;
    /**
     * @deprecated Alias of `hp`, kept while consumers migrate. The value has
     * always been Hive Power despite the name, which caused a double-conversion
     * bug downstream. Read `hp` instead.
     */
    vests: number;
    votes: number;
    uniques: number;
}
type CurationDuration = "day" | "week" | "month";

interface PageStatsResponse {
    results: [
        {
            metrics: number[];
            dimensions: string[];
        }
    ];
    query: {
        site_id: string;
        metrics: string[];
        date_range: string[];
        filters: string[];
    };
}

declare function getDiscoverLeaderboardQueryOptions(duration: LeaderBoardDuration): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<LeaderBoardItem[], Error, LeaderBoardItem[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<LeaderBoardItem[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: LeaderBoardItem[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getDiscoverCurationQueryOptions(duration: CurationDuration): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<CurationItem[], Error, CurationItem[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<CurationItem[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: CurationItem[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get page statistics from the private analytics API
 *
 * @param url - URL to get stats for
 * @param dimensions - Dimensions to query (default: [])
 * @param metrics - Metrics to query (default: ["visitors", "pageviews", "visit_duration"])
 * @param dateRange - Date range for the query (e.g. "day", "7d", "30d", "all")
 */
declare function getPageStatsQueryOptions(url: string, dimensions?: string[], metrics?: string[], dateRange?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<PageStatsResponse, Error, PageStatsResponse, (string | string[] | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<PageStatsResponse, (string | string[] | undefined)[], never> | undefined;
} & {
    queryKey: (string | string[] | undefined)[] & {
        [dataTagSymbol]: PageStatsResponse;
        [dataTagErrorSymbol]: Error;
    };
};

interface ThreeSpeakVideo {
    app: string;
    beneficiaries: string;
    category: string;
    community: unknown | null;
    created: string;
    declineRewards: boolean;
    description: string;
    donations: boolean;
    duration: number;
    encoding: Record<number, boolean>;
    encodingProgress: number;
    encoding_price_steem: string;
    filename: string;
    firstUpload: boolean;
    fromMobile: boolean;
    height: unknown;
    hive: string;
    indexed: boolean;
    is3CJContent: boolean;
    isNsfwContent: boolean;
    isReel: boolean;
    isVOD: boolean;
    job_id: string;
    language: string;
    local_filename: string;
    lowRc: boolean;
    needsBlockchainUpdate: boolean;
    originalFilename: string;
    owner: string;
    paid: boolean;
    permlink: string;
    postToHiveBlog: boolean;
    publish_type: string;
    reducedUpvote: boolean;
    rewardPowerup: boolean;
    size: number;
    status: string;
    tags_v2: unknown[];
    thumbUrl: string;
    thumbnail: string;
    title: string;
    updateSteem: boolean;
    upload_type: string;
    upvoteEligible: boolean;
    video_v2: string;
    views: number;
    votePercent: number;
    width: unknown;
    __v: number;
    _id: string;
}

declare function getAccountTokenQueryOptions(username: string | undefined, accessToken: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<any, Error, any, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<any, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: any;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAccountVideosQueryOptions(username: string | undefined, accessToken: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<ThreeSpeakVideo[], Error, ThreeSpeakVideo[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ThreeSpeakVideo[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: ThreeSpeakVideo[];
        [dataTagErrorSymbol]: Error;
    };
};

declare const queries$1_getAccountTokenQueryOptions: typeof getAccountTokenQueryOptions;
declare const queries$1_getAccountVideosQueryOptions: typeof getAccountVideosQueryOptions;
declare namespace queries$1 {
  export { queries$1_getAccountTokenQueryOptions as getAccountTokenQueryOptions, queries$1_getAccountVideosQueryOptions as getAccountVideosQueryOptions };
}

declare const ThreeSpeakIntegration: {
    queries: typeof queries$1;
};

declare function getDecodeMemoQueryOptions(username: string, memo: string, accessToken: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<any, Error, any, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<any, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: any;
        [dataTagErrorSymbol]: Error;
    };
};

declare const queries_getDecodeMemoQueryOptions: typeof getDecodeMemoQueryOptions;
declare namespace queries {
  export { queries_getDecodeMemoQueryOptions as getDecodeMemoQueryOptions };
}

declare const HiveSignerIntegration: {
    queries: typeof queries;
};

declare function getHivePoshLinksQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    twitter: {
        username: any;
        profile: any;
    };
    reddit: {
        username: any;
        profile: any;
    };
} | null, Error, {
    twitter: {
        username: any;
        profile: any;
    };
    reddit: {
        username: any;
        profile: any;
    };
} | null, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        twitter: {
            username: any;
            profile: any;
        };
        reddit: {
            username: any;
            profile: any;
        };
    } | null, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: {
            twitter: {
                username: any;
                profile: any;
            };
            reddit: {
                username: any;
                profile: any;
            };
        } | null;
        [dataTagErrorSymbol]: Error;
    };
};

interface StatsResponse {
    results: [
        {
            metrics: number[];
            dimensions: string[];
        }
    ];
    query: {
        site_id: string;
        metrics: string[];
        date_range: string[];
        filters: string[];
    };
}
interface UseStatsQueryOptions {
    url: string;
    dimensions?: string[];
    metrics?: string[];
    /**
     * Which dimension the `url` is matched against. `event:page` (default) matches
     * any visit that viewed the page; `visit:entry_page` matches only visits that
     * landed on it. The API route validates this against an allow-list.
     */
    filterBy?: "event:page" | "visit:entry_page";
    /**
     * Plausible `date_range`. Pass a tuple `[from, to]` (ISO `YYYY-MM-DD`) to scope
     * the query — e.g. a post's creation date through today. Scoping is essential:
     * ClickHouse orders events by `(site_id, toDate(timestamp), …)` and partitions
     * by month, so a bounded range prunes to a few granules instead of scanning the
     * whole history. Omitting it falls back to the route default (`"all"`), which on
     * a high-traffic site is a multi-second full scan. Plausible also accepts the
     * relative keywords `"day"`, `"7d"`, `"30d"`, `"all"`.
     */
    dateRange?: string | [string, string];
    enabled?: boolean;
}
declare function getStatsQueryOptions({ url, dimensions, metrics, filterBy, dateRange, enabled, }: UseStatsQueryOptions): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<StatsResponse, Error, StatsResponse, (string | string[] | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<StatsResponse, (string | string[] | undefined)[], never> | undefined;
} & {
    queryKey: (string | string[] | undefined)[] & {
        [dataTagSymbol]: StatsResponse;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getRcStatsQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<any, Error, any, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<any, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: any;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAccountRcQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<RCAccount[], Error, RCAccount[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<RCAccount[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: RCAccount[];
        [dataTagErrorSymbol]: Error;
    };
};

interface RcStats {
    block: number;
    budget: number[];
    comment: number;
    ops: Ops;
    payers: Payer[];
    pool: number[];
    regen: number;
    share: number[];
    stamp: string;
    transfer: number;
    vote: number;
}
interface Ops {
    account_create_operation: OperationCost;
    account_update2_operation: OperationCost;
    account_update_operation: OperationCost;
    account_witness_proxy_operation: OperationCost;
    account_witness_vote_operation: OperationCost;
    cancel_transfer_from_savings_operation: OperationCost;
    change_recovery_account_operation: OperationCost;
    claim_account_operation: OperationCost;
    claim_reward_balance_operation: OperationCost;
    collateralized_convert_operation: OperationCost;
    comment_operation: OperationCost;
    comment_options_operation: OperationCost;
    convert_operation: OperationCost;
    create_claimed_account_operation: OperationCost;
    custom_json_operation: OperationCost;
    delegate_vesting_shares_operation: OperationCost;
    delete_comment_operation: OperationCost;
    feed_publish_operation: OperationCost;
    limit_order_cancel_operation: OperationCost;
    limit_order_create_operation: OperationCost;
    multiop: OperationCost;
    recover_account_operation: OperationCost;
    recurrent_transfer_operation: OperationCost;
    request_account_recovery_operation: OperationCost;
    set_withdraw_vesting_route_operation: OperationCost;
    transfer_from_savings_operation: OperationCost;
    transfer_operation: OperationCost;
    transfer_to_savings_operation: OperationCost;
    transfer_to_vesting_operation: OperationCost;
    update_proposal_votes_operation: OperationCost;
    vote_operation: OperationCost;
    withdraw_vesting_operation: OperationCost;
    witness_set_properties_operation: OperationCost;
    witness_update_operation: OperationCost;
}
interface OperationCost {
    avg_cost: number;
    count: number;
}
interface Payer {
    cant_afford?: CantAfford;
    count: number;
    lt10?: number;
    lt20?: number;
    lt5?: number;
    rank: number;
}
interface CantAfford {
    comment: number;
    transfer: number;
    vote: number;
}

/**
 * Operations the RC pre-check can estimate. Mirrors the keys exposed by
 * `rc_api.get_rc_stats` (see {@link RcStats}["ops"]).
 */
type RcPrecheckOperation = keyof RcStats["ops"];
interface RcPrecheckInput {
    /** From `getAccountRcQueryOptions(username)` -> rcAccounts[0]. */
    rcAccount: RCAccount | null | undefined;
    /** From `getRcStatsQueryOptions()`. */
    rcStats: RcStats | null | undefined;
    /** The operation the user is about to broadcast. */
    operation: RcPrecheckOperation;
    /**
     * Safety multiplier applied to the average operation cost when deciding
     * whether the broadcast will "likely fail". Actual on-chain cost varies with
     * network load, so we keep headroom. Defaults to 1.2.
     */
    buffer?: number;
}
interface RcPrecheckResult {
    /** Both inputs were available, so the estimate is meaningful. */
    ready: boolean;
    /** Current RC mana of the account. */
    currentMana: number;
    /** Maximum RC mana of the account. */
    maxMana: number;
    /** Average RC cost of the operation. */
    avgCost: number;
    /** Average cost padded by `buffer`. */
    estimatedCost: number;
    /** `currentMana` is below the padded estimate -> broadcast likely fails. */
    willLikelyFail: boolean;
    /** RC shortfall vs the padded estimate (0 when not failing). */
    deficit: number;
    /** Roughly how many such operations the account can still afford. */
    remaining: number;
}
/**
 * Pure, client-side estimate of whether an account has enough Resource Credits
 * to broadcast an operation, used to warn the user BEFORE they submit instead
 * of failing afterwards with the chain's "Please wait to transact" error.
 *
 * It is intentionally approximate: it uses the network-wide average cost from
 * `rc_api.get_rc_stats`, padded by a buffer. Treat `willLikelyFail` as a hint,
 * never a hard gate - the publish/comment/vote action must stay non-blocking.
 */
declare function estimateRcPrecheck({ rcAccount, rcStats, operation, buffer, }: RcPrecheckInput): RcPrecheckResult;

interface GetGameStatus {
    key: string;
    remaining: number;
    status: number;
    next_date: string;
    wait_secs: number;
}

interface GameClaim {
    score: number;
}

declare function getGameStatusCheckQueryOptions(username: string | undefined, code: string | undefined, gameType: "spin"): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<GetGameStatus, Error, GetGameStatus, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<GetGameStatus, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: GetGameStatus;
        [dataTagErrorSymbol]: Error;
    };
};

declare function useGameClaim(username: string | undefined, code: string | undefined, gameType: "spin", key: string): _tanstack_react_query.UseMutationResult<GameClaim, Error, void, unknown>;

/**
 * Daily/weekly/monthly quest tracker shapes returned by `/private-api/quests`.
 * The endpoint is read-only: it aggregates the user's existing, already-rewarded
 * point activity. It mints nothing.
 */
interface QuestMilestone {
    /** rolling progress toward the next milestone (e.g. check-ins since the last bonus) */
    progress: number;
    /** milestone threshold (e.g. EXTRA_CHECKIN_FOR = 48) */
    at: number;
    /** points awarded when the milestone is reached */
    reward: number;
}
interface DailyCheckinQuest {
    id: "checkin";
    /** check-ins recorded today */
    progress: number;
    /** points per check-in */
    reward_each: number;
    milestone: QuestMilestone;
}
interface DailyContentQuest {
    id: "post" | "comment" | "vote" | "reblog";
    /** actions of this type pointed today */
    progress: number;
    /** soft daily cap — action count at which the existing reward decays to ~0 */
    cap: number;
}
type DailyQuest = DailyCheckinQuest | DailyContentQuest;
interface PeriodQuest {
    id: string;
    progress: number;
}
interface QuestStreak {
    current: number;
    best: number;
    /** today has no check-in yet but a streak is active — nudge the user */
    at_risk: boolean;
    /**
     * Unused streak freezes the user holds (auto-consumed to protect a missed day).
     * Optional: absent on quests responses cached before this field shipped.
     */
    freezes_owned?: number;
}
/** Result of buying a streak freeze (`/private-api/streak-freeze/buy`). */
interface StreakFreezeBuyResult {
    /** freezes owned after the purchase */
    owned: number;
    /** the user's Points balance after the debit */
    points: number;
}
interface QuestPeriod {
    /** ISO date (UTC) of the current daily window */
    day: string;
    /** ISO week id, e.g. "2026-W21" */
    week: string;
    /** "YYYY-MM" */
    month: string;
    /** seconds until the daily window resets (next 00:00 UTC) */
    day_resets_in_secs: number;
}
interface QuestsResponse {
    period: QuestPeriod;
    daily: DailyQuest[];
    weekly: PeriodQuest[];
    monthly: PeriodQuest[];
    streak: QuestStreak;
}

/**
 * Read-only daily/weekly/monthly quest progress for a user. Aggregates the existing
 * points ledger (no auth required — same sensitivity as `/private-api/points`).
 */
declare function getQuestsQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<QuestsResponse, Error, QuestsResponse, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<QuestsResponse, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: QuestsResponse;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Shared quest catalog — the single source of truth for which quests exist, their
 * encouraging goals, copy keys and icon hints. Lives in the SDK so the web and mobile
 * clients render an identical, harmonized set. The backend (`/private-api/quests`)
 * returns raw progress + the reward `cap`; this catalog layers the presentation.
 *
 * `goal` is an *encouraging, reachable* daily target and is intentionally independent of
 * the backend reward `cap` (the point at which the existing reward decays to ~0). It is
 * tunable here without any backend change.
 */
type QuestTier = "daily" | "weekly" | "monthly";
interface QuestCatalogEntry {
    id: string;
    tier: QuestTier;
    /** encouraging, reachable target for the period (tunable, not the reward cap) */
    goal: number;
    /** i18n key suffix; clients resolve e.g. `quests.<i18nKey>.title` / `.desc` */
    i18nKey: string;
    /** semantic icon hint; each client maps it to its own icon set */
    icon: string;
}
declare const QUEST_CATALOG: QuestCatalogEntry[];
declare function getQuestCatalogEntry(tier: QuestTier, id: string): QuestCatalogEntry | undefined;
declare const STREAK_FREEZE_PRICE = 300;
declare const STREAK_FREEZE_MAX_OWNED = 2;

/**
 * POST a single streak-freeze purchase. Throws on a non-2xx with the server's
 * `.status` + parsed `.data` attached so the caller can branch on 402 (insufficient)
 * / 409 (max owned). Exported for unit testing; the hook below wraps it.
 */
declare function buyStreakFreezeRequest(code: string): Promise<StreakFreezeBuyResult>;
/**
 * Buy one streak freeze (a Points-only sink). The server debits Points, caps owned
 * inventory, and is idempotent per key. On success the quests + points caches are
 * invalidated so the owned count and balance refresh. A 402 (insufficient) / 409 (max
 * owned) is rethrown with `.status` + `.data` so the caller can route to a Points top-up.
 */
declare function useBuyStreakFreeze(username: string | undefined, code: string | undefined): _tanstack_react_query.UseMutationResult<StreakFreezeBuyResult, Error, void, unknown>;

/**
 * Payload for subscribing to a community.
 */
interface SubscribeCommunityPayload {
    /** Community name (e.g., "hive-123456") */
    community: string;
}
/**
 * React Query mutation hook for subscribing to a community.
 *
 * This mutation broadcasts a subscribe operation to the Hive blockchain,
 * adding the community to the user's subscription list.
 *
 * @param username - The username subscribing (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates subscriptions cache to show updated subscription list
 * - Invalidates community cache to refetch updated subscriber count
 *
 * **Operation Details:**
 * - Uses custom_json operation with id "community"
 * - Action: ["subscribe", {"community": "hive-123456"}]
 * - Authority: Posting key
 *
 * @example
 * ```typescript
 * const subscribeMutation = useSubscribeCommunity(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Subscribe to a community
 * subscribeMutation.mutate({
 *   community: 'hive-123456'
 * });
 * ```
 */
declare function useSubscribeCommunity(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, SubscribeCommunityPayload, unknown>;

/**
 * Payload for unsubscribing from a community.
 */
interface UnsubscribeCommunityPayload {
    /** Community name (e.g., "hive-123456") */
    community: string;
}
/**
 * React Query mutation hook for unsubscribing from a community.
 *
 * This mutation broadcasts an unsubscribe operation to the Hive blockchain,
 * removing the community from the user's subscription list.
 *
 * @param username - The username unsubscribing (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates subscriptions cache to show updated subscription list
 * - Invalidates community cache to refetch updated subscriber count
 *
 * **Operation Details:**
 * - Uses custom_json operation with id "community"
 * - Action: ["unsubscribe", {"community": "hive-123456"}]
 * - Authority: Posting key
 *
 * @example
 * ```typescript
 * const unsubscribeMutation = useUnsubscribeCommunity(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Unsubscribe from a community
 * unsubscribeMutation.mutate({
 *   community: 'hive-123456'
 * });
 * ```
 */
declare function useUnsubscribeCommunity(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, UnsubscribeCommunityPayload, unknown>;

/**
 * Payload for muting/unmuting a post in a community.
 */
interface MutePostPayload {
    /** Community name (e.g., "hive-123456") */
    community: string;
    /** Post author */
    author: string;
    /** Post permlink */
    permlink: string;
    /** Mute reason/notes (required even for unmute) */
    notes: string;
    /** True to mute, false to unmute */
    mute: boolean;
}
/**
 * React Query mutation hook for muting/unmuting posts in a community.
 *
 * This mutation broadcasts a custom_json operation to mute (or unmute)
 * a post within a community. Only community moderators/admins can mute posts.
 *
 * @param username - The username performing the mute (required for broadcast, must have permission)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates community posts cache to hide muted content
 * - Invalidates post cache to update mute status
 * - Invalidates feed cache to remove muted posts from feeds
 *
 * **Operation Details:**
 * - Uses custom_json operation with id "community"
 * - Action: ["mutePost", {"community": "hive-123456", "account": "author", "permlink": "post", "notes": "reason"}]
 * - Action (unmute): ["unmutePost", {"community": "hive-123456", "account": "author", "permlink": "post", "notes": "reason"}]
 * - Authority: Posting key
 *
 * **Mute vs Unmute:**
 * - mute: true - Mutes the post (hides from community feed)
 * - mute: false - Unmutes the post (restores to community feed)
 *
 * **Permission:**
 * - Only community moderators and admins can mute/unmute posts
 * - Attempting to mute without permission will fail with an error
 *
 * @example
 * ```typescript
 * const mutePostMutation = useMutePost(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Mute a post
 * mutePostMutation.mutate({
 *   community: 'hive-123456',
 *   author: 'alice',
 *   permlink: 'my-post',
 *   notes: 'Violates community guidelines',
 *   mute: true
 * });
 *
 * // Unmute a post
 * mutePostMutation.mutate({
 *   community: 'hive-123456',
 *   author: 'alice',
 *   permlink: 'my-post',
 *   notes: 'Resolved after editing',
 *   mute: false
 * });
 * ```
 */
declare function useMutePost(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, MutePostPayload, unknown>;

/**
 * Payload for setting a user's role in a community.
 */
interface SetCommunityRolePayload {
    /** Account to set role for */
    account: string;
    /** Role name (e.g., "admin", "mod", "member", "guest") */
    role: string;
}
/**
 * React Query mutation hook for setting a user's role in a community.
 *
 * This mutation broadcasts a setRole operation to the Hive blockchain,
 * updating the role of a community member. Only users with appropriate
 * permissions (community owner/admin) can set roles.
 *
 * @param community - Community name (e.g., "hive-123456")
 * @param username - The username setting the role (required for broadcast, must have permission)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates community cache to refetch updated team member list
 *
 * **Operation Details:**
 * - Uses custom_json operation with id "community"
 * - Action: ["setRole", {"community": "hive-123456", "account": "user", "role": "mod"}]
 * - Authority: Posting key
 *
 * **Role Types:**
 * - "owner" - Community owner (full permissions)
 * - "admin" - Administrator (can manage settings and team)
 * - "mod" - Moderator (can mute posts/users)
 * - "member" - Regular member (no special permissions)
 * - "guest" - Remove user from team (empty string also works)
 *
 * @example
 * ```typescript
 * const setRoleMutation = useSetCommunityRole('hive-123456', username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Set a user as moderator
 * setRoleMutation.mutate({
 *   account: 'alice',
 *   role: 'mod'
 * });
 *
 * // Remove a user from the team
 * setRoleMutation.mutate({
 *   account: 'bob',
 *   role: 'guest'
 * });
 * ```
 */
declare function useSetCommunityRole(community: string, username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, SetCommunityRolePayload, unknown>;

/**
 * Payload for updating community properties.
 * Matches the CommunityProps interface from builders.
 */
type UpdateCommunityPayload = CommunityProps;
/**
 * React Query mutation hook for updating community properties.
 *
 * This mutation broadcasts an updateProps operation to the Hive blockchain,
 * modifying the community's metadata and settings. Only community admins
 * can update community properties.
 *
 * @param community - Community name (e.g., "hive-123456")
 * @param username - The username updating the community (required for broadcast, must be admin)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates community cache to refetch updated properties
 *
 * **Operation Details:**
 * - Uses custom_json operation with id "community"
 * - Action: ["updateProps", {"community": "hive-123456", "props": {...}}]
 * - Authority: Posting key
 *
 * **Properties:**
 * - title - Community display title
 * - about - Short description/tagline
 * - lang - Primary language code (e.g., "en")
 * - description - Full community description (markdown supported)
 * - flag_text - Custom text shown when flagging posts
 * - is_nsfw - Whether community contains NSFW content
 *
 * @example
 * ```typescript
 * const updateMutation = useUpdateCommunity('hive-123456', username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Update community properties
 * updateMutation.mutate({
 *   title: 'My Awesome Community',
 *   about: 'A place for awesome people',
 *   lang: 'en',
 *   description: '# Welcome\nThis is our community description',
 *   flag_text: 'Please explain why this content violates our rules',
 *   is_nsfw: false
 * });
 * ```
 */
declare function useUpdateCommunity(community: string, username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, CommunityProps, unknown>;

/**
 * Payload for community rewards registration.
 */
interface CommunityRewardsRegisterPayload {
    /** Community account name (usually the community creator's account) */
    name: string;
}
/**
 * React Query mutation hook for registering to receive community rewards.
 *
 * This mutation broadcasts a custom_json operation to register a community
 * account to receive Ecency Points rewards for community activity.
 *
 * @param username - The username registering for community rewards (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates community cache to update registration status
 * - Invalidates points balance to reflect potential initial rewards
 *
 * **Operation Details:**
 * - Uses custom_json operation with id "ecency_registration"
 * - JSON: {"name": "communityname"}
 * - Authority: Active key (required for registration)
 *
 * **Purpose:**
 * - Enables communities to receive Ecency Points for activity
 * - One-time registration per community
 * - Can only be done by the community owner/creator
 *
 * @example
 * ```typescript
 * const registerMutation = useRegisterCommunityRewards(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Register community for rewards
 * registerMutation.mutate({
 *   name: 'hive-123456'
 * });
 * ```
 */
declare function useRegisterCommunityRewards(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, CommunityRewardsRegisterPayload, unknown>;

interface PinPostPayload {
    community: string;
    account: string;
    permlink: string;
    pin: boolean;
}
declare function usePinPost(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, PinPostPayload, unknown>;

declare enum ROLES {
    OWNER = "owner",
    ADMIN = "admin",
    MOD = "mod",
    MEMBER = "member",
    GUEST = "guest",
    MUTED = "muted"
}
declare const roleMap: Record<string, string[]>;
type CommunityTeam = Array<Array<string>>;
type CommunityRole = (typeof ROLES)[keyof typeof ROLES];
type CommunityType = "Topic" | "Journal" | "Council";
interface Community {
    about: string;
    admins?: string[];
    avatar_url: string;
    created_at: string;
    description: string;
    flag_text: string;
    id: number;
    is_nsfw: boolean;
    lang: string;
    name: string;
    num_authors: number;
    num_pending: number;
    subscribers: number;
    sum_pending: number;
    settings?: any;
    team: CommunityTeam;
    title: string;
    type_id: number;
}
type Communities = Community[];

type Subscription = string[];

interface AccountNotification {
    date: string;
    id: number;
    msg: string;
    score: number;
    type: string;
    url: string;
}

interface RewardedCommunity {
    start_date: string;
    total_rewards: string;
    name: string;
}

declare function getCommunitiesQueryOptions(sort: string, query?: string, limit?: number, observer?: string | undefined, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Communities, Error, Communities, (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Communities, (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: Communities;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getCommunityContextQueryOptions(username: string | undefined, communityName: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    role: any;
    subscribed: any;
}, Error, {
    role: any;
    subscribed: any;
}, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        role: any;
        subscribed: any;
    }, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: {
            role: any;
            subscribed: any;
        };
        [dataTagErrorSymbol]: Error;
    };
};

declare function getCommunityQueryOptions(name: string | undefined, observer?: string | undefined, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Community | null, Error, Community | null, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Community | null, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: Community | null;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get list of subscribers for a community
 *
 * @param communityName - The community name (e.g., "hive-123456")
 */
declare function getCommunitySubscribersQueryOptions(communityName: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Subscription[], Error, Subscription[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Subscription[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Subscription[];
        [dataTagErrorSymbol]: Error;
    };
};

type NotifPage = AccountNotification[];
type NotifCursor = number | null;
/**
 * Get account notifications for a community (bridge API)
 *
 * @param account - The account/community name
 * @param limit - Number of notifications per page
 */
declare function getAccountNotificationsInfiniteQueryOptions(account: string, limit: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<NotifPage, Error, InfiniteData<NotifPage, NotifCursor>, (string | number)[], NotifCursor>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<NotifPage, (string | number)[], NotifCursor> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<NotifPage, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getRewardedCommunitiesQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<RewardedCommunity[], Error, RewardedCommunity[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<RewardedCommunity[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: RewardedCommunity[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getCommunityType(name: string, type_id: number): CommunityType;
declare function getCommunityPermissions({ communityType, userRole, subscribed, }: {
    communityType: CommunityType;
    userRole: CommunityRole;
    subscribed: boolean;
}): {
    canPost: boolean;
    canComment: boolean;
    isModerator: boolean;
};

declare function getNotificationsUnreadCountQueryOptions(activeUsername: string | undefined, code: string | undefined): Omit<_tanstack_react_query.UseQueryOptions<number, Error, number, (string | undefined)[]>, "queryFn"> & {
    initialData: number | (() => number);
    queryFn?: _tanstack_react_query.QueryFunction<number, (string | undefined)[]> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: number;
        [dataTagErrorSymbol]: Error;
    };
};

declare enum NotificationFilter {
    VOTES = "rvotes",
    MENTIONS = "mentions",
    FAVORITES = "nfavorites",
    BOOKMARKS = "nbookmarks",
    FOLLOWS = "follows",
    REPLIES = "replies",
    REBLOGS = "reblogs",
    TRANSFERS = "transfers",
    DELEGATIONS = "delegations",
    PAYOUTS = "payouts",
    SCHEDULED_PUBLISHED = "scheduled_published",
    ACCOUNT_UPDATES = "account_updates",
    WEEKLY_EARNINGS = "weekly_earnings"
}

declare enum NotifyTypes {
    VOTE = 1,
    MENTION = 2,
    FOLLOW = 3,
    COMMENT = 4,
    RE_BLOG = 5,
    TRANSFERS = 6,
    DELEGATIONS = 10,
    FAVORITES = 13,
    BOOKMARKS = 15,
    PAYOUTS = 19,
    ACCOUNT_UPDATE = 20,
    WEEKLY_EARNINGS = 21,
    SCHEDULED_PUBLISHED = 22,
    ALLOW_NOTIFY = "ALLOW_NOTIFY"
}
declare const ALL_NOTIFY_TYPES: readonly [NotifyTypes.VOTE, NotifyTypes.MENTION, NotifyTypes.FOLLOW, NotifyTypes.COMMENT, NotifyTypes.RE_BLOG, NotifyTypes.TRANSFERS, NotifyTypes.DELEGATIONS, NotifyTypes.FAVORITES, NotifyTypes.BOOKMARKS, NotifyTypes.PAYOUTS, NotifyTypes.ACCOUNT_UPDATE, NotifyTypes.WEEKLY_EARNINGS, NotifyTypes.SCHEDULED_PUBLISHED];
declare enum NotificationViewType {
    ALL = "All",
    UNREAD = "Unread",
    READ = "Read"
}

interface BaseWsNotification {
    source: string;
    target: string;
    timestamp: string;
}
interface WsVoteNotification extends BaseWsNotification {
    type: "vote";
    extra: {
        permlink: string;
        weight: number;
        title: string | null;
        img_url: string | null;
    };
}
interface WsMentionNotification extends BaseWsNotification {
    type: "mention";
    extra: {
        permlink: string;
        is_post: 0 | 1;
        title: string | null;
        img_url: string | null;
    };
}
interface WsFavoriteNotification extends BaseWsNotification {
    type: "favorites";
    extra: {
        permlink: string;
        is_post: 0 | 1;
        title: string | null;
        img_url: string | null;
    };
}
interface WsBookmarkNotification extends BaseWsNotification {
    type: "bookmarks";
    extra: {
        permlink: string;
        is_post: 0 | 1;
        title: string | null;
        parent_img_url: string | null;
    };
}
interface WsFollowNotification extends BaseWsNotification {
    type: "follow";
    extra: {
        what: string[];
    };
}
interface WsReplyNotification extends BaseWsNotification {
    type: "reply";
    extra: {
        title: string;
        body: string;
        json_metadata: string;
        permlink: string;
        parent_author: string;
        parent_permlink: string;
        parent_title: string | null;
        parent_img_url: string | null;
    };
}
interface WsReblogNotification extends BaseWsNotification {
    type: "reblog";
    extra: {
        permlink: string;
        title: string | null;
        img_url: string | null;
    };
}
interface WsPayoutsNotification extends BaseWsNotification {
    type: "payouts";
    extra: {
        permlink: string;
        title: string | null;
        amount: string | null;
        amount_usd: string | null;
        payout_at: string | null;
        img_url: string | null;
    };
}
interface WsTransferNotification extends BaseWsNotification {
    type: "transfer";
    extra: {
        amount: string;
        memo: string;
    };
}
interface WsDelegationsNotification extends BaseWsNotification {
    type: "delegations";
    extra: {
        amount: string;
    };
}
interface WsSpinNotification extends BaseWsNotification {
    type: "spin";
}
interface WsInactiveNotification extends BaseWsNotification {
    type: "inactive";
}
interface WsReferralNotification extends BaseWsNotification {
    type: "referral";
}
type WsNotification = WsVoteNotification | WsMentionNotification | WsFavoriteNotification | WsBookmarkNotification | WsFollowNotification | WsReplyNotification | WsReblogNotification | WsPayoutsNotification | WsTransferNotification | WsSpinNotification | WsInactiveNotification | WsReferralNotification | WsDelegationsNotification;
interface BaseAPiNotification {
    id: string;
    source: string;
    read: 0 | 1;
    timestamp: string;
    ts: number;
    gk: string;
    gkf: boolean;
}
interface ApiVoteNotification extends BaseAPiNotification {
    type: "vote" | "unvote";
    voter: string;
    weight: number;
    author: string;
    permlink: string;
    title: string | null;
    img_url: string | null;
}
interface ApiMentionNotification extends BaseAPiNotification {
    type: "mention";
    author: string;
    account: string;
    permlink: string;
    post: boolean;
    title: string | null;
    img_url: string | null;
    deck?: boolean;
}
interface ApiFollowNotification extends BaseAPiNotification {
    type: "follow" | "unfollow" | "ignore";
    follower: string;
    following: string;
    blog: boolean;
}
interface ApiReblogNotification extends BaseAPiNotification {
    type: "reblog";
    account: string;
    author: string;
    permlink: string;
    title: string | null;
    img_url: string | null;
}
interface ApiReplyNotification extends BaseAPiNotification {
    type: "reply";
    author: string;
    permlink: string;
    title: string;
    body: string;
    json_metadata: string;
    metadata: any;
    parent_author: string;
    parent_permlink: string;
    parent_title: string | null;
    parent_img_url: string | null;
}
interface ApiPayoutsNotification extends BaseAPiNotification {
    type: "payouts";
    author: string;
    permlink: string;
    title: string | null;
    amount: string | null;
    amount_usd: string | null;
    payout_at: string | null;
    img_url: string | null;
}
interface ApiTransferNotification extends BaseAPiNotification {
    type: "transfer";
    to: string;
    amount: string;
    memo: string | null;
}
interface ApiFavoriteNotification extends BaseAPiNotification {
    type: "favorites";
    author: string;
    account: string;
    permlink: string;
    post: boolean;
    title: string | null;
    img_url: string | null;
}
interface ApiBookmarkNotification extends BaseAPiNotification {
    type: "bookmarks";
    author: string;
    account: string;
    permlink: string;
    post: boolean;
    title: string | null;
    parent_img_url: string | null;
}
interface ApiSpinNotification extends BaseAPiNotification {
    type: "spin";
}
interface ApiInactiveNotification extends BaseAPiNotification {
    type: "inactive";
}
interface ApiReferralNotification extends BaseAPiNotification {
    type: "referral";
}
interface ApiDelegationsNotification extends BaseAPiNotification {
    type: "delegations";
    to: string;
    amount: string;
}
interface ApiWeeklyEarningsNotification extends BaseAPiNotification {
    type: "weekly_earnings";
    total_usd?: string;
    author_usd?: string;
    curation_usd?: string;
}
interface ApiScheduledPublishedNotification extends BaseAPiNotification {
    type: "scheduled_published";
    author: string;
    permlink: string;
    title: string | null;
    img_url: string | null;
}
interface ApiNotificationSetting {
    system: string;
    allows_notify: number;
    notify_types: number[] | null;
    status: number;
}
type ApiNotification = ApiVoteNotification | ApiMentionNotification | ApiFavoriteNotification | ApiBookmarkNotification | ApiFollowNotification | ApiReblogNotification | ApiPayoutsNotification | ApiReplyNotification | ApiTransferNotification | ApiSpinNotification | ApiInactiveNotification | ApiReferralNotification | ApiDelegationsNotification | ApiWeeklyEarningsNotification | ApiScheduledPublishedNotification;
interface Notifications {
    filter: NotificationFilter | null;
    unread: number;
    list: ApiNotification[];
    loading: boolean;
    hasMore: boolean;
    unreadFetchFlag: boolean;
    settings?: ApiNotificationSetting;
    fbSupport: "pending" | "granted" | "denied";
}

interface Announcement {
    id: number;
    title: string;
    description: string;
    button_text: string;
    button_link: string;
    path: string | Array<string>;
    auth: boolean;
}

interface Spotlight {
    id: string;
    feature: string;
    title: string;
    description: string;
    icon?: string;
    button_text: string;
    button_link: string;
    path?: string | Array<string>;
    guestsOnly?: boolean;
    platforms?: Array<"web" | "mobile">;
    start?: string;
    end?: string;
    weight?: number;
    locales?: {
        [lang: string]: Pick<Spotlight, "title" | "description" | "button_text">;
    };
}

declare function getNotificationsInfiniteQueryOptions(activeUsername: string | undefined, code: string | undefined, filter?: NotificationFilter | undefined): _tanstack_react_query.UseInfiniteQueryOptions<ApiNotification[], Error, _tanstack_react_query.InfiniteData<ApiNotification[], unknown>, (string | undefined)[], string> & {
    initialData: _tanstack_react_query.InfiniteData<ApiNotification[], string> | (() => _tanstack_react_query.InfiniteData<ApiNotification[], string>) | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<ApiNotification[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getNotificationsSettingsQueryOptions(activeUsername: string | undefined, code: string | undefined, initialMuted?: boolean): Omit<_tanstack_react_query.UseQueryOptions<ApiNotificationSetting, Error, ApiNotificationSetting, (string | undefined)[]>, "queryFn"> & {
    initialData: ApiNotificationSetting | (() => ApiNotificationSetting);
    queryFn?: _tanstack_react_query.QueryFunction<ApiNotificationSetting, (string | undefined)[]> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: ApiNotificationSetting;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAnnouncementsQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Announcement[], Error, Announcement[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Announcement[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Announcement[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getSpotlightsQueryOptions(_accessToken?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Spotlight[], Error, Spotlight[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Spotlight[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Spotlight[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Hook to mark notifications as read with optimistic updates
 *
 * @param username - Current user's username
 * @param code - Access token for authentication
 * @param onSuccess - Optional callback on successful mutation, receives unread count
 * @param onError - Optional callback on error
 *
 * @returns Mutation hook that accepts { id?: string }
 *
 * @example
 * ```typescript
 * const markAsRead = useMarkNotificationsRead(username, code);
 *
 * // Mark specific notification
 * markAsRead.mutate({ id: "notification-id" });
 *
 * // Mark all notifications (omit id)
 * markAsRead.mutate({});
 * ```
 */
declare function useMarkNotificationsRead(username: string | undefined, code: string | undefined, onSuccess?: (unreadCount?: number) => void, onError?: (e: Error) => void): _tanstack_react_query.UseMutationResult<Record<string, unknown> | undefined, Error, {
    id?: string;
}, {
    previousData: [readonly unknown[], unknown][];
}>;

interface SetLastReadPayload {
    date?: string;
}
declare function useSetLastRead(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, SetLastReadPayload, unknown>;

interface Proposal {
    creator: string;
    daily_pay: {
        amount: string;
        nai: string;
        precision: number;
    };
    end_date: string;
    id: number;
    permlink: string;
    proposal_id: number;
    receiver: string;
    start_date: string;
    status: string;
    subject: string;
    total_votes: string;
}

interface ProposalVote {
    id: number;
    proposal?: Proposal;
    voter: string;
}

/**
 * Get a single proposal by ID
 */
declare function getProposalQueryOptions(id: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Proposal, Error, Proposal, (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Proposal, (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: Proposal;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get all proposals, sorted with expired proposals at the end
 */
declare function getProposalsQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Proposal[], Error, Proposal[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Proposal[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Proposal[];
        [dataTagErrorSymbol]: Error;
    };
};

type ProposalVoteRow = {
    id: number;
    voter: string;
    voterAccount: FullAccount;
};
/**
 * Get proposal votes with pagination and enriched voter account data
 *
 * @param proposalId - The proposal ID
 * @param voter - Starting voter for pagination
 * @param limit - Number of votes per page
 */
declare function getProposalVotesInfiniteQueryOptions(proposalId: number, voter: string, limit: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<ProposalVoteRow[], Error, InfiniteData<ProposalVoteRow[], string>, (string | number)[], string>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ProposalVoteRow[], (string | number)[], string> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<ProposalVoteRow[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Fetches ALL proposal votes for a specific user in a single query.
 * Much more efficient than querying each proposal individually.
 * Uses "by_voter_proposal" order to get all votes by a user.
 */
declare function getUserProposalVotesQueryOptions(voter: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<ProposalVote[], Error, ProposalVote[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ProposalVote[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: ProposalVote[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Payload for voting on proposals.
 */
interface ProposalVotePayload {
    /** Array of proposal IDs to vote on */
    proposalIds: number[];
    /** True to approve, false to disapprove */
    approve: boolean;
}
/**
 * React Query mutation hook for voting on Hive proposals.
 *
 * This mutation broadcasts an update_proposal_votes operation to vote on
 * one or more proposals in the Hive Decentralized Fund (HDF).
 *
 * @param username - The username voting on proposals (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Records activity (type 150) if adapter.recordActivity is available
 * - Invalidates proposal list cache to show updated vote status
 * - Invalidates voter's proposal votes cache
 *
 * **Multiple Proposals:**
 * - You can vote on multiple proposals in a single transaction
 * - All proposals receive the same vote (approve or disapprove)
 * - Proposal IDs are integers, not strings
 *
 * **Vote Types:**
 * - approve: true - Vote in favor of the proposal(s)
 * - approve: false - Remove your vote from the proposal(s)
 *
 * @example
 * ```typescript
 * const proposalVoteMutation = useProposalVote(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Approve a single proposal
 * proposalVoteMutation.mutate({
 *   proposalIds: [123],
 *   approve: true
 * });
 *
 * // Approve multiple proposals
 * proposalVoteMutation.mutate({
 *   proposalIds: [123, 124, 125],
 *   approve: true
 * });
 *
 * // Remove vote from a proposal
 * proposalVoteMutation.mutate({
 *   proposalIds: [123],
 *   approve: false
 * });
 * ```
 */
declare function useProposalVote(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, ProposalVotePayload, unknown>;

declare function useProposalCreate(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, ProposalCreatePayload, unknown>;

interface DelegatedVestingShare {
    id: number;
    delegatee: string;
    delegator: string;
    min_delegation_time: string;
    vesting_shares: string;
}

/**
 * Shape returned by the HAF balance-api delegations endpoint
 * (`/balance-api/accounts/{account-name}/delegations`).
 *
 * `amount` is raw vests as an integer string (vests * 10^6),
 * e.g. "903311000000" === 903311.000000 VESTS.
 */
interface OutgoingDelegation {
    delegatee: string;
    amount: string;
    operation_id: string;
    block_num: number;
}
interface IncomingDelegation {
    delegator: string;
    amount: string;
    operation_id: string;
    block_num: number;
}
interface AccountDelegations {
    outgoing_delegations: OutgoingDelegation[];
    incoming_delegations: IncomingDelegation[];
}

interface VestingDelegationExpiration {
    id: number;
    delegator: string;
    vesting_shares: {
        amount: string;
        nai: string;
        precision: number;
    };
    expiration: string;
}

interface ConversionRequest {
    amount: string;
    conversion_date: string;
    id: number;
    owner: string;
    requestid: number;
}
interface CollateralizedConversionRequest {
    collateral_amount: string;
    conversion_date: string;
    converted_amount: string;
    id: number;
    owner: string;
    requestid: number;
}

interface SavingsWithdrawRequest {
    id: number;
    from: string;
    to: string;
    memo: string;
    request_id: number;
    amount: string;
    complete: string;
}

interface WithdrawRoute {
    auto_vest: boolean;
    from_account: string;
    id: number;
    percent: number;
    to_account: string;
}

interface OpenOrdersData {
    id: number;
    created: string;
    expiration: string;
    seller: string;
    orderid: number;
    for_sale: number;
    sell_price: {
        base: string;
        quote: string;
    };
    real_price: string;
    rewarded: boolean;
}

interface RcDirectDelegation {
    from: string;
    to: string;
    delegated_rc: string;
}
interface RcDirectDelegationsResponse {
    rc_direct_delegations: RcDirectDelegation[];
    next_start?: [string, string] | null;
}

interface IncomingRcDelegation {
    sender: string;
    amount: string;
}
interface IncomingRcResponse {
    list: IncomingRcDelegation[];
}

interface ReceivedVestingShare {
    delegatee: string;
    delegator: string;
    timestamp: string;
    vesting_shares: string;
}

interface RecurrentTransfer {
    id: number;
    from: string;
    to: string;
    amount: string;
    memo: string;
    recurrence: number;
    remaining_executions: number;
    consecutive_failures: number;
    pair_id: number;
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

/**
 * Get vesting delegations for an account with infinite scroll support
 *
 * @param username - The account username
 * @param limit - Maximum number of results per page (default: 50)
 */
declare function getVestingDelegationsQueryOptions(username?: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<DelegatedVestingShare[], Error, _tanstack_react_query.InfiniteData<DelegatedVestingShare[], unknown>, (string | number | undefined)[], string>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<DelegatedVestingShare[], (string | number | undefined)[], string> | undefined;
} & {
    queryKey: (string | number | undefined)[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<DelegatedVestingShare[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Account vesting delegations via the HAF balance-api REST endpoint
 * (`/balance-api/accounts/{account-name}/delegations`).
 *
 * Unlike `condenser_api.get_vesting_delegations` (see
 * {@link getHivePowerDelegatesInfiniteQueryOptions}), this returns the
 * complete outgoing AND incoming lists in a single request, with `callREST`
 * handling multi-node failover. `amount` is raw vests (vests * 10^6).
 */
declare function getAccountDelegationsQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AccountDelegations, Error, AccountDelegations, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AccountDelegations, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: AccountDelegations;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get expiring vesting delegations for an account.
 *
 * When a delegation is removed (set to 0 VESTS), the HP doesn't return
 * immediately — it enters a 5-day cooldown. This query fetches those
 * in-flight expirations so they can be shown alongside active delegations.
 *
 * Uses database_api.find_vesting_delegation_expirations which returns
 * vesting_shares as NAI asset objects ({amount, nai, precision}).
 *
 * @param username - The delegator account username
 */
declare function getVestingDelegationExpirationsQueryOptions(username?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<VestingDelegationExpiration[], Error, VestingDelegationExpiration[], (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<VestingDelegationExpiration[], (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: VestingDelegationExpiration[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get HBD to HIVE conversion requests for an account
 *
 * @param account - The account username
 */
declare function getConversionRequestsQueryOptions(account: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<ConversionRequest[], Error, ConversionRequest[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ConversionRequest[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: ConversionRequest[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get collateralized HIVE to HBD conversion requests for an account
 *
 * @param account - The account username
 */
declare function getCollateralizedConversionRequestsQueryOptions(account: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<CollateralizedConversionRequest[], Error, CollateralizedConversionRequest[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<CollateralizedConversionRequest[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: CollateralizedConversionRequest[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get pending savings withdrawal requests for an account
 *
 * @param account - The account username
 */
declare function getSavingsWithdrawFromQueryOptions(account: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<SavingsWithdrawRequest[], Error, SavingsWithdrawRequest[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<SavingsWithdrawRequest[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: SavingsWithdrawRequest[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get power down (vesting withdrawal) routes for an account
 *
 * @param account - The account username
 */
declare function getWithdrawRoutesQueryOptions(account: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<WithdrawRoute[], Error, WithdrawRoute[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WithdrawRoute[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: WithdrawRoute[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get open market orders for an account
 *
 * @param user - The account username
 */
declare function getOpenOrdersQueryOptions(user: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<OpenOrdersData[], Error, OpenOrdersData[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<OpenOrdersData[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: OpenOrdersData[];
        [dataTagErrorSymbol]: Error;
    };
};

type RcPage = RcDirectDelegation[];
type RcCursor = string | null;
/**
 * Get outgoing RC delegations for an account
 *
 * @param username - Account name to get delegations for
 * @param limit - Number of delegations per page
 */
declare function getOutgoingRcDelegationsInfiniteQueryOptions(username: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<RcPage, Error, InfiniteData<RcPage, RcCursor>, (string | number)[], RcCursor>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<RcPage, (string | number)[], RcCursor> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<RcPage, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getIncomingRcQueryOptions(username: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<IncomingRcResponse, Error, IncomingRcResponse, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<IncomingRcResponse, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: IncomingRcResponse;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getReceivedVestingSharesQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<ReceivedVestingShare[], Error, ReceivedVestingShare[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<ReceivedVestingShare[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: ReceivedVestingShare[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get recurrent transfers for an account
 *
 * @param username - The account username
 */
declare function getRecurrentTransfersQueryOptions(username: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<RecurrentTransfer[], Error, RecurrentTransfer[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<RecurrentTransfer[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: RecurrentTransfer[];
        [dataTagErrorSymbol]: Error;
    };
};

type PortfolioLayer = "points" | "hive" | "chain" | "engine";
interface TokenAction {
    id: string;
    [key: string]: unknown;
}
interface PortfolioWalletItem {
    name: string;
    symbol: string;
    layer: PortfolioLayer;
    balance: number;
    fiatRate: number;
    currency: string;
    precision: number;
    address?: string;
    error?: string;
    pendingRewards?: number;
    pendingRewardsFiat?: number;
    liquid?: number;
    liquidFiat?: number;
    savings?: number;
    savingsFiat?: number;
    staked?: number;
    stakedFiat?: number;
    iconUrl?: string;
    actions?: TokenAction[];
    extraData?: Array<{
        dataKey: string;
        value: any;
    }>;
    apr?: number;
}
interface PortfolioResponse {
    username: string;
    currency?: string;
    wallets: PortfolioWalletItem[];
}
/**
 * Get portfolio query options for fetching user's wallet balances across all layers
 * @param username - Hive username
 * @param currency - Fiat currency code (default: "usd")
 * @param onlyEnabled - Only return enabled tokens (default: true)
 * @returns TanStack Query options for portfolio data
 */
declare function getPortfolioQueryOptions(username: string, currency?: string, onlyEnabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<PortfolioResponse, Error, PortfolioResponse, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<PortfolioResponse, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: PortfolioResponse;
        [dataTagErrorSymbol]: Error;
    };
};

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
declare function getHiveAssetTransactionsQueryOptions(username: string | undefined, limit?: number, filters?: HiveOperationFilter): _tanstack_react_query.UseInfiniteQueryOptions<Transaction[], Error, _tanstack_react_query.InfiniteData<Transaction[], unknown>, readonly unknown[], unknown> & {
    initialData: _tanstack_react_query.InfiniteData<Transaction[], unknown> | (() => _tanstack_react_query.InfiniteData<Transaction[], unknown>) | undefined;
} & {
    queryKey: readonly unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<Transaction[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHbdAssetTransactionsQueryOptions(username: string | undefined, limit?: number, filters?: HiveOperationFilter): _tanstack_react_query.UseInfiniteQueryOptions<Transaction[], Error, _tanstack_react_query.InfiniteData<Transaction[], unknown>, readonly unknown[], unknown> & {
    initialData: _tanstack_react_query.InfiniteData<Transaction[], unknown> | (() => _tanstack_react_query.InfiniteData<Transaction[], unknown>) | undefined;
} & {
    queryKey: readonly unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<Transaction[], unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getHivePowerAssetTransactionsQueryOptions(username: string | undefined, limit?: number, filters?: HiveOperationFilter): _tanstack_react_query.UseInfiniteQueryOptions<Transaction[], Error, _tanstack_react_query.InfiniteData<Transaction[], unknown>, readonly unknown[], unknown> & {
    initialData: _tanstack_react_query.InfiniteData<Transaction[], unknown> | (() => _tanstack_react_query.InfiniteData<Transaction[], unknown>) | undefined;
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

/**
 * Payload for transferring tokens.
 */
interface TransferPayload {
    /** Recipient account */
    to: string;
    /** Amount with asset symbol (e.g., "1.000 HIVE", "5.000 HBD") */
    amount: string;
    /** Transfer memo */
    memo: string;
}
/**
 * React Query mutation hook for transferring tokens.
 *
 * This mutation broadcasts a transfer operation to send HIVE or HBD
 * to another account. **Requires ACTIVE authority**.
 *
 * Uses `useBroadcastMutation` with the smart auth strategy:
 * - Adapter determines login type and dispatches to appropriate method
 * - If active key not available (common on web), triggers `showAuthUpgradeUI`
 * - Supports keychain, hivesigner, hiveauth, and direct key signing
 *
 * @param username - The username sending the transfer (required for broadcast)
 * @param auth - Authentication context with platform adapter
 *
 * @returns React Query mutation result
 */
declare function useTransfer(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, TransferPayload, unknown>;

interface TransferPointPayload {
    to: string;
    amount: string;
    memo: string;
}
/**
 * React Query mutation hook for transferring Ecency points.
 *
 * Uses `ecency_point_transfer` custom_json operation with ACTIVE authority.
 */
declare function useTransferPoint(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, TransferPointPayload, unknown>;

/**
 * Payload for delegating Hive Power (vesting shares).
 */
interface DelegateVestingSharesPayload {
    /** Account receiving HP delegation */
    delegatee: string;
    /** Amount of VESTS to delegate (e.g., "1000.000000 VESTS"). Use "0.000000 VESTS" to remove delegation. */
    vestingShares: string;
}
/**
 * React Query mutation hook for delegating Hive Power (HP).
 *
 * This mutation broadcasts a delegate_vesting_shares operation to delegate HP
 * to another account. **Requires ACTIVE authority**, not posting.
 *
 * @param username - The username delegating HP (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **IMPORTANT: Active Authority Required**
 * - Delegation operations require ACTIVE key, not posting key
 * - Make sure your auth adapter provides getActiveKey() method
 * - Keychain/HiveAuth will prompt for Active authority
 *
 * **Delegation Mechanics:**
 * - Delegated HP can be used by the delegatee for resource credits
 * - Delegatee CANNOT power down or transfer the delegated HP
 * - Delegation can be removed by setting vestingShares to "0.000000 VESTS"
 * - Removing delegation has a 5-day cooldown before HP returns to delegator
 *
 * **Post-Broadcast Actions:**
 * - Invalidates delegations list cache to show updated delegation
 * - Invalidates account data for both delegator and delegatee
 *
 * @example
 * ```typescript
 * const delegateMutation = useDelegateVestingShares(username, {
 *   adapter: {
 *     ...myAdapter,
 *     getActiveKey: async (username) => getActiveKeyFromStorage(username)
 *   },
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Delegate HP
 * delegateMutation.mutate({
 *   delegatee: 'alice',
 *   vestingShares: '1000.000000 VESTS'
 * });
 *
 * // Remove delegation
 * delegateMutation.mutate({
 *   delegatee: 'alice',
 *   vestingShares: '0.000000 VESTS'
 * });
 * ```
 */
declare function useDelegateVestingShares(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, DelegateVestingSharesPayload, unknown>;

/**
 * Payload for setting withdraw vesting route.
 */
interface SetWithdrawVestingRoutePayload {
    /** Account receiving withdrawn vesting */
    toAccount: string;
    /** Percentage to route (0-10000, where 10000 = 100%). Already scaled. */
    percent: number;
    /** Auto convert to vesting (power up) */
    autoVest: boolean;
}
/**
 * React Query mutation hook for setting withdraw vesting route.
 *
 * This mutation broadcasts a set_withdraw_vesting_route operation to configure
 * where withdrawn VESTS (power down) are sent. **Requires ACTIVE authority**, not posting.
 *
 * @param username - The username setting withdraw route (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **IMPORTANT: Active Authority Required**
 * - Withdraw route operations require ACTIVE key, not posting key
 * - Make sure your auth adapter provides getActiveKey() method
 * - Keychain/HiveAuth will prompt for Active authority
 *
 * **Withdraw Route Mechanics:**
 * - Routes a percentage of power down (withdraw_vesting) to another account
 * - Percent must be between 0-10000 (where 10000 = 100%)
 * - Multiple routes can be set, total cannot exceed 100%
 * - autoVest=true converts withdrawn VESTS to HP in destination account
 * - autoVest=false converts withdrawn VESTS to liquid HIVE
 *
 * **Post-Broadcast Actions:**
 * - Invalidates withdraw routes cache to show updated routes
 * - Invalidates account data for both accounts
 *
 * @example
 * ```typescript
 * const setRouteMutation = useSetWithdrawVestingRoute(username, {
 *   adapter: {
 *     ...myAdapter,
 *     getActiveKey: async (username) => getActiveKeyFromStorage(username)
 *   },
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Route 50% of power down to another account (auto vest)
 * setRouteMutation.mutate({
 *   toAccount: 'alice',
 *   percent: 5000, // 50% (already scaled)
 *   autoVest: true
 * });
 *
 * // Route 100% of power down to another account (liquid HIVE)
 * setRouteMutation.mutate({
 *   toAccount: 'bob',
 *   percent: 10000, // 100% (already scaled)
 *   autoVest: false
 * });
 * ```
 */
declare function useSetWithdrawVestingRoute(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, SetWithdrawVestingRoutePayload, unknown>;

interface TransferEngineTokenPayload {
    to: string;
    symbol: string;
    quantity: string;
    memo: string;
}
declare function useTransferEngineToken(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, TransferEngineTokenPayload, unknown>;

interface TransferToSavingsPayload {
    to: string;
    amount: string;
    memo: string;
}
declare function useTransferToSavings(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, TransferToSavingsPayload, unknown>;

interface TransferFromSavingsPayload {
    to: string;
    amount: string;
    memo: string;
    requestId: number;
}
declare function useTransferFromSavings(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, TransferFromSavingsPayload, unknown>;

interface TransferToVestingPayload {
    to: string;
    amount: string;
}
declare function useTransferToVesting(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, TransferToVestingPayload, unknown>;

interface WithdrawVestingPayload {
    vestingShares: string;
}
declare function useWithdrawVesting(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, WithdrawVestingPayload, unknown>;

interface ConvertPayload {
    amount: string;
    requestId: number;
    collateralized?: boolean;
}
declare function useConvert(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, ConvertPayload, unknown>;

interface ClaimInterestPayload {
    to: string;
    amount: string;
    memo: string;
    requestId: number;
}
declare function useClaimInterest(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, ClaimInterestPayload, unknown>;

interface ClaimRewardsPayload {
    rewardHive: string;
    rewardHbd: string;
    rewardVests: string;
}
declare function useClaimRewards(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, ClaimRewardsPayload, unknown>;

interface DelegateEngineTokenPayload {
    to: string;
    symbol: string;
    quantity: string;
}
declare function useDelegateEngineToken(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, DelegateEngineTokenPayload, unknown>;

interface UndelegateEngineTokenPayload {
    from: string;
    symbol: string;
    quantity: string;
}
declare function useUndelegateEngineToken(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, UndelegateEngineTokenPayload, unknown>;

interface StakeEngineTokenPayload {
    to: string;
    symbol: string;
    quantity: string;
}
declare function useStakeEngineToken(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, StakeEngineTokenPayload, unknown>;

interface UnstakeEngineTokenPayload {
    to: string;
    symbol: string;
    quantity: string;
}
declare function useUnstakeEngineToken(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, UnstakeEngineTokenPayload, unknown>;

interface ClaimEngineRewardsPayload {
    tokens: string[];
}
declare function useClaimEngineRewards(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, ClaimEngineRewardsPayload, unknown>;

interface EngineMarketOrderPayload {
    action: "buy" | "sell" | "cancel";
    symbol: string;
    quantity?: string;
    price?: string;
    orderId?: string;
    orderType?: "buy" | "sell";
}
declare function useEngineMarketOrder(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, EngineMarketOrderPayload, unknown>;

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

interface DelegateRcPayload {
    to: string;
    maxRc: string | number;
}
declare function useDelegateRc(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, DelegateRcPayload, unknown>;

declare const HIVE_ACCOUNT_OPERATION_GROUPS: Record<HiveOperationGroup, number[]>;

declare const HIVE_OPERATION_LIST: HiveOperationName[];

declare const HIVE_OPERATION_ORDERS: Record<"vote" | "comment" | "transfer" | "transfer_to_vesting" | "withdraw_vesting" | "account_create" | "account_create_with_delegation" | "account_update" | "account_update2" | "account_witness_vote" | "account_witness_proxy" | "convert" | "collateralized_convert" | "custom" | "custom_json" | "claim_account" | "create_claimed_account" | "claim_reward_balance" | "delegate_vesting_shares" | "delete_comment" | "comment_options" | "set_withdraw_vesting_route" | "witness_update" | "witness_set_properties" | "decline_voting_rights" | "reset_account" | "set_reset_account" | "transfer_to_savings" | "transfer_from_savings" | "cancel_transfer_from_savings" | "limit_order_create" | "limit_order_create2" | "limit_order_cancel" | "feed_publish" | "escrow_transfer" | "escrow_dispute" | "escrow_release" | "escrow_approve" | "recover_account" | "request_account_recovery" | "change_recovery_account" | "recurrent_transfer" | "create_proposal" | "update_proposal" | "update_proposal_votes" | "remove_proposal" | "curation_reward" | "author_reward" | "comment_benefactor_reward" | "fill_order" | "producer_reward" | "interest" | "fill_convert_request" | "fill_collateralized_convert_request" | "return_vesting_delegation" | "proposal_pay" | "comment_payout_update" | "comment_reward" | "fill_recurrent_transfer" | "fill_vesting_withdraw" | "effective_comment_vote" | "pow" | "report_over_production" | "pow2" | "custom_binary" | "liquidity_reward" | "shutdown_witness" | "fill_transfer_from_savings" | "hardfork" | "clear_null_account_balance" | "sps_fund" | "hardfork_hive" | "hardfork_hive_restore" | "delayed_voting" | "consolidate_treasury_balance" | "ineffective_delete_comment" | "sps_convert" | "expired_account_notification" | "changed_recovery_account" | "transfer_to_vesting_completed" | "pow_reward" | "vesting_shares_split" | "account_created" | "system_warning" | "failed_recurrent_transfer" | "limit_order_cancelled" | "producer_missed" | "proposal_fee" | "collateralized_convert_immediate_conversion" | "escrow_approved" | "escrow_rejected" | "proxy_cleared" | "declined_voting_rights", number>;
declare const HIVE_OPERATION_NAME_BY_ID: Record<number, HiveOperationName>;

/**
 * Payload for voting for a witness.
 */
interface WitnessVotePayload {
    /** Witness account name to vote for/against */
    witness: string;
    /** True to approve, false to disapprove */
    approve: boolean;
}
/**
 * React Query mutation hook for voting for a Hive witness.
 *
 * This mutation broadcasts an account_witness_vote operation to vote for
 * or remove a vote from a witness.
 *
 * @param username - The username voting for the witness (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Invalidates account data cache to show updated witness votes
 * - Invalidates witness votes cache
 *
 * **Vote Types:**
 * - approve: true - Vote for the witness
 * - approve: false - Remove your vote from the witness
 *
 * **Authority Required:**
 * - Active authority is required for witness voting
 *
 * @example
 * ```typescript
 * const witnessVoteMutation = useWitnessVote(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Vote for a witness
 * witnessVoteMutation.mutate({
 *   witness: 'good-karma',
 *   approve: true
 * });
 *
 * // Remove vote from a witness
 * witnessVoteMutation.mutate({
 *   witness: 'good-karma',
 *   approve: false
 * });
 * ```
 */
declare function useWitnessVote(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, WitnessVotePayload, unknown>;

interface WitnessProxyPayload {
    proxy: string;
}
declare function useWitnessProxy(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, WitnessProxyPayload, unknown>;

interface Witness {
    total_missed: number;
    url: string;
    props: {
        account_creation_fee: string;
        account_subsidy_budget: number;
        maximum_block_size: number;
    };
    hbd_exchange_rate: {
        base: string;
    };
    available_witness_account_subsidies: number;
    running_version: string;
    owner: string;
    signing_key: string;
    last_hbd_exchange_update: string;
    /** Rank by vote weight (only available via REST) */
    rank?: number;
    /** Total vests supporting this witness (only available via REST) */
    vests?: string;
    /** Number of accounts voting for this witness (only available via REST) */
    voters_num?: number;
    /** Daily change in voter count (only available via REST) */
    voters_num_daily_change?: number;
    /** Current price feed value (only available via REST) */
    price_feed?: number;
    /** HBD interest rate in basis points (only available via REST) */
    hbd_interest_rate?: number;
    /** Last confirmed block number (only available via REST) */
    last_confirmed_block_num?: number;
}
interface WitnessVoter {
    voter_name: string;
    vests: string;
    account_vests: string;
    proxied_vests: string;
    timestamp: string;
}
interface WitnessVotersResponse {
    total_votes: number;
    total_pages: number;
    voters: WitnessVoter[];
}

type WitnessPage = Witness[];
/**
 * Get witnesses ordered by vote count (infinite scroll).
 * Uses the hafbe-api REST endpoint - replaces multi-call RPC assembly
 * with a single paginated call. Includes voter count, rank, and other
 * data that was previously unavailable.
 *
 * @param limit - Number of witnesses per page
 */
declare function getWitnessesInfiniteQueryOptions(limit: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<WitnessPage, Error, InfiniteData<WitnessPage, number>, (string | number)[], number>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WitnessPage, (string | number)[], number> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<WitnessPage, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};
type WitnessVoterSortField = "vests" | "account_vests" | "proxied_vests" | "account_name" | "timestamp";
type WitnessVoterSortDirection = "asc" | "desc";
/**
 * Get a single page of voters for a specific witness.
 *
 * Server-side pagination + sort: each page click fetches that page directly
 * from hafbe rather than scrolling through accumulated pages on the client.
 *
 * @param witness - Witness account name
 * @param page - 1-based page index
 * @param pageSize - Number of voters per page
 * @param sort - Field to sort by
 * @param direction - asc or desc
 */
declare function getWitnessVotersPageQueryOptions(witness: string, page: number, pageSize: number, sort?: WitnessVoterSortField, direction?: WitnessVoterSortDirection): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<WitnessVotersResponse, Error, WitnessVotersResponse, (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<WitnessVotersResponse, (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: WitnessVotersResponse;
        [dataTagErrorSymbol]: Error;
    };
};
/**
 * Get total voter count for a witness.
 *
 * @param witness - Witness account name
 */
declare function getWitnessVoterCountQueryOptions(witness: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<number, Error, number, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<number, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: number;
        [dataTagErrorSymbol]: Error;
    };
};

interface OrdersDataItem {
    created: string;
    hbd: number;
    hive: number;
    order_price: {
        base: string;
        quote: string;
    };
    real_price: string;
}

interface OrdersData {
    bids: OrdersDataItem[];
    asks: OrdersDataItem[];
    trading: OrdersDataItem[];
}

interface MarketStatistics {
    hbd_volume: string;
    highest_bid: string;
    hive_volume: string;
    latest: string;
    lowest_ask: string;
    percent_change: string;
}

interface MarketCandlestickDataItem {
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

interface MarketData {
    prices?: [number, number][];
}

interface HiveHbdStats {
    price: number;
    close: number;
    high: number;
    low: number;
    percent: number;
    totalFromAsset: string;
    totalToAsset: string;
}

/**
 * Get the internal HIVE/HBD market order book
 *
 * @param limit - Maximum number of orders to fetch (default: 500)
 */
declare function getOrderBookQueryOptions(limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<OrdersData, Error, OrdersData, (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<OrdersData, (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: OrdersData;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get HIVE/HBD market statistics from the blockchain
 */
declare function getMarketStatisticsQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<MarketStatistics, Error, MarketStatistics, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<MarketStatistics, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: MarketStatistics;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get HIVE/HBD market history (candlestick data)
 *
 * @param seconds - Bucket size in seconds
 * @param startDate - Start date for the data
 * @param endDate - End date for the data
 */
declare function getMarketHistoryQueryOptions(seconds: number, startDate: Date, endDate: Date): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<MarketCandlestickDataItem[], Error, MarketCandlestickDataItem[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<MarketCandlestickDataItem[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: MarketCandlestickDataItem[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get combined HIVE/HBD statistics including price, 24h change, and volume
 */
declare function getHiveHbdStatsQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<HiveHbdStats, Error, HiveHbdStats, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<HiveHbdStats, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: HiveHbdStats;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * Get market chart data from CoinGecko API
 *
 * @param coin - Coin ID (e.g., "hive", "bitcoin")
 * @param vsCurrency - Currency to compare against (e.g., "usd", "eur")
 * @param fromTs - From timestamp (Unix timestamp in seconds)
 * @param toTs - To timestamp (Unix timestamp in seconds)
 */
declare function getMarketDataQueryOptions(coin: string, vsCurrency: string, fromTs: string, toTs: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<MarketData, Error, MarketData, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<MarketData, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: MarketData;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getTradeHistoryQueryOptions(limit?: number, startDate?: Date, endDate?: Date): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<OrdersDataItem[], Error, OrdersDataItem[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<OrdersDataItem[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: OrdersDataItem[];
        [dataTagErrorSymbol]: Error;
    };
};

interface FeedHistoryItem {
    id: number;
    current_median_history: {
        base: string;
        quote: string;
    };
    market_median_history: {
        base: string;
        quote: string;
    };
    current_min_history: {
        base: string;
        quote: string;
    };
    current_max_history: {
        base: string;
        quote: string;
    };
    price_history: Array<{
        base: string;
        quote: string;
    }>;
}
/**
 * Get feed history from the blockchain
 * Returns price feed history including median prices
 */
declare function getFeedHistoryQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<FeedHistoryItem, Error, FeedHistoryItem, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<FeedHistoryItem, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: FeedHistoryItem;
        [dataTagErrorSymbol]: Error;
    };
};

interface MedianHistoryPrice {
    base: string;
    quote: string;
}
/**
 * Get current median history price from the blockchain
 * Returns the current median price for HIVE/HBD conversion
 */
declare function getCurrentMedianHistoryPriceQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<MedianHistoryPrice, Error, MedianHistoryPrice, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<MedianHistoryPrice, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: MedianHistoryPrice;
        [dataTagErrorSymbol]: Error;
    };
};

interface LimitOrderCreatePayload {
    amountToSell: string;
    minToReceive: string;
    fillOrKill: boolean;
    expiration: string;
    orderId: number;
}
declare function useLimitOrderCreate(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, LimitOrderCreatePayload, unknown>;

interface LimitOrderCancelPayload {
    orderId: number;
}
declare function useLimitOrderCancel(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, LimitOrderCancelPayload, unknown>;

interface ApiResponse<T> {
    status: number;
    data: T;
}
interface CurrencyRates {
    [currency: string]: {
        quotes: {
            [currency: string]: {
                last_updated: string;
                percent_change: number;
                price: number;
            };
        };
    };
}

declare function getMarketData(coin: string, vsCurrency: string, fromTs: string, toTs: string): Promise<MarketData>;
declare function getCurrencyRate(cur: string): Promise<number>;
declare function getCurrencyTokenRate(currency: string, token: string): Promise<number>;
declare function getCurrencyRates(): Promise<CurrencyRates>;
declare function getHivePrice(): Promise<{
    hive: {
        usd: number;
    };
}>;

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
    MINTED = 991
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

interface SearchResult {
    id: number;
    title: string;
    title_marked?: string | null;
    body: string;
    body_marked?: string | null;
    category: string;
    author: string;
    permlink: string;
    author_rep: number;
    total_payout: number;
    payout: number;
    total_votes: number;
    up_votes: number;
    img_url: string;
    created_at: string;
    children: number;
    tags: string[];
    app: string;
    depth: number;
}
interface SearchResponse {
    hits: number;
    took: number;
    scroll_id?: string;
    results: SearchResult[];
}

declare function searchQueryOptions(q: string, sort: string, hideLow: string, since?: string, scroll_id?: string, votes?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<SearchResponse, Error, SearchResponse, readonly ["search", string, string, boolean, string | undefined, string | undefined, number | undefined]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<SearchResponse, readonly ["search", string, string, boolean, string | undefined, string | undefined, number | undefined], never> | undefined;
} & {
    queryKey: readonly ["search", string, string, boolean, string | undefined, string | undefined, number | undefined] & {
        [dataTagSymbol]: SearchResponse;
        [dataTagErrorSymbol]: Error;
    };
};
type PageParam = {
    sid: string | undefined;
    hasNextPage: boolean;
};
declare function getControversialRisingInfiniteQueryOptions(what: string, tag: string, enabled?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<SearchResponse, Error, InfiniteData<SearchResponse, PageParam>, (string | number)[], PageParam>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<SearchResponse, (string | number)[], PageParam> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: InfiniteData<SearchResponse, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare const SIMILAR_ENTRIES_MIN_RENDER = 2;
interface Entry {
    author: string;
    permlink: string;
    title?: string;
    body?: string;
    json_metadata?: {
        tags?: unknown;
    };
}
declare function getSimilarEntriesQueryOptions(entry: Entry): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<SearchResult[], Error, SearchResult[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<SearchResult[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: SearchResult[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getSearchAccountQueryOptions(q: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Profile[], Error, Profile[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Profile[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: Profile[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getSearchTopicsQueryOptions(q: string, limit?: number): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<string[], Error, string[], (string | number)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], (string | number)[], never> | undefined;
} & {
    queryKey: (string | number)[] & {
        [dataTagSymbol]: string[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getSearchApiInfiniteQueryOptions(q: string, sort: string, hideLow: boolean, since?: string, votes?: number, includeNsfw?: boolean): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseInfiniteQueryOptions<SearchResponse, Error, _tanstack_react_query.InfiniteData<SearchResponse, unknown>, unknown[], string | undefined>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<SearchResponse, unknown[], string | undefined> | undefined;
} & {
    queryKey: unknown[] & {
        [dataTagSymbol]: _tanstack_react_query.InfiniteData<SearchResponse, unknown>;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getSearchPathQueryOptions(q: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<string[], Error, string[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: string[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function search(q: string, sort: string, hideLow: string, since?: string, scroll_id?: string, votes?: number, signal?: AbortSignal): Promise<SearchResponse>;
declare function similar(params: {
    author: string;
    permlink: string;
    title?: string;
    body?: string;
    tags?: string[];
    since?: string;
}, signal?: AbortSignal, timeoutMs?: number): Promise<SearchResponse>;
declare function searchPath(q: string, signal?: AbortSignal): Promise<string[]>;

/**
 * A user's voluntary "Support Ecency" preferences.
 *
 * - `beneficiary_percent` - percent (0-100) of post rewards the user wants to
 *   route to @ecency as a post beneficiary on their new posts. The beneficiary
 *   weight in basis points equals `percent * 100`. 0 means off.
 * - `curation_percent` - percent (0-100) of the user's daily curation reward
 *   payout (as an @ecency delegator) they want held back by Ecency as support.
 *   0 means off.
 */
interface SupportSettings {
    username: string;
    beneficiary_percent: number;
    curation_percent: number;
    /** ISO timestamps, present only when a settings row exists on the backend. */
    created?: string;
    modified?: string;
}
interface UpdateSupportSettingsPayload {
    beneficiary_percent: number;
    curation_percent: number;
}

/**
 * Fetch the active user's Support Ecency settings. The username is resolved
 * server-side from the validated `code`, so only the code is sent. Throws on a
 * non-2xx with the server's `.status` + parsed `.data` attached. Exported for
 * unit testing; the query options below wrap it.
 */
declare function getSupportSettingsRequest(code: string): Promise<SupportSettings>;
/**
 * Query options for the active user's Support Ecency settings
 * (beneficiary percent + curation holdback percent). Zeros mean both
 * opt-ins are off; the backend returns zeros when no row exists.
 */
declare function getSupportSettingsQueryOptions(username: string | undefined, code: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<SupportSettings, Error, SupportSettings, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<SupportSettings, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: SupportSettings;
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * POST a Support Ecency settings update. Both percents are integers within
 * 0..100 (0 = off); the gateway rejects anything else with a 400. Throws on a
 * non-2xx with the server's `.status` + parsed `.data` attached so the caller
 * can surface the plain validation message. Exported for unit testing; the
 * hook below wraps it.
 */
declare function updateSupportSettingsRequest(code: string, payload: UpdateSupportSettingsPayload): Promise<SupportSettings>;
/**
 * Sync the settings cache after a successful update: seed the fresh server
 * response and invalidate so any active observers refetch. Exported for unit
 * testing; `useUpdateSupportSettings` calls it from `onSuccess`.
 */
declare function applySupportSettingsUpdate(queryClient: QueryClient, username: string, data: SupportSettings): Promise<void>;
/**
 * Update the user's voluntary Support Ecency opt-ins (post beneficiary percent
 * and curation holdback percent). On success the settings query is refreshed
 * so every surface (publish dialog, settings card, injection hooks) sees the
 * new preference.
 */
declare function useUpdateSupportSettings(username: string | undefined, code: string | undefined): _tanstack_react_query.UseMutationResult<SupportSettings, Error, UpdateSupportSettingsPayload, unknown>;

interface PromotePrice {
    duration: number;
    price: number;
}

declare function getBoostPlusPricesQueryOptions(accessToken: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<PromotePrice[], Error, PromotePrice[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<PromotePrice[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: PromotePrice[];
        [dataTagErrorSymbol]: Error;
    };
};

/**
 * RC top-up pricing: duration -> Points cost tiers, served by the ePoints
 * backend via the private API. Reuses the {@link PromotePrice} shape
 * ({ duration, price }).
 */
declare function getRcDelegationPricesQueryOptions(accessToken: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<PromotePrice[], Error, PromotePrice[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<PromotePrice[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: PromotePrice[];
        [dataTagErrorSymbol]: Error;
    };
};

interface RcDelegationActive {
    user: string;
    expires: Date;
}
/**
 * The active (ON) RC top-up for a user, if any. Lets the UI block a duplicate
 * purchase up front (only one RC top-up is allowed at a time). Returns null
 * when the user has no active top-up.
 */
declare function getRcDelegationActiveQueryOptions(username: string, accessToken: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<RcDelegationActive | null, Error, RcDelegationActive | null, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<RcDelegationActive | null, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: RcDelegationActive | null;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getPromotePriceQueryOptions(accessToken: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<PromotePrice[], Error, PromotePrice[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<PromotePrice[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: PromotePrice[];
        [dataTagErrorSymbol]: Error;
    };
};

interface BoostPlusAccountPrice {
    account: string;
    expires: Date;
}
declare function getBoostPlusAccountPricesQueryOptions(account: string, accessToken: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<BoostPlusAccountPrice | null, Error, BoostPlusAccountPrice | null, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<BoostPlusAccountPrice | null, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: BoostPlusAccountPrice | null;
        [dataTagErrorSymbol]: Error;
    };
};

interface BoostPlusPayload {
    account: string;
    duration: number;
}
declare function useBoostPlus(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, BoostPlusPayload, unknown>;

interface RcDelegationPayload {
    duration: number;
}
/**
 * Buys a short-term, RC-only delegation (RC top-up) for the active user, paid
 * with Ecency Points. Mirrors {@link useBoostPlus} but is RC-only (no Hive
 * Power / voting power transferred). Invalidates the user's account + RC caches
 * so the new RC shows up once the relay delegation lands.
 */
declare function useRcDelegation(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, RcDelegationPayload, unknown>;

type BridgeParams = Record<string, unknown> | unknown[];
declare function bridgeApiCall<T>(endpoint: string, params: BridgeParams, signal?: AbortSignal): Promise<T>;
declare function resolvePost(post: Entry$1, observer: string, num?: number, signal?: AbortSignal): Promise<Entry$1>;
declare function getPostsRanked(sort: string, start_author?: string, start_permlink?: string, limit?: number, tag?: string, observer?: string, signal?: AbortSignal): Promise<Entry$1[] | null>;
declare function getAccountPosts(sort: string, account: string, start_author?: string, start_permlink?: string, limit?: number, observer?: string, signal?: AbortSignal): Promise<Entry$1[] | null>;
declare function getPost(author?: string, permlink?: string, observer?: string, num?: number, signal?: AbortSignal): Promise<Entry$1 | undefined>;
declare function getPostHeader(author?: string, permlink?: string): Promise<Entry$1 | null>;
declare function getDiscussion(author: string, permlink: string, observer?: string): Promise<Record<string, Entry$1> | null>;
declare function getCommunity(name: string, observer?: string | undefined): Promise<Community | null>;
declare function getCommunities(last?: string, limit?: number, query?: string | null, sort?: string, observer?: string): Promise<Community[] | null>;
declare function normalizePost(post: unknown): Promise<Entry$1 | null>;
declare function getSubscriptions(account: string): Promise<Subscription[] | null>;
declare function getSubscribers(community: string): Promise<Subscription[] | null>;
declare function getRelationshipBetweenAccounts(follower: string, following: string): Promise<AccountRelationship | null>;
declare function getProfiles(accounts: string[], observer?: string): Promise<Profile[]>;

/**
 * When the primary node returns null for a get_post call,
 * verify by querying multiple random nodes. If any node
 * returns the post, it exists (the first node was lagging).
 *
 * Uses callWithQuorum(quorum=1) which shuffles and queries
 * nodes in batches. Since it shuffles, it's unlikely to hit
 * the same node that just returned null first.
 */
declare function verifyPostOnAlternateNode(author: string, permlink: string, observer: string): Promise<Entry$1 | null>;

declare function signUp(username: string, email: string, referral: string, captchaToken?: string): Promise<ApiResponse<Record<string, unknown>>>;
declare function subscribeEmail(email: string): Promise<ApiResponse<Record<string, unknown>>>;
declare function usrActivity(code: string | undefined, ty: number, bl?: string | number, tx?: string | number): Promise<void>;
declare function getNotifications(code: string | undefined, filter: string | null, since?: string | null, user?: string | null): Promise<ApiNotification[]>;
declare function saveNotificationSetting(code: string | undefined, username: string, system: string, allows_notify: number, notify_types: number[], token: string): Promise<ApiNotificationSetting>;
declare function getNotificationSetting(code: string | undefined, username: string, token: string): Promise<ApiNotificationSetting>;
declare function markNotifications(code: string | undefined, id?: string): Promise<Record<string, unknown>>;
declare function addImage(code: string | undefined, url: string): Promise<Record<string, unknown>>;
declare function uploadImage(file: File, token: string, signal?: AbortSignal): Promise<{
    url: string;
}>;
/**
 * Upload image using posting key signature (/:username/:signature path).
 * Works with any compatible image server (images.ecency.com, images.hive.blog).
 * The signature is sha256("ImageSigningChallenge" + fileData) signed with the posting key.
 */
declare function uploadImageWithSignature(file: File, username: string, signature: string, signal?: AbortSignal): Promise<{
    url: string;
}>;
declare function deleteImage(code: string | undefined, imageId: string): Promise<Record<string, unknown>>;
declare function addDraft(code: string | undefined, title: string, body: string, tags: string, meta: DraftMetadata): Promise<{
    drafts: Draft[];
}>;
declare function updateDraft(code: string | undefined, draftId: string, title: string, body: string, tags: string, meta: DraftMetadata): Promise<{
    drafts: Draft[];
}>;
declare function deleteDraft(code: string | undefined, draftId: string): Promise<Record<string, unknown>>;
declare function addSchedule(code: string | undefined, permlink: string, title: string, body: string, meta: Record<string, unknown>, options: Record<string, unknown> | null, schedule: string, reblog: boolean): Promise<Record<string, unknown>>;
declare function deleteSchedule(code: string | undefined, id: string): Promise<Record<string, unknown>>;
declare function moveSchedule(code: string | undefined, id: string): Promise<Schedule[]>;
declare function getPromotedPost(code: string | undefined, author: string, permlink: string): Promise<{
    author: string;
    permlink: string;
} | "">;
declare function onboardEmail(username: string, email: string, friend: string): Promise<Record<string, unknown>>;

interface HsTokenRenewResponse {
    username: string;
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

declare function hsTokenRenew(code: string): Promise<HsTokenRenewResponse>;

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

type EngineOrderBookEntry = {
    txId: string;
    timestamp: number;
    account: string;
    symbol: string;
    quantity: string;
    price: string;
    tokensLocked?: string;
};
declare function getHiveEngineOrderBook<T = EngineOrderBookEntry>(symbol: string, limit?: number): Promise<{
    buy: T[];
    sell: T[];
}>;
declare function getHiveEngineTradeHistory<T = Record<string, unknown>>(symbol: string, limit?: number): Promise<T[]>;
declare function getHiveEngineOpenOrders<T = HiveEngineOpenOrder>(account: string, symbol: string, limit?: number): Promise<T[]>;
/**
 * Market metrics, optionally narrowed to one symbol or to a list of them.
 *
 * An unfiltered call is served from a single page – the node caps `find` at 1000 rows
 * while Hive engine has far more traded tokens than that – so callers that only care
 * about specific symbols must pass them. Scanning the unfiltered page for a symbol
 * silently reports "no market" for everything outside it.
 */
declare function getHiveEngineMetrics<T = Record<string, unknown>>(symbol?: string | string[], account?: string): Promise<T[]>;
declare function getHiveEngineTokensMarket<T = Record<string, unknown>>(account?: string, symbol?: string | string[]): Promise<T[]>;
declare function getHiveEngineTokensBalances<T = Record<string, unknown>>(username: string): Promise<T[]>;
declare function getHiveEngineTokensMetadata<T = Record<string, unknown>>(tokens: string[]): Promise<T[]>;
declare function getHiveEngineTokenTransactions<T = Record<string, unknown>>(username: string, symbol: string, limit: number, offset: number): Promise<T[]>;
declare function getHiveEngineTokenMetrics<T = Record<string, unknown>>(symbol: string, interval?: string): Promise<T[]>;
declare function getHiveEngineUnclaimedRewards<T = Record<string, unknown>>(username: string): Promise<Record<string, T>>;

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

declare function getBadActorsQueryOptions(): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Set<string>, Error, Set<string>, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Set<string>, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Set<string>;
        [dataTagErrorSymbol]: Error;
    };
};

declare const POLLS_PROTOCOL_VERSION = 1.1;
declare enum PollPreferredInterpretation {
    NUMBER_OF_VOTES = "number_of_votes",
    TOKENS = "tokens"
}
interface PollChoiceVotes {
    total_votes: number;
    hive_hp?: number;
    hive_proxied_hp?: number;
    hive_hp_incl_proxied: number | null;
}
interface PollChoice {
    choice_num: number;
    choice_text: string;
    votes?: PollChoiceVotes;
}
interface PollVoter {
    name: string;
    choices: number[];
    hive_hp?: number;
    hive_proxied_hp?: number;
    hive_hp_incl_proxied?: number;
}
interface PollStats {
    total_voting_accounts_num: number;
    total_hive_hp?: number;
    total_hive_proxied_hp?: number;
    total_hive_hp_incl_proxied: number | null;
}
interface Poll {
    author: string;
    permlink: string;
    question: string;
    poll_choices: PollChoice[];
    poll_voters?: PollVoter[];
    poll_stats?: PollStats;
    poll_trx_id: string;
    status: string;
    end_time: string;
    preferred_interpretation: PollPreferredInterpretation | string;
    max_choices_voted: number;
    filter_account_age_days: number;
    protocol_version: number;
    created: string;
    post_title: string;
    post_body: string;
    parent_permlink: string;
    tags: string[];
    image: unknown[];
    token?: string | null;
    community_membership?: string[];
    allow_vote_changes?: boolean;
    ui_hide_res_until_voted?: boolean;
    platform?: string;
}
declare function mapMetaChoicesToPollChoices(metaChoices: string[]): PollChoice[];

declare function getPollQueryOptions(author: string | undefined, permlink: string | undefined): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<Poll, Error, Poll, string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<Poll, string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: Poll;
        [dataTagErrorSymbol]: Error;
    };
};

interface PollVotePayload {
    pollTrxId: string;
    choices: number[];
}
declare function usePollVote(username: string | undefined, auth?: AuthContextV2, broadcastMode?: BroadcastMode): _tanstack_react_query.UseMutationResult<unknown, Error, PollVotePayload, unknown>;

export { ACCOUNT_OPERATION_GROUPS, ALL_ACCOUNT_OPERATIONS, ALL_NOTIFY_TYPES, type AccountBookmark, type AccountDelegations, type AccountFavorite, type AccountFollowStats, type AccountKeys, type AccountNotification, type AccountProfile, type AccountRelationship, type AccountReputation, type AggregatedBalanceEntry, type AiAssistParams, type AiAssistPrice, type AiAssistResponse, type AiGenerationPrice, type AiGenerationRequest, type AiGenerationResponse, type AiImagePowerTier, type AiImagePriceResponse, type Announcement, type ApiBookmarkNotification, type ApiDelegationsNotification, type ApiFavoriteNotification, type ApiFollowNotification, type ApiInactiveNotification, type ApiMentionNotification, type ApiNotification, type ApiNotificationSetting, type ApiPayoutsNotification, type ApiReblogNotification, type ApiReferralNotification, type ApiReplyNotification, type ApiResponse, type ApiScheduledPublishedNotification, type ApiSpinNotification, type ApiTransferNotification, type ApiVoteNotification, type ApiWeeklyEarningsNotification, type Asset, AssetOperation, type AuthContext, type AuthContextV2, type AuthMethod, type AuthorReward, Authority, type AuthorityLevel, type AuthorityType, BROADCAST_INCLUSION_DELAY_MS, type BalanceAggregationGranularity, type BalanceCoinType, type BalanceHistoryEntry, type BalanceHistoryResponse, type Beneficiary, type BlogEntry, type BoostPlusAccountPrice, type BoostPlusPayload, type BroadcastMode, BroadcastResult, type BuildProfileMetadataArgs, BuySellTransactionType, CONFIG, type CancelTransferFromSavings, type CantAfford, type CheckUsernameWalletsPendingResponse, type ClaimAccountPayload, type ClaimEngineRewardsPayload, type ClaimInterestPayload, type ClaimRewardBalance, type ClaimRewardsPayload, type CollateralizedConversionRequest, type CollateralizedConvert, type CommentBenefactor, type CommentPayload, type CommentPayoutUpdate, type CommentReward, type Communities, type Community, type CommunityProps, type CommunityRewardsRegisterPayload, type CommunityRole, type CommunityTeam, type CommunityType, ConfigManager, type ConversionRequest, type ConvertPayload, type CreateAccountPayload, type CrossPostPayload, type CurationDuration, type CurationItem, type CurationReward, type CurrencyRates, type DailyCheckinQuest, type DailyContentQuest, type DailyQuest, type DelegateEngineTokenPayload, type DelegateRcPayload, type DelegateVestingShares, type DelegateVestingSharesPayload, type DelegatedVestingShare, type DeleteCommentPayload, type DeletedEntry, type Draft, type DraftMetadata, type DraftRewardType, type DraftsWrappedResponse, type DynamicProps$1 as DynamicProps, index as EcencyAnalytics, EcencyQueriesManager, type EffectiveCommentVote, type EngineMarketOrderPayload, EntriesCacheManagement, type Entry$1 as Entry, type EntryBeneficiaryRoute, type EntryHeader, type EntryStat, type EntryVote, ErrorType, type FeedHistoryItem, type FillCollateralizedConvertRequest, type FillConvertRequest, type FillOrder, type FillRecurrentTransfers, type FillVestingWithdraw, type Follow, type FollowPayload, type Fragment, type FriendSearchResult, type FriendsPageParam, type FriendsRow, type FullAccount, type GameClaim, type GeneralAssetInfo, type GeneralAssetTransaction, type GenerateImageParams, type GetGameStatus, type GetRecoveriesEmailResponse, type GrantPostingPermissionPayload, HIVE_ACCOUNT_OPERATION_GROUPS, HIVE_OPERATION_LIST, HIVE_OPERATION_NAME_BY_ID, HIVE_OPERATION_ORDERS, type HiveBasedAssetSignType, type HiveEngineMarketResponse, type HiveEngineMetric, type HiveEngineOpenOrder, type HiveEngineOrderBookEntry, HiveEngineToken, type HiveEngineTokenBalance, type HiveEngineTokenInfo, type HiveEngineTokenMetadataResponse, type HiveEngineTokenStatus, type HiveEngineTransaction, type HiveHbdStats, type HiveMarketMetric, type HiveOperationFilter, type HiveOperationFilterKey, type HiveOperationFilterValue, type HiveOperationGroup, type HiveOperationName, HiveSignerIntegration, type HiveTransaction, type HsTokenRenewResponse, INTERNAL_API_TIMEOUT_MS, type IncomingDelegation, type IncomingRcDelegation, type IncomingRcResponse, type Interest, type JsonMetadata, type JsonPollMetadata, type Keys, type LeaderBoardDuration, type LeaderBoardItem, type LimitOrderCancel, type LimitOrderCancelPayload, type LimitOrderCreate, type LimitOrderCreatePayload, type MarketCandlestickDataItem, type MarketData, type MarketStatistics, type MedianHistoryPrice, type MutePostPayload, NaiMap, NotificationFilter, NotificationViewType, type Notifications, NotifyTypes, OPERATION_AUTHORITY_MAP, type OpenOrdersData, Operation, type OperationGroup, OperationName, OrderIdPrefix, type OrdersData, type OrdersDataItem, type OutgoingDelegation, POLLS_PROTOCOL_VERSION, type PageStatsResponse, type PaginationMeta, type ParsedChainError, type Payer, type PeriodQuest, type PinPostPayload, type PlatformAdapter, type PointTransaction, PointTransactionType, type Points, type PointsResponse, type Poll, type PollChoice, type PollChoiceVotes, PollPreferredInterpretation, type PollStats, type PollVotePayload, type PollVoter, type PortfolioResponse, type PortfolioWalletItem, type PostTip, type PostTipsResponse, PrivateKey, type ProMembersResponse, type ProducerReward, type Profile, type ProfileTokens, type PromotePayload, type PromotePrice, type Proposal, type ProposalCreatePayload, type ProposalPay, type ProposalVote, type ProposalVotePayload, type ProposalVoteRow, PublicKey, QUEST_CATALOG, QueryKeys, type QuestCatalogEntry, type QuestMilestone, type QuestPeriod, type QuestStreak, type QuestTier, type QuestsResponse, type RCAccount, ROLES, type RcDelegationActive, type RcDelegationPayload, type RcDirectDelegation, type RcDirectDelegationsResponse, type RcPrecheckInput, type RcPrecheckOperation, type RcPrecheckResult, type RcStats, type Reblog, type ReblogPayload, type ReceivedVestingShare, type RecordActivityOptions, type Recoveries, type RecurrentTransfer, type RecurrentTransfers, type ReferralItem, type ReferralItems, type ReferralStat, ResilienceOptions, type ReturnVestingDelegation, type RewardFund, type RewardedCommunity, SIMILAR_ENTRIES_MIN_RENDER, type SMTAsset, STREAK_FREEZE_MAX_OWNED, STREAK_FREEZE_PRICE, type SavingsWithdrawRequest, type Schedule, type SearchResponse, type SearchResult, type SetCommunityRolePayload, type SetLastReadPayload, type SetWithdrawRoute, type SetWithdrawVestingRoutePayload, type ShortVideo, type ShortsFeedEntry, type ShortsFeedParams, SortOrder, type Spotlight, type StakeEngineTokenPayload, type StatsResponse, type StreakFreezeBuyResult, type SubscribeCommunityPayload, type Subscription, type SupportSettings, Symbol, type ThreadItemEntry, ThreeSpeakIntegration, type ThreeSpeakVideo, type Token, type TokenMetadata, type Transaction, type TransactionConfirmation, type Transfer, type TransferEngineTokenPayload, type TransferFromSavingsPayload, type TransferPayload, type TransferPointPayload, type TransferToSavings, type TransferToSavingsPayload, type TransferToVesting, type TransferToVestingPayload, type TrendingTag, type UndelegateEngineTokenPayload, type UnfollowPayload, type UnstakeEngineTokenPayload, type UnsubscribeCommunityPayload, type UpdateCommunityPayload, type UpdateProposalVotes, type UpdateReplyPayload, type UpdateSupportSettingsPayload, type User, type UserImage, type ValidatePostCreatingOptions, type VestingDelegationExpiration, type Vote, type VoteHistoryPage, type VoteHistoryPageParam, type VotePayload, type VoteProxy, type WalletMetadataCandidate, type WalletOperationPayload, type WaveEntry, type WaveTrendingAuthor, type WaveTrendingTag, type WavesFeedEntry, type WavesFeedParams, type WithdrawRoute, type WithdrawVesting, type WithdrawVestingPayload, type Witness, type WitnessProxyPayload, type WitnessVotePayload, type WitnessVoter, type WitnessVoterSortDirection, type WitnessVoterSortField, type WitnessVotersResponse, type WrappedResponse, type WsBookmarkNotification, type WsDelegationsNotification, type WsFavoriteNotification, type WsFollowNotification, type WsInactiveNotification, type WsMentionNotification, type WsNotification, type WsPayoutsNotification, type WsReblogNotification, type WsReferralNotification, type WsReplyNotification, type WsSpinNotification, type WsTransferNotification, type WsVoteNotification, addDraft, addImage, addOptimisticDiscussionEntry, addSchedule, applySupportSettingsUpdate, applyVoteCacheUpdate, bridgeApiCall, broadcastJson, broadcastOperations, broadcastOperationsAsync, buildAccountCreateOp, buildAccountUpdate2Op, buildAccountUpdateOp, buildActiveCustomJsonOp, buildBoostPlusOp, buildCancelTransferFromSavingsOp, buildChangeRecoveryAccountOp, buildClaimAccountOp, buildClaimInterestOps, buildClaimRewardBalanceOp, buildCollateralizedConvertOp, buildCommentOp, buildCommentOptionsOp, buildCommunityRegistrationOp, buildConvertOp, buildCreateClaimedAccountOp, buildDelegateRcOp, buildDelegateVestingSharesOp, buildDeleteCommentOp, buildEngineClaimOp, buildEngineOp, buildFlagPostOp, buildFollowOp, buildGrantPostingPermissionOp, buildIgnoreOp, buildLimitOrderCancelOp, buildLimitOrderCreateOp, buildLimitOrderCreateOpWithType, buildMultiPointTransferOps, buildMultiTransferOps, buildMutePostOp, buildMuteUserOp, buildPinPostOp, buildPointTransferOp, buildPostingCustomJsonOp, buildPostingJsonMetadata, buildProfileMetadata, buildPromoteOp, buildProposalCreateOp, buildProposalVoteOp, buildRcDelegationOp, buildReblogOp, buildRecoverAccountOp, buildRecurrentTransferOp, buildRemoveProposalOp, buildRequestAccountRecoveryOp, buildRevokeKeysOp, buildRevokePostingPermissionOp, buildSetLastReadOps, buildSetRoleOp, buildSetWithdrawVestingRouteOp, buildSubscribeOp, buildTransferFromSavingsOp, buildTransferOp, buildTransferToSavingsOp, buildTransferToVestingOp, buildUnfollowOp, buildUnignoreOp, buildUnsubscribeOp, buildUpdateCommunityOp, buildUpdateProposalOp, buildVoteOp, buildWithdrawVestingOp, buildWitnessProxyOp, buildWitnessVoteOp, buyStreakFreezeRequest, calculateRCMana, calculateVPMana, canRevokeFromAuthority, checkFavoriteQueryOptions, checkUsernameWalletsPendingQueryOptions, claimPointsRequest, decodeObj, dedupeAndSortKeyAuths, deleteDraft, deleteImage, deleteSchedule, downVotingPower, encodeObj, estimateRcPrecheck, extractAccountProfile, formatError, formattedNumber, getAccountDelegationsQueryOptions, getAccountFullQueryOptions, getAccountNotificationsInfiniteQueryOptions, getAccountPendingRecoveryQueryOptions, getAccountPosts, getAccountPostsInfiniteQueryOptions, getAccountPostsQueryOptions, getAccountRcQueryOptions, getAccountRecoveriesQueryOptions, getAccountReputationsQueryOptions, getAccountSubscriptionsQueryOptions, getAccountVoteHistoryInfiniteQueryOptions, getAccountWalletAssetInfoQueryOptions, getAccountsQueryOptions, getAggregatedBalanceQueryOptions, getAiAssistPriceQueryOptions, getAiGeneratePriceQueryOptions, getAllHiveEngineTokensQueryOptions, getAnnouncementsQueryOptions, getBadActorsQueryOptions, getBalanceHistoryInfiniteQueryOptions, getBookmarksInfiniteQueryOptions, getBookmarksQueryOptions, getBoostPlusAccountPricesQueryOptions, getBoostPlusPricesQueryOptions, getBotsQueryOptions, getBoundFetch, getChainPropertiesQueryOptions, getCollateralizedConversionRequestsQueryOptions, getCommentHistoryQueryOptions, getCommunities, getCommunitiesQueryOptions, getCommunity, getCommunityContextQueryOptions, getCommunityPermissions, getCommunityQueryOptions, getCommunitySubscribersQueryOptions, getCommunityType, getContentQueryOptions, getContentRepliesQueryOptions, getControversialRisingInfiniteQueryOptions, getConversionRequestsQueryOptions, getCurrencyRate, getCurrencyRates, getCurrencyTokenRate, getCurrentMedianHistoryPriceQueryOptions, getCustomJsonAuthority, getDeletedEntryQueryOptions, getDiscoverCurationQueryOptions, getDiscoverLeaderboardQueryOptions, getDiscussion, getDiscussionQueryOptions, getDiscussionsQueryOptions, getDraftsInfiniteQueryOptions, getDraftsQueryOptions, getDynamicPropsQueryOptions, getEntryActiveVotesQueryOptions, getFavoritesInfiniteQueryOptions, getFavoritesQueryOptions, getFeedHistoryQueryOptions, getFollowCountQueryOptions, getFollowersQueryOptions, getFollowingQueryOptions, getFragmentsInfiniteQueryOptions, getFragmentsQueryOptions, getFriendsInfiniteQueryOptions, getGalleryImagesQueryOptions, getGameStatusCheckQueryOptions, getHbdAssetGeneralInfoQueryOptions, getHbdAssetTransactionsQueryOptions, getHiveAssetGeneralInfoQueryOptions, getHiveAssetMetricQueryOptions, getHiveAssetTransactionsQueryOptions, getHiveAssetWithdrawalRoutesQueryOptions, getHiveEngineBalancesWithUsdQueryOptions, getHiveEngineMetrics, getHiveEngineOpenOrders, getHiveEngineOrderBook, getHiveEngineTokenGeneralInfoQueryOptions, getHiveEngineTokenMetrics, getHiveEngineTokenTransactions, getHiveEngineTokenTransactionsQueryOptions, getHiveEngineTokensBalances, getHiveEngineTokensBalancesQueryOptions, getHiveEngineTokensMarket, getHiveEngineTokensMarketQueryOptions, getHiveEngineTokensMetadata, getHiveEngineTokensMetadataQueryOptions, getHiveEngineTokensMetricsQueryOptions, getHiveEngineTradeHistory, getHiveEngineUnclaimedRewards, getHiveEngineUnclaimedRewardsQueryOptions, getHiveHbdStatsQueryOptions, getHivePoshLinksQueryOptions, getHivePowerAssetGeneralInfoQueryOptions, getHivePowerAssetTransactionsQueryOptions, getHivePowerDelegatesInfiniteQueryOptions, getHivePowerDelegatingsQueryOptions, getHivePrice, getImagesInfiniteQueryOptions, getImagesQueryOptions, getIncomingRcQueryOptions, getMarketData, getMarketDataQueryOptions, getMarketHistoryQueryOptions, getMarketStatisticsQueryOptions, getMutedUsersQueryOptions, getNormalizePostQueryOptions, getNotificationSetting, getNotifications, getNotificationsInfiniteQueryOptions, getNotificationsSettingsQueryOptions, getNotificationsUnreadCountQueryOptions, getOpenOrdersQueryOptions, getOperationAuthority, getOrderBookQueryOptions, getOutgoingRcDelegationsInfiniteQueryOptions, getPageStatsQueryOptions, getPointsAssetGeneralInfoQueryOptions, getPointsAssetTransactionsQueryOptions, getPointsQueryOptions, getPollQueryOptions, getPortfolioQueryOptions, getPost, getPostHeader, getPostHeaderQueryOptions, getPostQueryOptions, getPostTipsQueryOptions, getPostsRanked, getPostsRankedInfiniteQueryOptions, getPostsRankedQueryOptions, getProMembersQueryOptions, getProfiles, getProfilesQueryOptions, getPromotePriceQueryOptions, getPromotedPost, getPromotedPostsQuery, getProposalAuthority, getProposalQueryOptions, getProposalVotesInfiniteQueryOptions, getProposalsQueryOptions, getQueryClient, getQuestCatalogEntry, getQuestsQueryOptions, getRcDelegationActiveQueryOptions, getRcDelegationPricesQueryOptions, getRcStatsQueryOptions, getRebloggedByQueryOptions, getReblogsQueryOptions, getReceivedVestingSharesQueryOptions, getRecurrentTransfersQueryOptions, getReferralsInfiniteQueryOptions, getReferralsStatsQueryOptions, getRelationshipBetweenAccounts, getRelationshipBetweenAccountsQueryOptions, getRequiredAuthority, getRewardFundQueryOptions, getRewardedCommunitiesQueryOptions, getSavingsWithdrawFromQueryOptions, getSchedulesInfiniteQueryOptions, getSchedulesQueryOptions, getSearchAccountQueryOptions, getSearchAccountsByUsernameQueryOptions, getSearchApiInfiniteQueryOptions, getSearchFriendsQueryOptions, getSearchPathQueryOptions, getSearchTopicsQueryOptions, getShortsFeedQueryOptions, getSimilarEntriesQueryOptions, getSpotlightsQueryOptions, getStatsQueryOptions, getSubscribers, getSubscriptions, getSupportSettingsQueryOptions, getSupportSettingsRequest, getTradeHistoryQueryOptions, getTransactionsInfiniteQueryOptions, getTrendingTagsQueryOptions, getTrendingTagsWithStatsQueryOptions, getUserPostVoteQueryOptions, getUserProposalVotesQueryOptions, getVestingDelegationExpirationsQueryOptions, getVestingDelegationsQueryOptions, getVisibleFirstLevelThreadItems, getWavesByAccountQueryOptions, getWavesByHostQueryOptions, getWavesByTagQueryOptions, getWavesFeedQueryOptions, getWavesFollowingQueryOptions, getWavesLatestFeedQueryOptions, getWavesTrendingAuthorsQueryOptions, getWavesTrendingTagsQueryOptions, getWithdrawRoutesQueryOptions, getWitnessVoterCountQueryOptions, getWitnessVotersPageQueryOptions, getWitnessesInfiniteQueryOptions, hsTokenRenew, invalidateAfterBroadcast, isCommunity, isEmptyDate, isInfoError, isNetworkError, isResourceCreditsError, isVoteAlreadyReflected, isWif, isWrappedResponse, lookupAccountsQueryOptions, makeQueryClient, mapMetaChoicesToPollChoices, mapThreadItemsToWaveEntries, markNotifications, moveSchedule, normalizePost, normalizeToWrappedResponse, normalizeWaveEntryFromApi, onboardEmail, parseAccounts, parseAsset, parseChainError, parsePostingMetadataRoot, parseProfileMetadata, pickRicherMetadataSnapshot, powerRechargeTime, proMembersSet, rcPower, removeOptimisticDiscussionEntry, resolveHiveOperationFilters, resolvePost, restoreDiscussionSnapshots, restoreEntryInCache, roleMap, saveNotificationSetting, search, searchPath, searchQueryOptions, sha256, shouldTriggerAuthFallback, signUp, similar, sortDiscussions, subscribeEmail, toEntryArray, updateDraft, updateEntryInCache, updateSupportSettingsRequest, uploadImage, uploadImageWithSignature, useAccountFavoriteAdd, useAccountFavoriteDelete, useAccountRelationsUpdate, useAccountRevokeKey, useAccountRevokePosting, useAccountUpdate, useAccountUpdateKeyAuths, useAccountUpdatePassword, useAccountUpdateRecovery, useAddDraft, useAddFragment, useAddImage, useAddSchedule, useAiAssist, useBookmarkAdd, useBookmarkDelete, useBoostPlus, useBroadcastMutation, useBuyStreakFreeze, useClaimAccount, useClaimEngineRewards, useClaimInterest, useClaimPoints, useClaimRewards, useComment, useConvert, useCreateAccount, useCrossPost, useDelegateEngineToken, useDelegateRc, useDelegateVestingShares, useDeleteComment, useDeleteDraft, useDeleteImage, useDeleteSchedule, useEditFragment, useEngineMarketOrder, useFollow, useGameClaim, useGenerateImage, useGrantPostingPermission, useLimitOrderCancel, useLimitOrderCreate, useMarkNotificationsRead, useMoveSchedule, useMutePost, usePinPost, usePollVote, usePromote, useProposalCreate, useProposalVote, useRcDelegation, useReblog, useRecordActivity, useRegisterCommunityRewards, useRemoveFragment, useSetCommunityRole, useSetLastRead, useSetWithdrawVestingRoute, useSignOperationByHivesigner, useSignOperationByKey, useSignOperationByKeychain, useStakeEngineToken, useSubscribeCommunity, useTransfer, useTransferEngineToken, useTransferFromSavings, useTransferPoint, useTransferToSavings, useTransferToVesting, useUndelegateEngineToken, useUnfollow, useUnstakeEngineToken, useUnsubscribeCommunity, useUpdateCommunity, useUpdateDraft, useUpdateReply, useUpdateSupportSettings, useUploadImage, useVote, useWalletOperation, useWithdrawVesting, useWitnessProxy, useWitnessVote, usrActivity, validatePostCreating, verifyPostOnAlternateNode, vestsToHp, votingPower, votingRshares, votingValue, withTimeoutSignal };
