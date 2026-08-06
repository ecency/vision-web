import type { Operation } from "../../../hive-tx";
import type { PlatformAdapter, AuthMethod } from "./platform-adapter";

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
export interface AuthContext {
  /** HiveSigner OAuth access token */
  accessToken?: string;
  /** Posting key in WIF format (null for Keychain/HiveAuth users) */
  postingKey?: string | null;
  /** Login method used ('key', 'hivesigner', 'keychain', 'hiveauth') */
  loginType?: string | null;
  /**
   * A caller-supplied broadcaster, for signing the platform adapter cannot do.
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
  broadcast?: (
    operations: Operation[],
    authority?: "active" | "posting" | "owner" | "memo"
  ) => Promise<unknown>;
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
export interface AuthContextV2 extends AuthContext {
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
