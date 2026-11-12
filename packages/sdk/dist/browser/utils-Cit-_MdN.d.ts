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
    getPrecision(): 3 | 6;
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

export { type ResetAccountOperation as $, type Authority as A, type BroadcastResult as B, type CustomJsonOperation as C, type DigestData as D, type CreateProposalOperation as E, type CustomOperation as F, type DeclineVotingRightsOperation as G, type DelegateVestingSharesOperation as H, type DeleteCommentOperation as I, type EscrowApproveOperation as J, type EscrowDisputeOperation as K, type EscrowReleaseOperation as L, type EscrowTransferOperation as M, type Extension as N, type Operation as O, PrivateKey as P, type FeedPublishOperation as Q, type LimitOrderCancelOperation as R, Signature as S, type TransactionType as T, type LimitOrderCreate2Operation as U, type LimitOrderCreateOperation as V, type Price as W, type RecoverAccountOperation as X, type RecurrentTransferOperation as Y, type RemoveProposalOperation as Z, type RequestAccountRecoveryOperation as _, type OperationName as a, type SetResetAccountOperation as a0, type SetWithdrawVestingRouteOperation as a1, type TransferFromSavingsOperation as a2, type TransferOperation as a3, type TransferToSavingsOperation as a4, type TransferToVestingOperation as a5, type UpdateProposalOperation as a6, type UpdateProposalVotesOperation as a7, type VoteOperation as a8, type WithdrawVestingOperation as a9, type WitnessProps$1 as aa, type WitnessSetPropertiesOperation as ab, type WitnessSetPropertiesParams as ac, type WitnessUpdateOperation as ad, PublicKey as b, type AccountCreateOperation as c, type AssetSymbol as d, type OperationBody as e, type TransactionStatus as f, type AccountCreateWithDelegationOperation as g, type AccountUpdate2Operation as h, type AccountUpdateOperation as i, type AccountWitnessProxyOperation as j, type AccountWitnessVoteOperation as k, type Beneficiary as l, type BroadcastError as m, type CallResponse as n, operations as o, type CancelTransferFromSavingsOperation as p, type ChainProperties as q, type ChangeRecoveryAccountOperation as r, type ClaimAccountOperation as s, type ClaimRewardBalanceOperation as t, utils as u, type CollateralizedConvertOperation as v, type CommentOperation as w, type CommentOptionsOperation as x, type ConvertOperation as y, type CreateClaimedAccountOperation as z };
