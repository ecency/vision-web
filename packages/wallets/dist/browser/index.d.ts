import * as _tanstack_react_query from '@tanstack/react-query';
import { UseMutationOptions } from '@tanstack/react-query';
import { AccountProfile, AuthContext, HiveEngineTokenMetadataResponse, AssetOperation } from '@ecency/sdk';
export { Asset, AssetOperation, AuthorReward, CancelTransferFromSavings, ClaimRewardBalance, CollateralizedConvert, CommentBenefactor, CommentPayoutUpdate, CommentReward, CurationReward, DelegateVestingShares, DelegatedVestingShare, EffectiveCommentVote, FillCollateralizedConvertRequest, FillConvertRequest, FillOrder, FillRecurrentTransfers, FillVestingWithdraw, GeneralAssetInfo, GeneralAssetTransaction, HIVE_ACCOUNT_OPERATION_GROUPS, HIVE_OPERATION_LIST, HIVE_OPERATION_NAME_BY_ID, HIVE_OPERATION_ORDERS, HiveBasedAssetSignType, HiveEngineMarketResponse, HiveEngineMetric, HiveEngineOpenOrder, HiveEngineOrderBookEntry, HiveEngineToken, HiveEngineTokenBalance, HiveEngineTokenInfo, HiveEngineTokenMetadataResponse, HiveEngineTokenStatus, HiveEngineTransaction, HiveMarketMetric, HiveOperationFilter, HiveOperationFilterKey, HiveOperationFilterValue, HiveOperationGroup, HiveOperationName, HiveTransaction, WithdrawRoute as HiveWithdrawRoute, Interest, LimitOrderCancel, LimitOrderCreate, NaiMap, PointTransaction, PointTransactionType, Points, PointsResponse, ProducerReward, ProposalPay, ReceivedVestingShare, RecurrentTransfers, ReturnVestingDelegation, SetWithdrawRoute, Symbol, Token, TokenMetadata, Transfer, TransferToSavings, TransferToVesting, UpdateProposalVotes, VoteProxy, WalletOperationPayload, WithdrawVesting, formattedNumber, getAccountWalletAssetInfoQueryOptions, getAllHiveEngineTokensQueryOptions, getHbdAssetGeneralInfoQueryOptions, getHbdAssetTransactionsQueryOptions, getHiveAssetGeneralInfoQueryOptions, getHiveAssetMetricQueryOptions, getHiveAssetTransactionsQueryOptions, getHiveAssetWithdrawalRoutesQueryOptions, getHiveEngineBalancesWithUsdQueryOptions, getHiveEngineTokenGeneralInfoQueryOptions, getHiveEngineTokenTransactionsQueryOptions, getHiveEngineTokensBalancesQueryOptions, getHiveEngineTokensMarketQueryOptions, getHiveEngineTokensMetadataQueryOptions, getHiveEngineTokensMetricsQueryOptions, getHiveEngineUnclaimedRewardsQueryOptions, getHivePowerAssetGeneralInfoQueryOptions, getHivePowerAssetTransactionsQueryOptions, getHivePowerDelegatesInfiniteQueryOptions, getHivePowerDelegatingsQueryOptions, getPointsAssetGeneralInfoQueryOptions, getPointsAssetTransactionsQueryOptions, getPointsQueryOptions, isEmptyDate, parseAsset, resolveHiveOperationFilters, useClaimPoints, useWalletOperation, vestsToHp } from '@ecency/sdk';

declare enum EcencyWalletCurrency {
    BTC = "BTC",
    ETH = "ETH",
    BNB = "BNB",
    SOL = "SOL"
}

declare enum EcencyWalletBasicTokens {
    Points = "POINTS",
    HivePower = "HP",
    Hive = "HIVE",
    HiveDollar = "HBD"
}

interface HiveKeys {
    ownerPublicKey?: string;
    activePublicKey?: string;
    postingPublicKey?: string;
    memoPublicKey?: string;
}
interface Payload$2 {
    currency: EcencyWalletCurrency;
    address: string;
    hiveKeys?: HiveKeys;
    walletAddresses?: Partial<Record<EcencyWalletCurrency, string>>;
}
declare function useCreateAccountWithWallets(username: string): _tanstack_react_query.UseMutationResult<Response, Error, Payload$2, unknown>;

interface Payload$1 {
    address: string;
    currency: EcencyWalletCurrency;
}
declare function useCheckWalletExistence(): _tanstack_react_query.UseMutationResult<boolean, Error, Payload$1, unknown>;

interface Payload {
    tokens: Record<string, string>;
    hiveKeys: {
        ownerPublicKey: string;
        activePublicKey: string;
        postingPublicKey: string;
        memoPublicKey: string;
    };
}
declare function useUpdateAccountWithWallets(username: string, accessToken: string | undefined): _tanstack_react_query.UseMutationResult<Response, Error, Payload, unknown>;

declare const index_useCheckWalletExistence: typeof useCheckWalletExistence;
declare const index_useCreateAccountWithWallets: typeof useCreateAccountWithWallets;
declare const index_useUpdateAccountWithWallets: typeof useUpdateAccountWithWallets;
declare namespace index {
  export { index_useCheckWalletExistence as useCheckWalletExistence, index_useCreateAccountWithWallets as useCreateAccountWithWallets, index_useUpdateAccountWithWallets as useUpdateAccountWithWallets };
}

interface EcencyTokenMetadata {
    address?: string;
    privateKey?: string;
    publicKey?: string;
    username?: string;
    currency?: string;
    custom?: boolean;
    type: string;
    /**
     * Represents showing of the token in the Ecency wallet
     */
    show?: boolean;
}

interface EcencyHiveKeys {
    username: string;
    owner: string;
    active: string;
    posting: string;
    memo: string;
    masterPassword: string;
    ownerPubkey: string;
    activePubkey: string;
    postingPubkey: string;
    memoPubkey: string;
}

interface AccountPointsResponse {
    points: string;
    unclaimed_points: string;
}

/**
 * Assemble the `profile.tokens` array to broadcast.
 *
 * `profile.tokens` is written wholesale, so whatever this returns IS the user's
 * new on-chain token list — anything omitted is deleted, and since no app other
 * than Ecency writes this field, the deletion is unrecoverable.
 *
 * Which entries survive depends on what the caller manages, inferred from the
 * payload itself:
 *
 * - A payload carrying non-chain entries comes from the wallet token picker,
 *   which owns the COMPLETE list — it always sends the basic Hive assets plus
 *   every selected engine token, and deselecting one means omitting it. Unlisted
 *   entries are therefore dropped, which is what the user asked for.
 * - A CHAIN-only payload comes from the external-wallet screens, which know
 *   nothing about engine tokens. Their unlisted entries are carried forward.
 *
 * Inferring rather than taking a flag keeps this fix inside the package (the
 * apps resolve it through the committed dist, so a new public option could not
 * be used by a caller until the next release). It is also safe in the degenerate
 * case: if the picker somehow submits before its token list has loaded, the
 * payload is chain-only and we preserve — the non-destructive outcome.
 *
 * @param existingTokens the account's current on-chain `profile.tokens`
 * @param tokens the caller's payload
 */
declare function buildTokensPayload(existingTokens: AccountProfile["tokens"], tokens: EcencyTokenMetadata[]): AccountProfile["tokens"];
/**
 * Saving of token(s) metadata to Hive profile
 * It may contain: external wallets(see EcencyWalletCurrency), Hive tokens arrangement
 *
 * Basically, this mutation is a convenient wrapper for update profile operation
 */
type SaveWalletInformationOptions = Pick<UseMutationOptions<unknown, Error, EcencyTokenMetadata[]>, "onSuccess" | "onError">;
declare function useSaveWalletInformationToMetadata(username: string, auth?: AuthContext, options?: SaveWalletInformationOptions): _tanstack_react_query.UseMutationResult<unknown, Error, EcencyTokenMetadata[], unknown>;

type TransferableCurrency = EcencyWalletCurrency.ETH | EcencyWalletCurrency.BNB | EcencyWalletCurrency.SOL;
interface ExternalTransferPayload {
    to: string;
    amount: string;
    /** EVM only: the linked wallet address. The send is blocked if the active
     *  MetaMask account does not match it (funds safety). */
    expectedFrom?: string;
}
declare function useExternalTransfer(currency: TransferableCurrency): _tanstack_react_query.UseMutationResult<{
    txHash: string;
    currency: EcencyWalletCurrency.ETH | EcencyWalletCurrency.BNB;
} | {
    txHash: string;
    currency: EcencyWalletCurrency.SOL;
}, Error, ExternalTransferPayload, unknown>;

interface ExternalWalletBalance {
    chain: string;
    unit: string;
    raw?: unknown;
    nodeId?: string;
    /**
     * Balance represented as a BigInt for convenience.
     */
    balanceBigInt: bigint;
    /**
     * Balance returned as a string to preserve precision for UIs that cannot
     * handle bigint values directly.
     */
    balanceString: string;
}
declare function useGetExternalWalletBalanceQuery(currency: EcencyWalletCurrency, address: string): _tanstack_react_query.UseQueryResult<ExternalWalletBalance, Error>;

declare function getTokenPriceQueryOptions(currency?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<number, Error, number, (string | undefined)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<number, (string | undefined)[], never> | undefined;
} & {
    queryKey: (string | undefined)[] & {
        [dataTagSymbol]: number;
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAllTokensListQueryOptions(username?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<{
    basic: EcencyWalletBasicTokens[];
    external: EcencyWalletCurrency[];
    layer2: HiveEngineTokenMetadataResponse[];
}, Error, {
    basic: EcencyWalletBasicTokens[];
    external: EcencyWalletCurrency[];
    layer2: HiveEngineTokenMetadataResponse[];
}, (string | null)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<{
        basic: EcencyWalletBasicTokens[];
        external: EcencyWalletCurrency[];
        layer2: HiveEngineTokenMetadataResponse[];
    }, (string | null)[], never> | undefined;
} & {
    queryKey: (string | null)[] & {
        [dataTagSymbol]: {
            basic: EcencyWalletBasicTokens[];
            external: EcencyWalletCurrency[];
            layer2: HiveEngineTokenMetadataResponse[];
        };
        [dataTagErrorSymbol]: Error;
    };
};

declare function getAccountWalletListQueryOptions(username: string, currency?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<string[], Error, string[], string[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<string[], string[], never> | undefined;
} & {
    queryKey: string[] & {
        [dataTagSymbol]: string[];
        [dataTagErrorSymbol]: Error;
    };
};

declare function getTokenOperationsQueryOptions(token: string, username: string, isForOwner?: boolean, currency?: string): _tanstack_react_query.OmitKeyof<_tanstack_react_query.UseQueryOptions<AssetOperation[], Error, AssetOperation[], (string | boolean)[]>, "queryFn"> & {
    queryFn?: _tanstack_react_query.QueryFunction<AssetOperation[], (string | boolean)[], never> | undefined;
} & {
    queryKey: (string | boolean)[] & {
        [dataTagSymbol]: AssetOperation[];
        [dataTagErrorSymbol]: Error;
    };
};

type HiveRole = "owner" | "active" | "posting" | "memo";
declare function deriveHiveKey(mnemonic: string, role: HiveRole, accountIndex?: number): {
    readonly privateKey: string;
    readonly publicKey: string;
};
declare function deriveHiveKeys(mnemonic: string, accountIndex?: number): {
    readonly owner: string;
    readonly active: string;
    readonly posting: string;
    readonly memo: string;
    readonly ownerPubkey: string;
    readonly activePubkey: string;
    readonly postingPubkey: string;
    readonly memoPubkey: string;
};

declare function deriveHiveMasterPasswordKey(username: string, masterPassword: string, role: HiveRole): {
    readonly privateKey: string;
    readonly publicKey: string;
};
declare function deriveHiveMasterPasswordKeys(username: string, masterPassword: string): {
    readonly owner: string;
    readonly active: string;
    readonly posting: string;
    readonly memo: string;
    readonly ownerPubkey: string;
    readonly activePubkey: string;
    readonly postingPubkey: string;
    readonly memoPubkey: string;
};

type HiveKeyDerivation = "bip44" | "master-password" | "unknown";
declare function detectHiveKeyDerivation(username: string, seed: string, type?: "active" | "owner"): Promise<HiveKeyDerivation>;

interface RequestArguments {
    method: string;
    params?: unknown[] | Record<string, unknown>;
}
interface EthereumProvider {
    isMetaMask?: boolean;
    request<T = unknown>(args: RequestArguments): Promise<T>;
}
declare global {
    interface Window {
        ethereum?: EthereumProvider;
    }
}
declare function getEvmChainConfig(currency: EcencyWalletCurrency): {
    chainId: string;
    name: string;
    rpcUrl: string;
    explorerUrl: string;
};
declare function getEvmExplorerUrl(currency: EcencyWalletCurrency, txHash: string): string;
declare function ensureEvmChain(currency: EcencyWalletCurrency): Promise<void>;
declare function estimateEvmGas(from: string, to: string, valueHex: string, currency: EcencyWalletCurrency): Promise<{
    gasLimit: string;
    gasPrice: string;
    estimatedFeeWei: bigint;
}>;
declare function formatWei(wei: bigint, decimals?: number): string;
declare function parseToWei(amount: string): string;
declare function sendEvmTransfer(to: string, amountWei: string, currency: EcencyWalletCurrency, expectedFrom?: string): Promise<string>;

declare function getSolExplorerUrl(signature: string): string;
declare function parseToLamports(amount: string): bigint;
declare function formatLamports(lamports: bigint, decimals?: number): string;
declare function sendSolTransfer(to: string, amountSol: string): Promise<string>;

type WalletAddressMap = Partial<Record<EcencyWalletCurrency, string>>;
interface HivePublicKey {
    publicKey: string;
    role?: string;
    accountIndex: number;
    addressIndex: number;
}
/**
 * Fetch non-EVM addresses from MetaMask via the Wallet Standard protocol.
 *
 * MetaMask registers non-EVM wallets (Solana, Bitcoin) as separate Wallet Standard
 * wallets — they are NOT accessible through window.ethereum (EVM-only provider).
 */
declare function fetchMultichainAddresses(): Promise<WalletAddressMap>;
/**
 * Fetch the EVM address from MetaMask via window.ethereum.
 * Returns the first connected account address, or undefined on failure.
 */
declare function fetchEvmAddress(): Promise<string | undefined>;
/**
 * Discover all wallet addresses from MetaMask (EVM + non-EVM).
 * Returns a map of currency -> address. Partial results are returned on failure.
 */
declare function discoverMetaMaskWallets(): Promise<WalletAddressMap>;
/**
 * Install the Hive Snap in MetaMask.
 */
declare function installHiveSnap(): Promise<void>;
/**
 * Get Hive public keys from the MetaMask Hive Snap.
 * Returns owner, active, posting, and memo public keys.
 */
declare function getHivePublicKeys(): Promise<HivePublicKey[]>;

export { type AccountPointsResponse, type EcencyHiveKeys, type EcencyTokenMetadata, EcencyWalletBasicTokens, EcencyWalletCurrency, index as EcencyWalletsPrivateApi, type ExternalWalletBalance, type HiveKeyDerivation, type HivePublicKey, type HiveRole, type TransferableCurrency, type WalletAddressMap, buildTokensPayload, deriveHiveKey, deriveHiveKeys, deriveHiveMasterPasswordKey, deriveHiveMasterPasswordKeys, detectHiveKeyDerivation, discoverMetaMaskWallets, ensureEvmChain, estimateEvmGas, fetchEvmAddress, fetchMultichainAddresses, formatLamports, formatWei, getAccountWalletListQueryOptions, getAllTokensListQueryOptions, getEvmChainConfig, getEvmExplorerUrl, getHivePublicKeys, getSolExplorerUrl, getTokenOperationsQueryOptions, getTokenPriceQueryOptions, installHiveSnap, parseToLamports, parseToWei, sendEvmTransfer, sendSolTransfer, useExternalTransfer, useGetExternalWalletBalanceQuery, useSaveWalletInformationToMetadata };
