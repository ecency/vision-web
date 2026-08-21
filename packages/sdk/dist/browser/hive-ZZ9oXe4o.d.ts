declare class Signature {
    data: Uint8Array;
    recovery: number;
    private compressed;
    /**
     * Creates a new Signature instance.
     * @param data Raw signature data (64 bytes)
     * @param recovery Recovery byte (0-3)
     * @param compressed Whether signature is compressed (default: true)
     */
    constructor(data: Uint8Array, recovery: number, compressed?: boolean);
    /**
     * Creates a Signature from a hex string.
     * @param string 130-character hex string containing signature and recovery data
     * @returns New Signature instance
     * @throws Error if input is not a string
     */
    static from(string: string): Signature;
    /**
     * Converts signature to 65-byte buffer format.
     * @returns 65-byte buffer containing recovery byte + signature data
     */
    toBuffer(): Uint8Array<ArrayBuffer>;
    /**
     * Returns signature as 130-character hex string.
     * @returns Hex string representation of signature
     */
    customToString(): string;
    /**
     * Returns signature as 130-character hex string.
     * Overrides Object.prototype.toString() so that String(sig) and
     * template literals produce the hex representation instead of "[object Object]".
     * @returns Hex string representation of signature
     */
    toString(): string;
    /**
     * Recovers the public key from this signature and message.
     * @param message 32-byte message hash (Uint8Array) or 64-character hex string
     * @returns PublicKey that created this signature
     * @throws Error if message is not a valid 32-byte SHA256 hash
     */
    getPublicKey(message: Uint8Array | string): PublicKey;
}

declare class PublicKey {
    key: Uint8Array;
    prefix: string;
    /**
     * Creates a new PublicKey instance from raw bytes.
     * @param key Raw public key bytes (33 bytes, compressed format)
     * @param prefix Optional address prefix (defaults to the current config.address_prefix)
     */
    constructor(key: Uint8Array, prefix?: string);
    /**
     * Creates a PublicKey from a string representation.
     * The expected prefix is read from config.address_prefix at call time, so
     * consumers can switch networks at runtime.
     * @param wif Public key string (e.g., "STM8m5UgaFAAYQRuaNejYdS8FVLVp9Ss3K1qAVk5de6F8s3HnVbvA")
     * @returns New PublicKey instance
     * @throws Error if the prefix, length, checksum, or curve point is invalid
     */
    static fromString(wif: string): PublicKey;
    /**
     * Creates a PublicKey from a string or returns the instance if already a PublicKey.
     * @param value Public key string or PublicKey instance
     * @returns New or existing PublicKey instance
     */
    static from(value: string | PublicKey): PublicKey;
    /**
     * Verifies a signature against a message hash.
     * @param message 32-byte message hash to verify
     * @param signature Signature to verify
     * @returns True if signature is valid, false otherwise
     */
    verify(message: Uint8Array, signature: Signature | string): boolean;
    /**
     * Returns the public key as a string for storage or transmission.
     * @returns Public key string with prefix (e.g., "STM8m5UgaFAAYQRuaNejYdS8FVLVp9Ss3K1qAVk5de6F8s3HnVbvA")
     */
    toString(): string;
    /**
     * Returns JSON representation (same as toString()).
     * @returns Public key string
     */
    toJSON(): string;
    /**
     * Returns a string representation for debugging.
     * @returns Formatted public key string
     */
    inspect(): string;
}

type KeyRole = 'owner' | 'active' | 'posting' | 'memo';
/**
 * ECDSA (secp256k1) private key for signing and encryption operations.
 * Handles key generation, derivation from seeds/passwords, and cryptographic operations.
 *
 * All private keys are stored internally as Uint8Array and can be converted to/from
 * Wallet Import Format (WIF) strings for storage and transmission.
 *
 * @example
 * ```typescript
 * // From WIF string
 * const key = PrivateKey.from('5JdeC9P7Pbd1uGdFVEsJ41EkEnADbbHGq6p1BwFxm6txNBsQnsw')
 *
 * // Generate random key
 * const randomKey = PrivateKey.randomKey()
 *
 * // From username and password
 * const loginKey = PrivateKey.fromLogin('username', 'password')
 *
 * // Sign a message
 * const signature = key.sign(someHash)
 *
 * // Get public key
 * const pubKey = key.createPublic()
 * ```
 */
declare class PrivateKey {
    key: Uint8Array;
    constructor(key: Uint8Array);
    /**
     * Creates a PrivateKey instance from a WIF string or raw Uint8Array.
     * Automatically detects the input type and uses the appropriate method.
     *
     * @param value - WIF formatted string or raw 32-byte key as Uint8Array
     * @returns New PrivateKey instance
     * @throws Error if the key format is invalid
     */
    static from(value: string | Uint8Array): PrivateKey;
    /**
     * Creates a PrivateKey from a Wallet Import Format (WIF) encoded string.
     *
     * @param wif - WIF encoded private key string
     * @returns New PrivateKey instance
     * @throws Error if WIF format is invalid or checksum fails
     */
    static fromString(wif: string): PrivateKey;
    /**
     * Creates a PrivateKey from a seed string or Uint8Array.
     * The seed is hashed with SHA256 to produce the private key.
     *
     * @param seed - Seed string (converted to bytes) or raw byte array
     * @returns New PrivateKey instance derived from seed
     */
    static fromSeed(seed: string | Uint8Array): PrivateKey;
    /**
     * Derives a PrivateKey from username, password, and role using Hive's key derivation scheme.
     * This generates the same keys that the Hive wallet uses for login-based keys.
     *
     * @param username - Hive username
     * @param password - Master password (or seed phrase)
     * @param role - Key role ('owner', 'active', 'posting', 'memo')
     * @returns New PrivateKey instance for the specified role
     */
    static fromLogin(username: string, password: string, role?: KeyRole): PrivateKey;
    /**
     * Signs a 32-byte message hash using ECDSA and returns a recoverable signature.
     * The signature includes recovery information to allow public key recovery.
     *
     * @param message - 32-byte message hash to sign (Uint8Array)
     * @returns Signature object containing the signature data
     */
    sign(message: Uint8Array): Signature;
    /**
     * Derives the corresponding public key for this private key.
     *
     * @param prefix - Optional address prefix (defaults to config.address_prefix)
     * @returns PublicKey instance derived from this private key
     */
    createPublic(prefix?: string): PublicKey;
    /**
     * Returns the private key as a Wallet Import Format (WIF) encoded string.
     * This includes network ID and checksum for safe storage/transmission.
     *
     * @returns WIF encoded private key string
     */
    toString(): string;
    /**
     * Returns a masked representation of the private key for debugging/logging.
     * Shows only the first and last 6 characters to avoid accidental exposure.
     * Use toString() to get the full key for export/serialization.
     *
     * @returns Masked key representation for safe logging
     */
    inspect(): string;
    /**
     * Computes a shared secret using ECDH key exchange for memo encryption.
     * The shared secret is used as a key for AES encryption/decryption.
     *
     * @param publicKey - Other party's public key
     * @returns 64-byte shared secret as Uint8Array
     */
    getSharedSecret(publicKey: PublicKey): Uint8Array;
    /**
     * Generates a new cryptographically secure random private key.
     * Uses the secp256k1 key generation algorithm for security.
     * This method may take up to 250ms due to entropy collection.
     *
     * @returns New randomly generated PrivateKey instance
     */
    static randomKey(): PrivateKey;
}

/** Class representing a hive asset,
 * e.g. `1.000 HIVE` or `12.112233 VESTS`. */
declare class Asset {
    amount: number;
    symbol: string;
    constructor(amount: number, symbol: string);
    /** Create a new Asset instance from a string, e.g. `42.000 HIVE`. */
    static fromString(string: string, expectedSymbol?: string | null): Asset;
    /**
     * Convenience to create new Asset.
     * @param symbol Symbol to use when created from number. Will also be used to validate
     *               the asset, throws if the passed value has a different symbol than this.
     */
    static from(value: number | string | Asset, symbol?: string | null): Asset;
    /** Return asset precision. */
    getPrecision(): 6 | 3;
    /** Return a string representation of this asset, e.g. `42.000 HIVE`. */
    toString(): string;
    toJSON(): string;
}

type AssetSymbol = 'HIVE' | 'HBD' | 'VESTS' | 'STEEM' | 'SBD' | 'TESTS' | 'TBD';
interface Authority {
    weight_threshold: number;
    account_auths: Array<[string, number]>;
    key_auths: Array<[string | PublicKey, number]>;
}
interface Beneficiary {
    account: string;
    weight: number;
}
interface Price {
    base: Asset | string;
    quote: Asset | string;
}
interface ChainProperties {
    account_creation_fee: Asset | string;
    maximum_block_size: number;
    hbd_interest_rate: number;
}
interface WitnessProps$1 {
    account_creation_fee?: Asset | string;
    account_subsidy_budget?: number;
    account_subsidy_decay?: number;
    key?: string | PublicKey;
    maximum_block_size?: number;
    new_signing_key?: string | PublicKey | null;
    hbd_exchange_rate?: Price;
    hbd_interest_rate?: number;
    url?: string;
}
interface VoteOperation {
    voter: string;
    author: string;
    permlink: string;
    weight: number;
}
interface CommentOperation {
    parent_author: string;
    parent_permlink: string;
    author: string;
    permlink: string;
    title: string;
    body: string;
    json_metadata: string;
}
interface TransferOperation {
    from: string;
    to: string;
    amount: Asset | string;
    memo: string;
}
interface TransferToVestingOperation {
    from: string;
    to: string;
    amount: Asset | string;
}
interface WithdrawVestingOperation {
    account: string;
    vesting_shares: Asset | string;
}
interface AccountCreateOperation {
    fee: Asset | string;
    creator: string;
    new_account_name: string;
    owner: Authority;
    active: Authority;
    posting: Authority;
    memo_key: string | PublicKey;
    json_metadata: string;
}
interface AccountCreateWithDelegationOperation {
    fee: Asset | string;
    delegation: Asset | string;
    creator: string;
    new_account_name: string;
    owner: Authority;
    active: Authority;
    posting: Authority;
    memo_key: string | PublicKey;
    json_metadata: string;
    extensions: [];
}
interface AccountUpdateOperation {
    account: string;
    owner?: Authority;
    active?: Authority;
    posting?: Authority;
    memo_key: string | PublicKey;
    json_metadata: string;
}
interface AccountUpdate2Operation {
    account: string;
    owner?: Authority;
    active?: Authority;
    posting?: Authority;
    memo_key?: string | PublicKey;
    json_metadata: string;
    posting_json_metadata: string;
    extensions: [];
}
interface AccountWitnessVoteOperation {
    account: string;
    witness: string;
    approve: boolean;
}
interface AccountWitnessProxyOperation {
    account: string;
    proxy: string;
}
interface ConvertOperation {
    owner: string;
    requestid: number;
    amount: Asset | string;
}
interface CollateralizedConvertOperation {
    owner: string;
    requestid: number;
    amount: Asset | string;
}
interface CustomOperation {
    required_auths: string[];
    id: number;
    data: Uint8Array | string;
}
interface CustomJsonOperation {
    required_auths: string[];
    required_posting_auths: string[];
    id: string;
    json: string;
}
interface ClaimAccountOperation {
    creator: string;
    fee: Asset | string;
    extensions: [];
}
interface CreateClaimedAccountOperation {
    creator: string;
    new_account_name: string;
    owner: Authority;
    active: Authority;
    posting: Authority;
    memo_key: string | PublicKey;
    json_metadata: string;
    extensions: [];
}
interface ClaimRewardBalanceOperation {
    account: string;
    reward_hive: Asset | string;
    reward_hbd: Asset | string;
    reward_vests: Asset | string;
}
interface DelegateVestingSharesOperation {
    delegator: string;
    delegatee: string;
    vesting_shares: Asset | string;
}
interface DeleteCommentOperation {
    author: string;
    permlink: string;
}
interface CommentOptionsOperation {
    author: string;
    permlink: string;
    max_accepted_payout: Asset | string;
    percent_hbd: number;
    allow_votes: boolean;
    allow_curation_rewards: boolean;
    extensions: [number, {
        beneficiaries: Beneficiary[];
    }][];
}
interface SetWithdrawVestingRouteOperation {
    from_account: string;
    to_account: string;
    percent: number;
    auto_vest: boolean;
}
interface WitnessUpdateOperation {
    owner: string;
    url: string;
    block_signing_key: string | PublicKey;
    props: ChainProperties;
    fee: Asset | string;
}
interface WitnessSetPropertiesOperation {
    owner: string;
    props: Array<[string, string]>;
    extensions: [];
}
interface DeclineVotingRightsOperation {
    account: string;
    decline: boolean;
}
interface ResetAccountOperation {
    reset_account: string;
    account_to_reset: string;
    new_owner_authority: Authority;
}
interface SetResetAccountOperation {
    account: string;
    current_reset_account: string;
    reset_account: string;
}
interface TransferToSavingsOperation {
    from: string;
    to: string;
    amount: Asset | string;
    memo: string;
}
interface TransferFromSavingsOperation {
    from: string;
    request_id: number;
    to: string;
    amount: Asset | string;
    memo: string;
}
interface CancelTransferFromSavingsOperation {
    from: string;
    request_id: number;
}
interface LimitOrderCreateOperation {
    owner: string;
    orderid: number;
    amount_to_sell: Asset | string;
    min_to_receive: Asset | string;
    fill_or_kill: boolean;
    expiration: string | Date;
}
interface LimitOrderCreate2Operation {
    owner: string;
    orderid: number;
    amount_to_sell: Asset | string;
    fill_or_kill: boolean;
    exchange_rate: Price;
    expiration: string | Date;
}
interface LimitOrderCancelOperation {
    owner: string;
    orderid: number;
}
interface FeedPublishOperation {
    publisher: string;
    exchange_rate: Price;
}
interface EscrowTransferOperation {
    from: string;
    to: string;
    hbd_amount: Asset | string;
    hive_amount: Asset | string;
    escrow_id: number;
    agent: string;
    fee: Asset | string;
    json_meta: string;
    ratification_deadline: string | Date;
    escrow_expiration: string | Date;
}
interface EscrowDisputeOperation {
    from: string;
    to: string;
    agent: string;
    who: string;
    escrow_id: number;
}
interface EscrowReleaseOperation {
    from: string;
    to: string;
    agent: string;
    who: string;
    receiver: string;
    escrow_id: number;
    hbd_amount: Asset | string;
    hive_amount: Asset | string;
}
interface EscrowApproveOperation {
    from: string;
    to: string;
    agent: string;
    who: string;
    escrow_id: number;
    approve: boolean;
}
interface RecoverAccountOperation {
    account_to_recover: string;
    new_owner_authority: Authority;
    recent_owner_authority: Authority;
    extensions: [];
}
interface RequestAccountRecoveryOperation {
    recovery_account: string;
    account_to_recover: string;
    new_owner_authority: Authority;
    extensions: [];
}
interface ChangeRecoveryAccountOperation {
    account_to_recover: string;
    new_recovery_account: string;
    extensions: [];
}
interface RecurrentTransferOperation {
    from: string;
    to: string;
    amount: Asset | string;
    memo: string;
    recurrence: number;
    executions: number;
    extensions: Array<{
        type: number;
        value: {
            pair_id: number;
        };
    }>;
}
interface CreateProposalOperation {
    creator: string;
    receiver: string;
    start_date: string | Date;
    end_date: string | Date;
    daily_pay: Asset | string;
    subject: string;
    permlink: string;
    extensions: [];
}
interface UpdateProposalOperation {
    proposal_id: number;
    creator: string;
    daily_pay: Asset | string;
    subject: string;
    permlink: string;
    extensions: [number, {
        end_date: string;
    }][];
}
interface UpdateProposalVotesOperation {
    voter: string;
    proposal_ids: number[];
    approve: boolean;
    extensions: [];
}
interface RemoveProposalOperation {
    proposal_owner: string;
    proposal_ids: number[];
    extensions: [];
}
type Operation = ['vote', VoteOperation] | ['comment', CommentOperation] | ['transfer', TransferOperation] | ['transfer_to_vesting', TransferToVestingOperation] | ['withdraw_vesting', WithdrawVestingOperation] | ['account_create', AccountCreateOperation] | ['account_create_with_delegation', AccountCreateWithDelegationOperation] | ['account_update', AccountUpdateOperation] | ['account_update2', AccountUpdate2Operation] | ['account_witness_vote', AccountWitnessVoteOperation] | ['account_witness_proxy', AccountWitnessProxyOperation] | ['convert', ConvertOperation] | ['collateralized_convert', CollateralizedConvertOperation] | ['custom', CustomOperation] | ['custom_json', CustomJsonOperation] | ['claim_account', ClaimAccountOperation] | ['create_claimed_account', CreateClaimedAccountOperation] | ['claim_reward_balance', ClaimRewardBalanceOperation] | ['delegate_vesting_shares', DelegateVestingSharesOperation] | ['delete_comment', DeleteCommentOperation] | ['comment_options', CommentOptionsOperation] | ['set_withdraw_vesting_route', SetWithdrawVestingRouteOperation] | ['witness_update', WitnessUpdateOperation] | ['witness_set_properties', WitnessSetPropertiesOperation] | ['decline_voting_rights', DeclineVotingRightsOperation] | ['reset_account', ResetAccountOperation] | ['set_reset_account', SetResetAccountOperation] | ['transfer_to_savings', TransferToSavingsOperation] | ['transfer_from_savings', TransferFromSavingsOperation] | ['cancel_transfer_from_savings', CancelTransferFromSavingsOperation] | ['limit_order_create', LimitOrderCreateOperation] | ['limit_order_create2', LimitOrderCreate2Operation] | ['limit_order_cancel', LimitOrderCancelOperation] | ['feed_publish', FeedPublishOperation] | ['escrow_transfer', EscrowTransferOperation] | ['escrow_dispute', EscrowDisputeOperation] | ['escrow_release', EscrowReleaseOperation] | ['escrow_approve', EscrowApproveOperation] | ['recover_account', RecoverAccountOperation] | ['request_account_recovery', RequestAccountRecoveryOperation] | ['change_recovery_account', ChangeRecoveryAccountOperation] | ['recurrent_transfer', RecurrentTransferOperation] | ['create_proposal', CreateProposalOperation] | ['update_proposal', UpdateProposalOperation] | ['update_proposal_votes', UpdateProposalVotesOperation] | ['remove_proposal', RemoveProposalOperation];
type OperationName = Operation[0];
type OperationBody<O extends OperationName> = Extract<Operation, [O, any]>[1];
type WitnessSetPropertiesParams = WitnessProps$1;
type Extension = [] | [string, unknown] | [number, unknown];
interface TransactionType {
    expiration: string;
    extensions: Extension[];
    operations: [OperationName, OperationBody<OperationName>][];
    ref_block_num: number;
    ref_block_prefix: number;
    signatures: string[];
}
interface BroadcastError {
    id: number;
    jsonrpc: string;
    error: {
        code: number;
        message: string;
        data?: any;
    };
}
type CallResponse<T = any> = {
    id: number;
    jsonrpc: string;
    result: T;
} | BroadcastError;
interface BroadcastResult {
    tx_id: string;
    status: 'unknown' | 'within_irreversible_block' | 'expired_irreversible' | 'too_old';
}
interface DigestData {
    digest: Uint8Array;
    txId: string;
}
interface TransactionStatus {
    status: 'unknown' | 'within_mempool' | 'within_reversible_block' | 'within_irreversible_block' | 'expired_reversible' | 'expired_irreversible' | 'too_old';
}

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
    fallbackByReason: Record<string, number>;
};
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
 * Broadcast-safe RPC call. Only retries on pre-connection errors where the
 * request definitively never reached the server (ECONNREFUSED, ENOTFOUND, etc.).
 * On timeouts, HTTP errors, or any ambiguous failure, throws immediately to
 * prevent double-broadcasting transactions.
 *
 * Tries each node once (no wrap-around) since broadcast retries are dangerous.
 *
 * @internal Used by Transaction.broadcast()
 */
declare const callRPCBroadcast: <T = any>(method: string, params?: any[] | object, timeout?: number, signal?: AbortSignal) => Promise<T>;
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

interface WitnessProps {
    account_creation_fee?: string;
    account_subsidy_budget?: number;
    account_subsidy_decay?: number;
    key: PublicKey | string;
    maximum_block_size?: number;
    new_signing_key?: PublicKey | string | null;
    hbd_exchange_rate?: {
        base: string;
        quote: string;
    };
    hbd_interest_rate?: number;
    url?: string;
}
/** Return null for a valid username */
declare const validateUsername: (username: string) => null | string;
declare const operations: {
    vote: number;
    comment: number;
    transfer: number;
    transfer_to_vesting: number;
    withdraw_vesting: number;
    limit_order_create: number;
    limit_order_cancel: number;
    feed_publish: number;
    convert: number;
    account_create: number;
    account_update: number;
    witness_update: number;
    account_witness_vote: number;
    account_witness_proxy: number;
    pow: number;
    custom: number;
    report_over_production: number;
    delete_comment: number;
    custom_json: number;
    comment_options: number;
    set_withdraw_vesting_route: number;
    limit_order_create2: number;
    claim_account: number;
    create_claimed_account: number;
    request_account_recovery: number;
    recover_account: number;
    change_recovery_account: number;
    escrow_transfer: number;
    escrow_dispute: number;
    escrow_release: number;
    pow2: number;
    escrow_approve: number;
    transfer_to_savings: number;
    transfer_from_savings: number;
    cancel_transfer_from_savings: number;
    custom_binary: number;
    decline_voting_rights: number;
    reset_account: number;
    set_reset_account: number;
    claim_reward_balance: number;
    delegate_vesting_shares: number;
    account_create_with_delegation: number;
    witness_set_properties: number;
    account_update2: number;
    create_proposal: number;
    update_proposal_votes: number;
    remove_proposal: number;
    update_proposal: number;
    collateralized_convert: number;
    recurrent_transfer: number;
    fill_convert_request: number;
    author_reward: number;
    curation_reward: number;
    comment_reward: number;
    liquidity_reward: number;
    interest: number;
    fill_vesting_withdraw: number;
    fill_order: number;
    shutdown_witness: number;
    fill_transfer_from_savings: number;
    hardfork: number;
    comment_payout_update: number;
    return_vesting_delegation: number;
    comment_benefactor_reward: number;
    producer_reward: number;
    clear_null_account_balance: number;
    proposal_pay: number;
    sps_fund: number;
    hardfork_hive: number;
    hardfork_hive_restore: number;
    delayed_voting: number;
    consolidate_treasury_balance: number;
    effective_comment_vote: number;
    ineffective_delete_comment: number;
    sps_convert: number;
    expired_account_notification: number;
    changed_recovery_account: number;
    transfer_to_vesting_completed: number;
    pow_reward: number;
    vesting_shares_split: number;
    account_created: number;
    fill_collateralized_convert_request: number;
    system_warning: number;
    fill_recurrent_transfer: number;
    failed_recurrent_transfer: number;
    limit_order_cancelled: number;
    producer_missed: number;
    proposal_fee: number;
    collateralized_convert_immediate_conversion: number;
    escrow_approved: number;
    escrow_rejected: number;
    proxy_cleared: number;
    declined_voting_rights: number;
};
/**
 * Make bitmask filter to be used with get_account_history call
 */
declare const makeBitMaskFilter: (allowedOperations: number[]) => [string | null, string | null];
declare const buildWitnessSetProperties: (owner: string, props: WitnessProps) => ["witness_set_properties", {
    extensions: never[];
    owner: string;
    props: any;
}];

type utils_WitnessProps = WitnessProps;
declare const utils_buildWitnessSetProperties: typeof buildWitnessSetProperties;
declare const utils_makeBitMaskFilter: typeof makeBitMaskFilter;
declare const utils_operations: typeof operations;
declare const utils_validateUsername: typeof validateUsername;
declare namespace utils {
  export { type utils_WitnessProps as WitnessProps, utils_buildWitnessSetProperties as buildWitnessSetProperties, utils_makeBitMaskFilter as makeBitMaskFilter, utils_operations as operations, utils_validateUsername as validateUsername };
}

export { type FeedPublishOperation as $, type APIMethods as A, type BroadcastResult as B, type CustomJsonOperation as C, type ClaimRewardBalanceOperation as D, type CollateralizedConvertOperation as E, type CommentOperation as F, type CommentOptionsOperation as G, type ConvertOperation as H, type CreateClaimedAccountOperation as I, type CreateProposalOperation as J, type CustomOperation as K, DEFAULT_SERVER_RPC_PROXY_METHODS as L, Memo as M, type DeclineVotingRightsOperation as N, type Operation as O, PrivateKey as P, type DelegateVestingSharesOperation as Q, type ResilienceOptions as R, type ServerRpcProxyOptions as S, Transaction as T, type DeleteCommentOperation as U, type DigestData as V, type EscrowApproveOperation as W, type EscrowDisputeOperation as X, type EscrowReleaseOperation as Y, type EscrowTransferOperation as Z, type Extension as _, type Authority as a, type LimitOrderCancelOperation as a0, type LimitOrderCreate2Operation as a1, type LimitOrderCreateOperation as a2, type Price as a3, RPCError as a4, type RecoverAccountOperation as a5, type RecurrentTransferOperation as a6, type RemoveProposalOperation as a7, type RequestAccountRecoveryOperation as a8, type ResetAccountOperation as a9, type SetResetAccountOperation as aa, type SetWithdrawVestingRouteOperation as ab, type TransactionStatus as ac, type TransactionType as ad, type TransferFromSavingsOperation as ae, type TransferOperation as af, type TransferToSavingsOperation as ag, type TransferToVestingOperation as ah, type UpdateProposalOperation as ai, type UpdateProposalVotesOperation as aj, type VoteOperation as ak, type WithdrawVestingOperation as al, type WitnessProps$1 as am, type WitnessSetPropertiesOperation as an, type WitnessSetPropertiesParams as ao, type WitnessUpdateOperation as ap, rpcProxyStats as aq, setNodes as ar, setResilience as as, setRestNodes as at, setRestNodesByApi as au, setServerRpcProxy as av, setUserAgent as aw, PublicKey as b, type OperationName as c, type AccountCreateOperation as d, type AssetSymbol as e, type OperationBody as f, Signature as g, callREST as h, callRPC as i, callRPCBroadcast as j, callWithQuorum as k, config as l, type AccountCreateWithDelegationOperation as m, type AccountUpdate2Operation as n, operations as o, type AccountUpdateOperation as p, type AccountWitnessProxyOperation as q, type AccountWitnessVoteOperation as r, type Beneficiary as s, type BroadcastError as t, utils as u, type CallResponse as v, type CancelTransferFromSavingsOperation as w, type ChainProperties as x, type ChangeRecoveryAccountOperation as y, type ClaimAccountOperation as z };
