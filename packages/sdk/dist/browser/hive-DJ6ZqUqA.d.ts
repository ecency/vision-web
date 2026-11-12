import { T as TransactionType, a as OperationName, e as OperationBody, P as PrivateKey, B as BroadcastResult, D as DigestData, f as TransactionStatus, b as PublicKey } from './utils-Cit-_MdN.js';

/**
 * Size every transaction may have whatever witnesses vote. Only a larger one
 * needs the live maximum_block_size to be judged.
 */
declare const MIN_TRANSACTION_SIZE_LIMIT: number;
/** Thrown before signing when a transaction can never be accepted by the chain. */
declare class TransactionTooLargeError extends Error {
    size: number;
    limit: number;
    constructor(size: number, limit: number);
}
interface TransactionReference {
    ref_block_num: number;
    ref_block_prefix: number;
    /** The witness-voted block size from the same properties, see Transaction.maximumBlockSize. */
    maximum_block_size?: number;
}
/**
 * The block reference (ref_block_num / ref_block_prefix) for a new transaction:
 * a block TAPOS_DEPTH behind head, whose id comes from the header of the block
 * after it (`previous`). If that header is missing or does not name the
 * expected block, it falls back to the head block, as before.
 */
declare const getTransactionReference: () => Promise<TransactionReference>;
interface TransactionOptions {
    transaction?: TransactionType | Transaction;
    /**
     * Transaction expiration in milliseconds (ms) - max 86400000 (24 hours)
     * @default 60_000
     */
    expiration?: number;
}
declare class Transaction {
    transaction?: TransactionType;
    expiration: number;
    /**
     * The chain's witness-voted maximum_block_size, which sets the largest
     * transaction hived accepts. Recorded from the dynamic global properties
     * fetched when the transaction is created; set it yourself for a
     * transaction built elsewhere, or only the protocol ceiling is enforced.
     */
    maximumBlockSize?: number;
    private txId?;
    constructor(options?: TransactionOptions);
    /**
     * Adds an operation to the transaction. If no transaction exists, creates one first.
     * @template O Operation name type for type safety
     * @param operationName The name/type of the operation to add (e.g., 'transfer', 'vote', 'comment')
     * @param operationBody The operation data/body for the specified operation type
     * @returns Promise that resolves when the operation is added
     * @throws Error if transaction creation fails or global properties cannot be retrieved
     */
    addOperation<O extends OperationName>(operationName: O, operationBody: OperationBody<O>): Promise<void>;
    /**
     * Signs the transaction with the provided key(s), supporting both single and multi-signature transactions.
     * For multi-signature, you can sign with all keys at once or sign individually by calling this method multiple times.
     * @param keys Single PrivateKey or array of PrivateKeys to sign the transaction with
     * @returns The signed transaction
     * @throws Error if no transaction exists to sign
     */
    sign(keys: PrivateKey | PrivateKey[]): TransactionType;
    /**
     * Broadcasts the signed transaction to the Hive network.
     * Automatically handles retries and duplicate transaction detection.
     * @param checkStatus By default (false) the transaction is not guaranteed to be included in a block.
     * For example the transaction can expire while waiting in mempool.
     * If you pass true here, the function will wait for the transaction to be either included or dropped
     * before returning a result.
     * @returns Promise resolving to broadcast result
     * @throws Error if no transaction exists or transaction is not signed or transaction got rejected
     */
    broadcast(checkStatus?: boolean): Promise<BroadcastResult>;
    /**
     * Returns the transaction digest containing the transaction ID and hash.
     * The digest can be used to verify signatures and for transaction identification.
     * @returns DigestData containing transaction ID and hash
     * @throws Error if no transaction exists
     */
    digest(): DigestData;
    /**
     * Serialized size of the transaction once it carries its current signatures
     * plus `extraSignatures` more. This is the size hived checks against
     * `maximum_block_size - 256`.
     */
    size(extraSignatures?: number): number;
    /**
     * Throws TransactionTooLargeError when the transaction, signed with
     * `extraSignatures` more signatures, would exceed what hived accepts under
     * `maximumBlockSize`, or under the largest block size the protocol allows
     * when it is unknown. Such a transaction is rejected by every node, so it
     * must never be signed.
     */
    assertSize(extraSignatures?: number): void;
    private serialize;
    /**
     * Adds a signature to an already created transaction. Useful when signing with external tools.
     * Multiple signatures can be added one at a time for multi-signature transactions.
     * @param signature The signature string in hex format (must be exactly 130 characters)
     * @returns The transaction with the added signature
     * @throws Error if no transaction exists or signature format is invalid
     */
    addSignature(signature: string): TransactionType;
    /** Get status of this transaction. Usually called internally after broadcasting. */
    checkStatus(): Promise<TransactionStatus>;
    /**
     * Creates the transaction structure and initializes it with blockchain data.
     * Retrieves current head block information and sets up reference block data.
     * @private
     * @param expiration Transaction expiration in milliseconds
     */
    private createTransaction;
}

/**
 * REST API method identifiers for Hive blockchain APIs.
 * Used by callREST() to route requests to the correct API path prefix.
 */
type APIMethods = 'balance' | 'hafah' | 'hafbe' | 'hivemind' | 'hivesense' | 'reputation' | 'nft-tracker' | 'hafsql' | 'status';

/**
 * Counters for the proxy path, readable by a host's diagnostics (the web
 * tier's event-loop monitor prints them). `served` = answered by the proxy,
 * `fallback` = proxy configured and eligible but the read went to the node
 * pool, with the reason.
 */
declare const rpcProxyStats: {
    served: number;
    fallback: number;
    /** Reads that went straight to the nodes because the breaker was open. */
    skipped: number;
    fallbackByReason: Record<string, number>;
};
/** Test seam: forget breaker state. */
declare function resetRpcProxyBreaker(): void;
declare class RPCError extends Error {
    name: string;
    data?: any;
    code: number;
    stack: undefined;
    constructor(rpcError: {
        message: string;
        code: number;
        data?: any;
    });
}
/** One JSON-RPC request: a method and its params. */
interface RpcCallSpec {
    method: string;
    params: any[] | object;
}
/** What `callRPCWithFallback` resolves with: the result and the method that produced it. */
interface RpcFallbackResult<T> {
    result: T;
    method: string;
}
/**
 * Makes API calls to Hive blockchain nodes with automatic retry and failover support.
 * Uses per-request retry counters, node health tracking, jitter between retries,
 * and HTTP status awareness (429 rate limiting, 503).
 *
 * If the current node fails, it will automatically try the next healthy node.
 * When all nodes have been tried, wraps around to give earlier nodes another chance
 * until the full retry budget (config.retry) is exhausted.
 * RPCErrors (valid blockchain rejections) are never retried.
 *
 * @param method - The API method name (e.g., 'condenser_api.get_accounts')
 * @param params - Parameters for the API method as array or object
 * @param timeout - Request timeout in milliseconds (default: config.timeout)
 * @param retry - Maximum number of retry attempts (default: config.retry). The
 *   wall-clock budget (`config.resilience.totalBudgetFactor` × timeout) may end
 *   the failover walk before the retry count is exhausted.
 * @param validate - Optional payload validation. Some nodes return a valid
 *   JSON-RPC envelope carrying an impossible payload (e.g. account rows with
 *   metadata fields stripped to ""), which no transport-level check can catch.
 *   When the callback returns false the response is treated as a node fault:
 *   recorded against that node's per-API health (repeat offenders get an API
 *   cooldown and are deprioritized) and the failover walk continues to the
 *   next node instead of returning the lie. Keep validators conservative —
 *   reject only payloads the caller KNOWS cannot be correct, or a strict
 *   validator turns every node's honest answer into a failover storm.
 * @returns Promise resolving to the API response
 * @throws {RPCError} On blockchain-level errors (bad params, missing authority, etc.)
 * @throws {Error} If all retry attempts fail
 *
 * @example
 * ```typescript
 * import { callRPC } from 'hive-tx'
 *
 * // Get account information
 * const accounts = await callRPC('condenser_api.get_accounts', [['alice']])
 *
 * // Custom timeout and retry settings
 * const data = await callRPC('condenser_api.get_content', ['alice', 'test-post'], 10_000, 5)
 * ```
 */
declare const callRPC: <T = any>(method: string, params?: any[] | object, timeout?: number, retry?: number, signal?: AbortSignal, validate?: (result: unknown) => boolean) => Promise<T>;
/**
 * Options for `callRPCWithFallback`; the same knobs `callRPC` takes positionally.
 */
interface CallRPCWithFallbackOptions {
    timeout?: number;
    retry?: number;
    signal?: AbortSignal;
    validate?: (result: unknown) => boolean;
}
/**
 * A read with a per-node fallback method, for methods that only some nodes
 * serve yet (bridge `*_v2`, `bridge.list_votes`). Each node is asked for the
 * primary method unless it answered `unknown method` for it (or for another
 * method of the same family) within the last 30 minutes; such an answer
 * switches that node to the fallback on the spot (same node, same attempt,
 * within what is left of the attempt's timeout). It is never counted as a node
 * failure and never triggers failover. It starts no hedge of its own; the
 * extra round trip is ordinary time on that attempt, so a hedge that was
 * already due can still fire while it runs. Every other error behaves exactly
 * as in `callRPC`. The server read cache (`setServerRpcProxy`) is handled the
 * same way, and a plain 404 from it for the primary method means the cache
 * does not serve that method yet.
 *
 * Resolves with the result and the method that produced it. Callers that
 * parse the result must still go by its SHAPE: a cache in front of the nodes
 * may answer a primary request with the fallback's shape.
 *
 * @example
 * ```typescript
 * const { result, method } = await callRPCWithFallback(
 *   { method: 'bridge.get_post_v2', params: { author, permlink, observer } },
 *   { method: 'bridge.get_post', params: { author, permlink, observer } }
 * )
 * ```
 */
declare const callRPCWithFallback: <T = any>(primary: RpcCallSpec, fallback: RpcCallSpec, options?: CallRPCWithFallbackOptions) => Promise<RpcFallbackResult<T>>;
/** One answer of a batch: the result, or the node's error for that request. */
type RpcBatchAnswer<T = any> = {
    result: T;
    error?: undefined;
} | {
    result?: undefined;
    error: RPCError | Error;
};
/**
 * Several reads in ONE HTTP request (a JSON-RPC batch array) to one node.
 * The batch fails over as a unit: an HTTP error, a transport failure or a
 * malformed answer moves the whole batch to the next healthy node, exactly
 * as `callRPC` moves one request. A JSON-RPC error for one request is that
 * request's answer (`{ error }`), not a node fault. Answers come back in the
 * order of `calls`. No server proxy and no hedging: this is for many small
 * reads a client issues at once (one vote lookup per card).
 */
declare const callRPCBatch: <T = any>(calls: RpcCallSpec[], options?: {
    timeout?: number;
    retry?: number;
    signal?: AbortSignal;
}) => Promise<RpcBatchAnswer<T>[]>;
/**
 * Broadcast-safe RPC call. Fails over only when re-sending the same signed
 * transaction is safe (see isBroadcastSafeToRetry). A timeout throws at once,
 * unless the caller passes `failoverOnTimeoutUntil`: see that option.
 *
 * Tries each node once (no wrap-around) since broadcast retries are dangerous.
 *
 * @internal Used by Transaction.broadcast()
 */
declare const callRPCBroadcast: <T = any>(method: string, params?: any[] | object, timeout?: number, signal?: AbortSignal, options?: {
    /**
     * Epoch ms until which a node's timeout fails over to the next node instead
     * of throwing. Only for callers that treat the next node's "Duplicate
     * transaction" answer as success (Transaction.broadcast), since the node
     * that timed out may have accepted the transaction. Set it short of the
     * transaction's expiration: a later node would answer "expired" for a
     * transaction the slow node may have included, which reads as definitive.
     */
    failoverOnTimeoutUntil?: number;
}) => Promise<T>;
/**
 * Makes REST API calls to Hive blockchain REST endpoints with automatic retry and failover support.
 * Uses per-request retry counters, node health tracking, and timeout support.
 * Wraps around the node list to honor the full retry budget.
 *
 * @template Api - The REST API method type (e.g., 'balance', 'hafah', 'hivemind', etc.)
 * @template P - The endpoint path type for the specified API
 *
 * @param api - The REST API method name to call
 * @param endpoint - The specific endpoint path within the API
 * @param params - Optional parameters for path and query string replacement
 * @param timeout - Request timeout in milliseconds (default: config.timeout)
 * @param retry - Number of retry attempts before throwing an error (default:
 *   config.retry). The wall-clock budget (`config.resilience.totalBudgetFactor`
 *   × timeout) may end the failover walk before the retry count is exhausted.
 *
 * @returns Promise resolving to the API response data with proper typing
 * @throws Error if all retry attempts fail
 *
 * @example
 * ```typescript
 * import { callREST } from 'hive-tx'
 *
 * // Get account balance
 * const balance = await callREST('balance', '/accounts/{account-name}/balances', { "account-name": 'alice' })
 *
 * // Custom timeout and retry settings
 * const data = await callREST('status', '/status', undefined, 10_000, 3)
 * ```
 */
declare function callREST(api: APIMethods, endpoint: string, params?: Record<string, any>, timeout?: number, retry?: number, signal?: AbortSignal): Promise<any>;
/**
 * Make a JSONRPC call with quorum. The method will cross-check the result
 * with `quorum` number of nodes before returning the result.
 * @param method - The API method name (e.g., 'condenser_api.get_accounts')
 * @param params - Parameters for the API method as array or object
 * @param quorum - Default: 2 (recommended)
 */
declare const callWithQuorum: <T = any>(method: string, params?: any[] | object, quorum?: number, signal?: AbortSignal) => Promise<T>;

/**
 * Unified configuration for Hive blockchain connectivity.
 * This is the single source of truth for node endpoints, timeouts, and chain settings.
 * Mutate this object directly or use ConfigManager.setHiveNodes() for validated updates.
 */
declare const config: {
    /**
     * Array of Hive API node endpoints for load balancing and failover.
     */
    nodes: string[];
    /**
     * Array of Hive API node endpoints that support REST APIs.
     * Note: Without the trailing /
     */
    restNodes: string[];
    /**
     * Per-API REST node override. Some APIs are served by only a subset of
     * nodes; list just those capable hosts here so callREST never burns its
     * (small) retry budget on nodes that 404/503 the API, and a cold start
     * hits a capable node immediately. Any API not listed falls back to
     * `restNodes`. The health tracker still orders *within* this list.
     *
     * hivesense: empirically only ~2 public nodes serve /hivesense-api (the
     * other configured nodes 404/503 it; Ecency's own was decommissioned), so
     * pin them — otherwise the health tracker keeps rediscovering incapable
     * nodes each cooldown and cold starts waste attempts.
     */
    restNodesByApi: Partial<Record<APIMethods, string[]>>;
    /**
     * User-Agent sent on server-side (Node) HTTP requests to Hive nodes.
     *
     * Node's built-in fetch (undici) sends a bare `User-Agent: node` when none is
     * set, which is indistinguishable from any random Node script in node/CDN
     * analytics. A descriptive value lets operators tell their own SSR/server
     * traffic apart from anonymous scrapers. Only applied in Node — browsers
     * forbid overriding User-Agent (it is silently dropped) and React Native sets
     * its own native UA, so client and mobile traffic are untouched. Override via
     * `ConfigManager.setUserAgent()` (or `setUserAgent()` from `@ecency/sdk/hive`).
     */
    userAgent: string;
    /**
     * The Hive blockchain chain ID for transaction signing and verification.
     */
    chain_id: string;
    /**
     * Address prefix used for public key formatting (STM for mainnet).
     */
    address_prefix: string;
    /**
     * Timeout in milliseconds for read API calls (get_content, get_accounts, etc.).
     * Kept short so the health tracker can fail over to another node quickly.
     */
    timeout: number;
    /**
     * Timeout in milliseconds for broadcast API calls.
     * Longer than read timeout because broadcast_transaction_synchronous waits
     * for block inclusion, which depends on the 3-second block interval and
     * network conditions.
     */
    broadcastTimeout: number;
    /**
     * Number of retry attempts for failed API calls before throwing an error.
     * Total attempts = retry + 1. With ~7 nodes in the list, a budget of 5
     * means callRPC iterates through 6 distinct nodes before giving up, so a
     * single sick node (or two) can't surface as an unhandled error to the
     * caller while the rest of the list is healthy.
     */
    retry: number;
    /**
     * Tail-latency resilience for READ calls. Motivation: on a shared public-node
     * pool a node can slow down or throttle *mid-request*; a fixed `timeout` means
     * the caller only notices after the full window, and under SSR concurrency
     * those stalled renders pile up. Two mechanisms, both scoped to reads only
     * (broadcasts never hedge and keep their fixed `broadcastTimeout`):
     *
     * - Adaptive per-attempt timeout (`adaptiveTimeout`, default ON): when a
     *   node has a usable latency profile (EWMA), the per-attempt timeout becomes
     *   `min(callerTimeout, max(floorMs, factor × EWMA))` — a node running far
     *   above its own baseline is abandoned early and failover starts sooner.
     *   Never *raises* the caller's timeout; unprofiled nodes keep it unchanged.
     *
     * - Hedged requests (`hedge`, default OFF — opt in via `setResilience`): if
     *   the primary attempt is still pending after `max(hedgeDelayFloorMs,
     *   hedgeDelayFactor × EWMA)`, a duplicate request is fired at the next
     *   healthy untried node and the first success wins (the loser is aborted).
     *   A token bucket (`hedgeBucketCapacity` burst, refilled by
     *   `hedgeRefillPerSuccess` per un-hedged success) caps hedges to roughly
     *   `hedgeRefillPerSuccess` of traffic, so only the slow tail hedges — and
     *   under pool-wide slowness the bucket drains and hedging auto-disables
     *   instead of amplifying load into public-node rate limits.
     */
    resilience: {
        adaptiveTimeout: boolean;
        adaptiveTimeoutFloorMs: number;
        adaptiveTimeoutFactor: number;
        hedge: boolean;
        hedgeDelayFloorMs: number;
        hedgeDelayFactor: number;
        hedgeBucketCapacity: number;
        hedgeRefillPerSuccess: number;
        /**
         * Wall-clock budget for one read call across ALL failover attempts, as a
         * multiple of the per-attempt timeout: no NEW attempt starts past
         * `totalBudgetFactor × timeout` (an in-flight attempt still finishes its
         * own window). Bounds the pathological pool-wide-slowness walk — without
         * it a read could hold its caller for (retry+1) × timeout ≈ 30s, which
         * under SSR concurrency is a memory pile-up, the exact incident this
         * feature exists for. Applies to reads only (callRPC / callREST);
         * broadcasts keep their try-each-node-once semantics.
         */
        totalBudgetFactor: number;
    };
};
/** Shape of the `config.resilience` bag (see its doc comment). */
type ResilienceOptions = typeof config.resilience;
/**
 * Server-side read-through proxy for RPC reads (see `setServerRpcProxy`).
 * `methods` is the allowlist the proxy serves; a read outside it goes straight
 * to the node pool as before.
 */
interface ServerRpcProxyOptions {
    /** Absolute URL of the proxy endpoint (POST `{api, method, params}`). */
    url: string;
    /** Headers sent with every proxy call (the shared internal secret). */
    headers: Record<string, string>;
    /** Per-call timeout in ms; on expiry the read falls back to the node pool. */
    timeoutMs: number;
    /** Fully qualified method names (`bridge.get_post`) the proxy may answer;
     * omitted = DEFAULT_SERVER_RPC_PROXY_METHODS. An empty list is ignored. */
    methods?: string[];
    /**
     * After this many consecutive proxy misses the proxy is skipped for
     * `cooldownMs`, so a proxy that is down costs one failed call per cooldown
     * window rather than one per read. Default 3 / 10s. A served call resets it.
     */
    failureThreshold?: number;
    cooldownMs?: number;
}
/** Default allowlist: the reads a server render makes and the proxy caches. */
declare const DEFAULT_SERVER_RPC_PROXY_METHODS: readonly string[];
/**
 * Route allowlisted server-side reads through a read-through cache in front
 * of the node pool. One cache per host answers the reads every renderer
 * process used to make on its own; a miss there is one upstream call shared by
 * every concurrent reader. The proxy is an optimization, never a dependency:
 * any failure (non-200, timeout, transport error, a response the caller's
 * validator rejects) falls straight through to the existing node loop, so the
 * worst case is the latency of a failed proxy call on top of what happens
 * today. Has no effect outside Node. Pass null to switch it off.
 */
declare const setServerRpcProxy: (opts: ServerRpcProxyOptions | null) => void;
declare const setNodes: (nodes: string[]) => void;
/**
 * Validated setter for the REST-API node list — replaces `config.restNodes`.
 * Same shape/guarantees as `setNodes` (trim, drop non-http(s), de-dupe, no-op on
 * empty). Exists because `restNodes` is otherwise baked into the SDK: an app that
 * wants to add/remove a REST host (e.g. drop an own node it is decommissioning, or
 * widen the public pool) previously had to fork + republish the SDK. With this, the
 * REST pool is app-configurable at runtime exactly like the read pool. Lives in the
 * React-free `hive-tx` core so both the full `@ecency/sdk` entry and the lean
 * `@ecency/sdk/hive` entry can reach it.
 */
declare const setRestNodes: (nodes: string[]) => void;
/**
 * Merge validated per-API REST node overrides into `config.restNodesByApi`.
 * For each entry: a non-empty, valid list pins that API to those hosts; an empty or
 * all-invalid list REMOVES the pin so the API falls back to `restNodes`. Other APIs'
 * existing pins (e.g. the built-in `hivesense`) are preserved. Lets an app pin the
 * APIs it actually uses to known-capable hosts (so `callREST` never burns its small
 * retry budget on a node that 404/503s the API) without an SDK republish.
 */
declare const setRestNodesByApi: (map: Partial<Record<APIMethods, string[]>>) => void;
/**
 * Validated setter for the User-Agent sent on server-side (Node) requests.
 * Trims the input and ignores an empty value so a bad input can't blank out the
 * header. Like `setNodes`, it lives in the React-free `hive-tx` core so it is
 * reachable from both the full `@ecency/sdk` entry (via
 * `ConfigManager.setUserAgent`) and the lean `@ecency/sdk/hive` server/CLI entry.
 */
declare const setUserAgent: (ua: string) => void;
/**
 * Validated partial setter for `config.resilience` (adaptive read timeouts +
 * hedged requests — see the field's doc comment). Booleans must be booleans;
 * numeric fields must be finite and positive, with the refill rate additionally
 * capped at 1 so a typo can't turn the tail-hedge into a traffic doubler
 * (refill ≤ 1 ⇒ hedges can never exceed un-hedged successes). Invalid values
 * are ignored field-by-field, so one bad entry can't block the rest. Lives in
 * the React-free `hive-tx` core (like the other setters) so both `@ecency/sdk`
 * (via `ConfigManager.setResilience`) and the lean `@ecency/sdk/hive` entry
 * can reach it.
 */
declare const setResilience: (opts: Partial<ResilienceOptions>) => void;

type Memo = {
    /**
     * Encrypts a memo for secure private messaging
     */
    encode(privateKey: string | PrivateKey, publicKey: string | PublicKey, memo: string, testNonce?: any): string;
    /**
     * Decrypts a memo message
     */
    decode(privateKey: string | PrivateKey, memo: string): string;
};
/**
 * Memo utilities for encrypting and decrypting private messages between Hive users.
 * Uses AES encryption with ECDH key exchange for secure communication.
 *
 * Messages must start with '#' to be encrypted/decrypted.
 * Plain text messages (without '#') are returned unchanged.
 *
 * @example
 * ```typescript
 * import { Memo, PrivateKey, PublicKey } from 'hive-tx'
 *
 * // Encrypt a message
 * const encrypted = Memo.encode(senderPrivateKey, recipientPublicKey, '#Hello World')
 *
 * // Decrypt a message
 * const decrypted = Memo.decode(recipientPrivateKey, encrypted)
 * console.log(decrypted) // '#Hello World'
 * ```
 */
declare const Memo: {
    decode: (privateKey: string | PrivateKey, memo: string) => string;
    encode: (privateKey: string | PrivateKey, publicKey: string | PublicKey, memo: string, testNonce?: any) => string;
};

export { type APIMethods as A, type CallRPCWithFallbackOptions as C, DEFAULT_SERVER_RPC_PROXY_METHODS as D, MIN_TRANSACTION_SIZE_LIMIT as M, type ResilienceOptions as R, type ServerRpcProxyOptions as S, Transaction as T, Memo as a, type RpcBatchAnswer as b, type RpcCallSpec as c, type RpcFallbackResult as d, type TransactionReference as e, TransactionTooLargeError as f, callREST as g, callRPC as h, callRPCBatch as i, callRPCBroadcast as j, callRPCWithFallback as k, callWithQuorum as l, getTransactionReference as m, config as n, RPCError as o, resetRpcProxyBreaker as p, setResilience as q, rpcProxyStats as r, setNodes as s, setRestNodes as t, setRestNodesByApi as u, setServerRpcProxy as v, setUserAgent as w };
