import { ConfigManager, getPortfolioQueryOptions, getQueryClient, getAccountFullQueryOptions, AssetOperation, useAccountUpdate, PrivateKey, CONFIG, getHiveEngineTokensBalancesQueryOptions, getHiveEngineTokensMetadataQueryOptions } from '@ecency/sdk';
export { AssetOperation, HIVE_ACCOUNT_OPERATION_GROUPS, HIVE_OPERATION_LIST, HIVE_OPERATION_NAME_BY_ID, HIVE_OPERATION_ORDERS, HiveEngineToken, NaiMap, PointTransactionType, Symbol, formattedNumber, getAccountWalletAssetInfoQueryOptions, getAllHiveEngineTokensQueryOptions, getHbdAssetGeneralInfoQueryOptions, getHbdAssetTransactionsQueryOptions, getHiveAssetGeneralInfoQueryOptions, getHiveAssetMetricQueryOptions, getHiveAssetTransactionsQueryOptions, getHiveAssetWithdrawalRoutesQueryOptions, getHiveEngineBalancesWithUsdQueryOptions, getHiveEngineTokenGeneralInfoQueryOptions, getHiveEngineTokenTransactionsQueryOptions, getHiveEngineTokensBalancesQueryOptions, getHiveEngineTokensMarketQueryOptions, getHiveEngineTokensMetadataQueryOptions, getHiveEngineTokensMetricsQueryOptions, getHiveEngineUnclaimedRewardsQueryOptions, getHivePowerAssetGeneralInfoQueryOptions, getHivePowerAssetTransactionsQueryOptions, getHivePowerDelegatesInfiniteQueryOptions, getHivePowerDelegatingsQueryOptions, getPointsAssetGeneralInfoQueryOptions, getPointsAssetTransactionsQueryOptions, getPointsQueryOptions, isEmptyDate, parseAsset, resolveHiveOperationFilters, useClaimPoints, useWalletOperation, vestsToHp } from '@ecency/sdk';
import { useMutation, useQuery, queryOptions, useQueryClient } from '@tanstack/react-query';
import * as R from 'remeda';
import { LRUCache } from 'lru-cache';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';

var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/internal/scrypt-guard.ts
var globalLike = globalThis;
if (typeof globalLike._scrypt_bsv !== "undefined") {
  if (typeof globalLike._scrypt_bsv === "string") {
    globalLike.__scryptBsvPreviousVersion = globalLike._scrypt_bsv;
  }
  try {
    delete globalLike._scrypt_bsv;
  } catch {
    globalLike._scrypt_bsv = void 0;
  }
}
if (typeof globalLike._bitcore !== "undefined") {
  if (typeof globalLike._bitcore === "object") {
    globalLike.__bitcorePreviousVersion = globalLike._bitcore;
  }
  try {
    delete globalLike._bitcore;
  } catch {
    globalLike._bitcore = void 0;
  }
}
function rememberScryptBsvVersion() {
  if (typeof globalLike._scrypt_bsv === "string") {
    globalLike.__scryptBsvPreviousVersion = globalLike._scrypt_bsv;
  }
  if (typeof globalLike._bitcore === "object") {
    globalLike.__bitcorePreviousVersion = globalLike._bitcore;
  }
}

// src/modules/wallets/enums/ecency-wallet-currency.ts
var EcencyWalletCurrency = /* @__PURE__ */ ((EcencyWalletCurrency2) => {
  EcencyWalletCurrency2["BTC"] = "BTC";
  EcencyWalletCurrency2["ETH"] = "ETH";
  EcencyWalletCurrency2["BNB"] = "BNB";
  EcencyWalletCurrency2["SOL"] = "SOL";
  return EcencyWalletCurrency2;
})(EcencyWalletCurrency || {});

// src/modules/wallets/enums/ecency-wallet-basic-tokens.ts
var EcencyWalletBasicTokens = /* @__PURE__ */ ((EcencyWalletBasicTokens2) => {
  EcencyWalletBasicTokens2["Points"] = "POINTS";
  EcencyWalletBasicTokens2["HivePower"] = "HP";
  EcencyWalletBasicTokens2["Hive"] = "HIVE";
  EcencyWalletBasicTokens2["HiveDollar"] = "HBD";
  return EcencyWalletBasicTokens2;
})(EcencyWalletBasicTokens || {});

// src/modules/wallets/mutations/private-api/index.ts
var private_api_exports = {};
__export(private_api_exports, {
  useCheckWalletExistence: () => useCheckWalletExistence,
  useCreateAccountWithWallets: () => useCreateAccountWithWallets,
  useUpdateAccountWithWallets: () => useUpdateAccountWithWallets
});

// src/modules/wallets/utils/get-bound-fetch.ts
var cachedFetch;
function getBoundFetch() {
  if (!cachedFetch) {
    if (typeof globalThis.fetch !== "function") {
      throw new Error("[Ecency][Wallets] - global fetch is not available");
    }
    cachedFetch = globalThis.fetch.bind(globalThis);
  }
  return cachedFetch;
}
function useCreateAccountWithWallets(username) {
  const fetchApi = getBoundFetch();
  return useMutation({
    mutationKey: ["ecency-wallets", "create-account-with-wallets", username],
    mutationFn: async ({ currency, address, hiveKeys, walletAddresses }) => {
      const addresses = {};
      if (walletAddresses) {
        for (const [k, v] of Object.entries(walletAddresses)) {
          if (v) addresses[k] = v;
        }
      }
      const response = await fetchApi(`${ConfigManager.getValidatedBaseUrl()}/private-api/wallets-add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          token: currency,
          address,
          meta: {
            ...hiveKeys,
            ...addresses,
            [currency]: address
          }
        })
      });
      if (!response.ok) {
        throw new Error(`Account creation failed (${response.status})`);
      }
      return response;
    }
  });
}
function useCheckWalletExistence() {
  return useMutation({
    mutationKey: ["ecency-wallets", "check-wallet-existence"],
    mutationFn: async ({ address, currency }) => {
      const response = await fetch(
        `${ConfigManager.getValidatedBaseUrl()}/private-api/wallets-exist`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            address,
            token: currency
          })
        }
      );
      const data = await response.json();
      return data.length === 0;
    }
  });
}
function useUpdateAccountWithWallets(username, accessToken) {
  const fetchApi = getBoundFetch();
  return useMutation({
    mutationKey: ["ecency-wallets", "update-account-with-wallets", username],
    mutationFn: async ({ tokens, hiveKeys }) => {
      const entries = Object.entries(tokens).filter(([, address]) => Boolean(address));
      if (entries.length === 0) {
        return new Response(null, { status: 204 });
      }
      const [primaryToken, primaryAddress] = entries[0] ?? ["", ""];
      if (!accessToken) {
        throw new Error(
          "[SDK][Wallets][PrivateApi][WalletsAdd] \u2013 access token wasn`t found"
        );
      }
      const response = await fetchApi(`${ConfigManager.getValidatedBaseUrl()}/private-api/wallets-add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          code: accessToken,
          token: primaryToken,
          address: primaryAddress,
          status: 3,
          meta: {
            ...Object.fromEntries(entries),
            ownerPublicKey: hiveKeys.ownerPublicKey,
            activePublicKey: hiveKeys.activePublicKey,
            postingPublicKey: hiveKeys.postingPublicKey,
            memoPublicKey: hiveKeys.memoPublicKey
          }
        })
      });
      if (!response.ok) {
        throw new Error(
          `[SDK][Wallets][PrivateApi][WalletsAdd] \u2013 request failed: ${response.status}`
        );
      }
      return response;
    }
  });
}
var currencyChainMap = {
  ["BTC" /* BTC */]: "btc",
  ["ETH" /* ETH */]: "eth",
  ["BNB" /* BNB */]: "bnb",
  ["SOL" /* SOL */]: "sol"
};
function normalizeBalance(balance) {
  if (typeof balance === "number") {
    if (!Number.isFinite(balance)) {
      throw new Error("Private API returned a non-finite numeric balance");
    }
    return Math.trunc(balance).toString();
  }
  if (typeof balance === "string") {
    const trimmed = balance.trim();
    if (trimmed === "") {
      throw new Error("Private API returned an empty balance string");
    }
    return trimmed;
  }
  throw new Error("Private API returned balance in an unexpected format");
}
function parsePrivateApiBalance(result, expectedChain) {
  if (!result || typeof result !== "object") {
    throw new Error("Private API returned an unexpected response");
  }
  const { chain, balance, unit, raw, nodeId } = result;
  if (typeof chain !== "string" || chain !== expectedChain) {
    throw new Error("Private API response chain did not match request");
  }
  if (typeof unit !== "string" || unit.length === 0) {
    throw new Error("Private API response is missing unit information");
  }
  if (balance === void 0 || balance === null) {
    throw new Error("Private API response is missing balance information");
  }
  const balanceString = normalizeBalance(balance);
  let balanceBigInt;
  try {
    balanceBigInt = BigInt(balanceString);
  } catch (error) {
    throw new Error("Private API returned a balance that is not an integer");
  }
  return {
    chain,
    unit,
    raw,
    nodeId: typeof nodeId === "string" && nodeId.length > 0 ? nodeId : void 0,
    balanceBigInt,
    balanceString
  };
}
function useGetExternalWalletBalanceQuery(currency, address) {
  return useQuery({
    queryKey: ["ecency-wallets", "external-wallet-balance", currency, address],
    queryFn: async () => {
      const chain = currencyChainMap[currency];
      if (!chain) {
        throw new Error(`Unsupported currency ${currency}`);
      }
      const baseUrl = `${ConfigManager.getValidatedBaseUrl()}/private-api/balance/${chain}/${encodeURIComponent(
        address
      )}`;
      let primaryResponse;
      let primaryError;
      try {
        primaryResponse = await fetch(baseUrl);
      } catch (error) {
        primaryError = error;
      }
      let response = primaryResponse;
      if (!response || !response.ok) {
        const fallbackUrl = `${baseUrl}?provider=chainz`;
        let fallbackError;
        try {
          const fallbackResponse = await fetch(fallbackUrl);
          if (fallbackResponse.ok) {
            response = fallbackResponse;
          } else {
            fallbackError = new Error(
              `Fallback provider responded with status ${fallbackResponse.status}`
            );
          }
        } catch (error) {
          fallbackError = error;
        }
        if (!response || !response.ok) {
          const failureReasons = [];
          if (primaryError) {
            const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
            failureReasons.push(`primary provider failed: ${message}`);
          } else if (primaryResponse && !primaryResponse.ok) {
            failureReasons.push(
              `primary provider status ${primaryResponse.status}`
            );
          }
          if (fallbackError) {
            const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            failureReasons.push(`fallback provider failed: ${message}`);
          }
          if (failureReasons.length === 0) {
            failureReasons.push("unknown error");
          }
          throw new Error(
            `Private API request failed (${failureReasons.join(", ")})`
          );
        }
      }
      const result = await response.json();
      return parsePrivateApiBalance(result, chain);
    }
  });
}
var options = {
  max: 500,
  // how long to live in ms
  ttl: 1e3 * 60 * 5,
  // return stale items before removing from cache?
  allowStale: false,
  updateAgeOnGet: false,
  updateAgeOnHas: false
};
var cache = new LRUCache(options);
var undefinedValue = /* @__PURE__ */ Symbol("undefined");
var cacheSet = (key, value) => cache.set(key, value === void 0 ? undefinedValue : value);
var cacheGet = (key) => {
  const v = cache.get(key);
  return v === undefinedValue ? void 0 : v;
};
var CURRENCY_TO_TOKEN_MAP = {
  ["BTC" /* BTC */]: "btc",
  ["ETH" /* ETH */]: "eth",
  ["SOL" /* SOL */]: "sol",
  ["BNB" /* BNB */]: "bnb",
  HBD: "hbd",
  HIVE: "hive"
};
var MARKET_DATA_CACHE_KEY = "market-data/latest";
var normalizeCurrencyToToken = (currency) => {
  const upperCased = currency.toUpperCase();
  return CURRENCY_TO_TOKEN_MAP[upperCased] ?? currency.toLowerCase();
};
function getTokenPriceQueryOptions(currency) {
  return queryOptions({
    queryKey: ["ecency-wallets", "market-data", currency],
    queryFn: async () => {
      if (!currency) {
        throw new Error(
          "[SDK][Wallets][MarketData] \u2013 currency wasn`t provided"
        );
      }
      const token = normalizeCurrencyToToken(currency);
      const baseUrl = ConfigManager.getValidatedBaseUrl();
      let marketData = cacheGet(MARKET_DATA_CACHE_KEY);
      if (!marketData) {
        const httpResponse = await fetch(
          `${baseUrl}/private-api/market-data/latest`,
          {
            method: "GET"
          }
        );
        if (!httpResponse.ok) {
          throw new Error(
            `[SDK][Wallets][MarketData] \u2013 failed to fetch latest market data (${httpResponse.status})`
          );
        }
        const data = await httpResponse.json();
        cacheSet(MARKET_DATA_CACHE_KEY, data);
        marketData = data;
      }
      const tokenData = marketData[token];
      if (!tokenData) {
        throw new Error(
          `[SDK][Wallets][MarketData] \u2013 missing market data for token: ${token}`
        );
      }
      const usdQuote = tokenData.quotes?.usd;
      if (!usdQuote) {
        throw new Error(
          `[SDK][Wallets][MarketData] \u2013 missing USD quote for token: ${token}`
        );
      }
      return Number(usdQuote.price);
    },
    enabled: !!currency
  });
}
function createFallbackTokenMetadata(symbol) {
  return {
    issuer: "",
    symbol,
    name: symbol,
    metadata: "{}",
    precision: 0,
    maxSupply: "0",
    supply: "0",
    circulatingSupply: "0",
    stakingEnabled: false,
    unstakingCooldown: 0,
    delegationEnabled: false,
    undelegationCooldown: 0,
    numberTransactions: 0,
    totalStaked: "0"
  };
}
async function getLayer2TokensMetadata(username) {
  if (!username) {
    return [];
  }
  let balances = [];
  try {
    balances = await getQueryClient().fetchQuery(
      getHiveEngineTokensBalancesQueryOptions(username)
    );
  } catch {
    balances = [];
  }
  const uniqueSymbols = Array.from(
    new Set(
      balances.map((balance) => balance.symbol).filter((symbol) => Boolean(symbol))
    )
  );
  if (uniqueSymbols.length === 0) {
    return [];
  }
  let metadataList = [];
  try {
    metadataList = await getQueryClient().fetchQuery(
      getHiveEngineTokensMetadataQueryOptions(uniqueSymbols)
    );
  } catch {
    metadataList = [];
  }
  const metadataBySymbol = new Map(
    metadataList.map((token) => [token.symbol, token])
  );
  return uniqueSymbols.map(
    (symbol) => metadataBySymbol.get(symbol) ?? createFallbackTokenMetadata(symbol)
  );
}
function getAllTokensListQueryOptions(username) {
  return queryOptions({
    queryKey: ["ecency-wallets", "all-tokens-list", username ?? null],
    queryFn: async () => {
      return {
        basic: [
          "POINTS" /* Points */,
          "HIVE" /* Hive */,
          "HP" /* HivePower */,
          "HBD" /* HiveDollar */
        ],
        external: Object.values(EcencyWalletCurrency),
        layer2: await getLayer2TokensMetadata(username)
      };
    }
  });
}
function normalizeAccountTokens(tokens) {
  if (Array.isArray(tokens)) {
    return tokens.filter(Boolean);
  }
  if (tokens && typeof tokens === "object") {
    return Object.values(tokens).flatMap(
      (value) => Array.isArray(value) ? value.filter(Boolean) : []
    );
  }
  return [];
}
var BASIC_TOKENS = [
  "POINTS" /* Points */,
  "HIVE" /* Hive */,
  "HP" /* HivePower */,
  "HBD" /* HiveDollar */
];
var REMOVED_TOKENS = /* @__PURE__ */ new Set(["SPK", "LARYNX", "LP", "BROCA"]);
function getAccountWalletListQueryOptions(username, currency = "usd") {
  return queryOptions({
    queryKey: ["ecency-wallets", "list", username, currency],
    enabled: !!username,
    queryFn: async () => {
      const portfolioQuery = getPortfolioQueryOptions(username, currency, true);
      const queryClient = getQueryClient();
      const accountQuery = getAccountFullQueryOptions(username);
      let account;
      try {
        account = await queryClient.fetchQuery(accountQuery) ?? void 0;
      } catch {
      }
      const tokenVisibility = /* @__PURE__ */ new Map();
      const accountTokens = normalizeAccountTokens(account?.profile?.tokens);
      accountTokens.forEach((token) => {
        const symbol = token.symbol?.toUpperCase?.();
        if (!symbol) {
          return;
        }
        const showValue = token?.meta?.show;
        if (typeof showValue === "boolean") {
          tokenVisibility.set(symbol, showValue);
        }
      });
      const isTokenVisible = (symbol) => {
        const normalized = symbol?.toUpperCase();
        if (!normalized) {
          return false;
        }
        if (REMOVED_TOKENS.has(normalized)) {
          return false;
        }
        if (BASIC_TOKENS.includes(normalized)) {
          return true;
        }
        return tokenVisibility.get(normalized) === true;
      };
      try {
        const portfolio = await queryClient.fetchQuery(portfolioQuery);
        const tokensFromPortfolio = portfolio.wallets.map(
          (asset) => asset.symbol
        );
        if (tokensFromPortfolio.length > 0) {
          const visibleTokens = tokensFromPortfolio.map((token) => token?.toUpperCase?.()).filter((token) => Boolean(token)).filter(isTokenVisible);
          if (visibleTokens.length > 0) {
            return Array.from(/* @__PURE__ */ new Set([...BASIC_TOKENS, ...visibleTokens]));
          }
        }
      } catch {
      }
      if (accountTokens.length > 0) {
        const list = [
          ...BASIC_TOKENS,
          ...accountTokens.map((token) => token.symbol).filter(isTokenVisible)
        ];
        return Array.from(new Set(list).values());
      }
      return [...BASIC_TOKENS];
    }
  });
}
function getTokenOperationsQueryOptions(token, username, isForOwner = false, currency = "usd") {
  return queryOptions({
    queryKey: ["wallets", "token-operations", token, username, isForOwner, currency],
    queryFn: async () => {
      const queryClient = getQueryClient();
      const normalizedToken = token.toUpperCase();
      if (!username || !isForOwner) {
        return [];
      }
      try {
        const portfolio = await queryClient.fetchQuery(
          getPortfolioQueryOptions(username, currency, true)
        );
        const assetEntry = portfolio.wallets.find(
          (assetItem) => assetItem.symbol.toUpperCase() === normalizedToken
        );
        if (!assetEntry) {
          return [];
        }
        const rawActions = assetEntry.actions ?? [];
        const operations = rawActions.map((action) => {
          if (typeof action === "string") return action;
          if (action && typeof action === "object") {
            const record = action;
            return record.id ?? record.code ?? record.name ?? record.action;
          }
          return void 0;
        }).filter((id) => Boolean(id)).map((id) => {
          const canonical = id.trim().toLowerCase().replace(/[\s_]+/g, "-");
          const aliasMap = {
            // Common operations
            "transfer": AssetOperation.Transfer,
            "ecency-point-transfer": AssetOperation.Transfer,
            // Savings operations
            "transfer-to-savings": AssetOperation.TransferToSavings,
            "transfer-savings": AssetOperation.TransferToSavings,
            "savings-transfer": AssetOperation.TransferToSavings,
            "withdraw-from-savings": AssetOperation.WithdrawFromSavings,
            "transfer-from-savings": AssetOperation.WithdrawFromSavings,
            "withdraw-savings": AssetOperation.WithdrawFromSavings,
            "savings-withdraw": AssetOperation.WithdrawFromSavings,
            // Vesting/Power operations
            "transfer-to-vesting": AssetOperation.PowerUp,
            "powerup": AssetOperation.PowerUp,
            "power-up": AssetOperation.PowerUp,
            "withdraw-vesting": AssetOperation.PowerDown,
            "power-down": AssetOperation.PowerDown,
            "powerdown": AssetOperation.PowerDown,
            // Delegation
            "delegate": AssetOperation.Delegate,
            "delegate-vesting-shares": AssetOperation.Delegate,
            "hp-delegate": AssetOperation.Delegate,
            "delegate-hp": AssetOperation.Delegate,
            "delegate-power": AssetOperation.Delegate,
            "undelegate": AssetOperation.Undelegate,
            "undelegate-power": AssetOperation.Undelegate,
            "undelegate-token": AssetOperation.Undelegate,
            // Staking (Layer 2)
            "stake": AssetOperation.Stake,
            "stake-token": AssetOperation.Stake,
            "stake-power": AssetOperation.Stake,
            "unstake": AssetOperation.Unstake,
            "unstake-token": AssetOperation.Unstake,
            "unstake-power": AssetOperation.Unstake,
            // Swap/Convert
            "swap": AssetOperation.Swap,
            "swap-token": AssetOperation.Swap,
            "swap-tokens": AssetOperation.Swap,
            "convert": AssetOperation.Convert,
            // Points operations
            "promote": AssetOperation.Promote,
            "promote-post": AssetOperation.Promote,
            "promote-entry": AssetOperation.Promote,
            "boost": AssetOperation.Promote,
            "gift": AssetOperation.Gift,
            "gift-points": AssetOperation.Gift,
            "points-gift": AssetOperation.Gift,
            "claim": AssetOperation.Claim,
            "claim-rewards": AssetOperation.Claim,
            "claim-points": AssetOperation.Claim,
            "buy": AssetOperation.Buy,
            "buy-points": AssetOperation.Buy,
            // Other
            "claim-interest": AssetOperation.ClaimInterest,
            // Chain operation name, as emitted in the HP action list. The two
            // slug spellings below predate it and stay as a fallback.
            "set-withdraw-vesting-route": AssetOperation.WithdrawRoutes,
            "withdraw-routes": AssetOperation.WithdrawRoutes,
            "withdrawroutes": AssetOperation.WithdrawRoutes
          };
          const mapped = aliasMap[canonical];
          if (mapped) return mapped;
          const directMatch = Object.values(AssetOperation).find(
            (op) => op.toLowerCase() === canonical
          );
          return directMatch;
        }).filter((op) => Boolean(op)).filter((op, index, self) => self.indexOf(op) === index);
        const isHiveOrHbd = ["HIVE", "HBD"].includes(normalizedToken);
        const rawToken = assetEntry;
        const hasSavings = Number(rawToken.savings ?? 0) > 0;
        if (isHiveOrHbd && !hasSavings) {
          return operations.filter(
            (operation) => operation !== AssetOperation.WithdrawFromSavings
          );
        }
        return operations;
      } catch {
        return [];
      }
    }
  });
}

// src/modules/wallets/mutations/save-wallet-information-to-metadata.ts
var isChainToken = ({
  type,
  symbol
}) => type === "CHAIN" || Object.values(EcencyWalletCurrency).includes(symbol);
function getGroupedChainTokens(tokens, defaultShow) {
  if (!tokens) {
    return {};
  }
  return R.pipe(
    tokens,
    R.filter(isChainToken),
    R.map((item) => {
      const meta = {
        ...item.meta ?? {}
      };
      if (typeof meta.show !== "boolean" && typeof defaultShow === "boolean") {
        meta.show = defaultShow;
      }
      return {
        ...item,
        meta
      };
    }),
    // Chain tokens are unique by symbol, so indexing by symbol
    // gives a direct lookup map instead of an array-based grouping.
    R.indexBy(
      (item) => item.symbol
    )
  );
}
function buildTokensPayload(existingTokens, tokens) {
  const profileChainTokens = getGroupedChainTokens(existingTokens);
  const payloadTokens = tokens.map(({ currency, type, privateKey, username, ...meta }) => ({
    symbol: currency,
    type: type ?? (Object.values(EcencyWalletCurrency).includes(currency) ? "CHAIN" : void 0),
    meta
  })) ?? [];
  const payloadChainTokens = getGroupedChainTokens(payloadTokens, true);
  const payloadNonChainTokens = (payloadTokens ?? []).filter(
    (token) => !isChainToken(token)
  );
  const mergedChainTokens = R.pipe(
    profileChainTokens,
    R.mergeDeep(payloadChainTokens),
    R.values()
  );
  const managesNonChainTokens = payloadNonChainTokens.length > 0;
  const payloadSymbols = new Set(
    (payloadTokens ?? []).map(({ symbol }) => symbol)
  );
  const preservedTokens = managesNonChainTokens ? [] : (existingTokens ?? []).filter(
    (token) => !isChainToken(token) && !payloadSymbols.has(token.symbol)
  );
  return [
    ...preservedTokens,
    ...payloadNonChainTokens,
    ...mergedChainTokens
  ];
}
function useSaveWalletInformationToMetadata(username, auth, options2) {
  const queryClient = useQueryClient();
  const { data: accountData } = useQuery(getAccountFullQueryOptions(username));
  const { mutateAsync: updateProfile } = useAccountUpdate(username, auth);
  return useMutation({
    mutationKey: [
      "ecency-wallets",
      "save-wallet-to-metadata",
      accountData?.name
    ],
    mutationFn: async (tokens) => {
      if (!accountData) {
        throw new Error("[SDK][Wallets] \u2013 no account data to save wallets");
      }
      return updateProfile({
        tokens: buildTokensPayload(accountData.profile?.tokens, tokens)
      });
    },
    onError: options2?.onError,
    onSuccess: (response, vars, context) => {
      options2?.onSuccess?.(response, vars, context);
      queryClient.invalidateQueries({
        queryKey: getAccountWalletListQueryOptions(username).queryKey
      });
    }
  });
}

// src/modules/wallets/utils/metamask-evm-transfer.ts
function getEthereum() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not found");
  }
  return window.ethereum;
}
var WEI_PER_ETH = 1000000000000000000n;
var EVM_CHAIN_CONFIG = {
  ["ETH" /* ETH */]: {
    chainId: "0x1",
    name: "Ethereum Mainnet",
    rpcUrl: "https://rpc.ankr.com/eth",
    explorerUrl: "https://etherscan.io/tx/"
  },
  ["BNB" /* BNB */]: {
    chainId: "0x38",
    name: "BNB Smart Chain",
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com/tx/"
  }
};
function getEvmChainConfig(currency) {
  const config = EVM_CHAIN_CONFIG[currency];
  if (!config) throw new Error(`Unsupported EVM currency: ${currency}`);
  return config;
}
function getEvmExplorerUrl(currency, txHash) {
  return `${getEvmChainConfig(currency).explorerUrl}${txHash}`;
}
async function ensureEvmChain(currency) {
  const ethereum = getEthereum();
  const { chainId, name, rpcUrl } = getEvmChainConfig(currency);
  const currentChainId = await ethereum.request({ method: "eth_chainId" });
  if (currentChainId === chainId) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }]
    });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: name,
          rpcUrls: [rpcUrl],
          nativeCurrency: {
            name: currency === "ETH" /* ETH */ ? "Ether" : "BNB",
            symbol: currency === "ETH" /* ETH */ ? "ETH" : "BNB",
            decimals: 18
          }
        }]
      });
    } else {
      throw err;
    }
  }
}
async function estimateEvmGas(from, to, valueHex, currency) {
  const ethereum = getEthereum();
  await ensureEvmChain(currency);
  const [gasLimit, gasPrice] = await Promise.all([
    ethereum.request({
      method: "eth_estimateGas",
      params: [{ from, to, value: valueHex }]
    }),
    ethereum.request({ method: "eth_gasPrice" })
  ]);
  const estimatedFeeWei = BigInt(gasLimit) * BigInt(gasPrice);
  return { gasLimit, gasPrice, estimatedFeeWei };
}
function formatWei(wei, decimals = 6) {
  const whole = wei / WEI_PER_ETH;
  const rem = wei % WEI_PER_ETH;
  if (rem === 0n) return whole.toString();
  const scale = 10n ** BigInt(decimals);
  const fractional = rem * scale / WEI_PER_ETH;
  const fracStr = fractional.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
var AMOUNT_REGEX = /^\d+(\.\d+)?$/;
function parseToWei(amount) {
  const trimmed = amount.trim();
  if (!AMOUNT_REGEX.test(trimmed)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (!/^\d+$/.test(whole) || fraction && !/^\d+$/.test(fraction)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }
  const paddedFraction = fraction.padEnd(18, "0").slice(0, 18);
  const wei = BigInt(whole) * WEI_PER_ETH + BigInt(paddedFraction);
  return "0x" + wei.toString(16);
}
async function sendEvmTransfer(to, amountWei, currency, expectedFrom) {
  const ethereum = getEthereum();
  await ensureEvmChain(currency);
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const from = accounts[0];
  if (!from) throw new Error("No MetaMask account connected");
  if (expectedFrom && from.toLowerCase() !== expectedFrom.toLowerCase()) {
    throw new Error("ACCOUNT_MISMATCH");
  }
  const txHash = await ethereum.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to,
      value: amountWei
    }]
  });
  return txHash;
}
var SOL_EXPLORER_URL = "https://explorer.solana.com/tx/";
var LAMPORTS_PER_SOL = 1000000000n;
var AMOUNT_REGEX2 = /^\d+(\.\d+)?$/;
function getSolExplorerUrl(signature) {
  return `${SOL_EXPLORER_URL}${signature}`;
}
function parseToLamports(amount) {
  const trimmed = amount.trim();
  if (!AMOUNT_REGEX2.test(trimmed)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (!/^\d+$/.test(whole) || fraction && !/^\d+$/.test(fraction)) {
    throw new Error(`Invalid amount: "${amount}"`);
  }
  if (fraction.length > 9 && fraction.slice(9).replace(/0/g, "").length > 0) {
    throw new Error(`Amount has more than 9 decimal places: "${amount}"`);
  }
  const paddedFraction = fraction.padEnd(9, "0").slice(0, 9);
  return BigInt(whole) * LAMPORTS_PER_SOL + BigInt(paddedFraction);
}
function formatLamports(lamports, decimals = 6) {
  const whole = lamports / LAMPORTS_PER_SOL;
  const rem = lamports % LAMPORTS_PER_SOL;
  if (rem === 0n) return whole.toString();
  const scale = 10n ** BigInt(decimals);
  const fractional = rem * scale / LAMPORTS_PER_SOL;
  const fracStr = fractional.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
async function solRpc(method, params = []) {
  const baseUrl = ConfigManager.getValidatedBaseUrl();
  const response = await fetch(`${baseUrl}/private-api/rpc/sol`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SOL RPC ${method} failed: ${response.status} ${response.statusText}${text ? ` \u2014 ${text}` : ""}`);
  }
  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || `SOL RPC ${method} failed`);
  }
  return json.result;
}
async function getMetaMaskSolanaWallet() {
  const { getWallets } = await import('@wallet-standard/app');
  const walletsApi = getWallets();
  const wallets = walletsApi.get();
  const mmWallet = wallets.find(
    (w) => w.name.toLowerCase().includes("metamask") && w.features["standard:connect"] && w.features["solana:signAndSendTransaction"]
  );
  if (!mmWallet) {
    throw new Error("MetaMask Solana wallet not found. Enable Solana in MetaMask settings.");
  }
  return mmWallet;
}
async function sendSolTransfer(to, amountSol) {
  const mmWallet = await getMetaMaskSolanaWallet();
  const connectFeature = mmWallet.features["standard:connect"];
  await connectFeature.connect();
  const solAccount = mmWallet.accounts?.find(
    (acc) => acc.chains?.some((c) => c.startsWith("solana:"))
  );
  if (!solAccount) {
    throw new Error("No Solana account found in MetaMask.");
  }
  const { PublicKey, SystemProgram, Transaction } = await import('@solana/web3.js');
  const fromPubkey = new PublicKey(solAccount.address);
  const toPubkey = new PublicKey(to);
  const lamports = parseToLamports(amountSol);
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports
    })
  );
  const blockhashResult = await solRpc(
    "getLatestBlockhash",
    [{ commitment: "finalized" }]
  );
  transaction.recentBlockhash = blockhashResult.value.blockhash;
  transaction.feePayer = fromPubkey;
  const serializedTx = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  });
  const signAndSendFeature = mmWallet.features["solana:signAndSendTransaction"];
  if (!signAndSendFeature) {
    throw new Error("MetaMask does not support Solana transaction signing. Please update MetaMask.");
  }
  const [result] = await signAndSendFeature.signAndSendTransaction({
    account: solAccount,
    transaction: serializedTx,
    chain: "solana:mainnet"
  });
  if (typeof result.signature === "string") {
    return result.signature;
  }
  const { base58 } = await import('@scure/base');
  return base58.encode(new Uint8Array(result.signature));
}
function useExternalTransfer(currency) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["ecency-wallets", "external-transfer", currency],
    mutationFn: async ({ to, amount, expectedFrom }) => {
      switch (currency) {
        case "ETH" /* ETH */:
        case "BNB" /* BNB */: {
          const valueHex = parseToWei(amount);
          const txHash = await sendEvmTransfer(to, valueHex, currency, expectedFrom);
          return { txHash, currency };
        }
        case "SOL" /* SOL */: {
          const signature = await sendSolTransfer(to, amount);
          return { txHash: signature, currency };
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["ecency-wallets", "external-wallet-balance"]
      });
    }
  });
}
var ROLE_INDEX = {
  owner: 0,
  active: 1,
  posting: 2,
  memo: 3
};
function deriveHiveKey(mnemonic, role, accountIndex = 0) {
  const seed = mnemonicToSeedSync(mnemonic);
  const master = HDKey.fromMasterSeed(seed);
  const path = `m/44'/3054'/${accountIndex}'/0'/${ROLE_INDEX[role]}'`;
  const child = master.derive(path);
  if (!child.privateKey) {
    throw new Error("[Ecency][Wallets] - hive key derivation failed");
  }
  const pk = PrivateKey.from(Buffer.from(child.privateKey));
  return {
    privateKey: pk.toString(),
    publicKey: pk.createPublic().toString()
  };
}
function deriveHiveKeys(mnemonic, accountIndex = 0) {
  const owner = deriveHiveKey(mnemonic, "owner", accountIndex);
  const active = deriveHiveKey(mnemonic, "active", accountIndex);
  const posting = deriveHiveKey(mnemonic, "posting", accountIndex);
  const memo = deriveHiveKey(mnemonic, "memo", accountIndex);
  return {
    owner: owner.privateKey,
    active: active.privateKey,
    posting: posting.privateKey,
    memo: memo.privateKey,
    ownerPubkey: owner.publicKey,
    activePubkey: active.publicKey,
    postingPubkey: posting.publicKey,
    memoPubkey: memo.publicKey
  };
}
function deriveHiveMasterPasswordKey(username, masterPassword, role) {
  const pk = PrivateKey.fromLogin(username, masterPassword, role);
  return {
    privateKey: pk.toString(),
    publicKey: pk.createPublic().toString()
  };
}
function deriveHiveMasterPasswordKeys(username, masterPassword) {
  const owner = deriveHiveMasterPasswordKey(username, masterPassword, "owner");
  const active = deriveHiveMasterPasswordKey(username, masterPassword, "active");
  const posting = deriveHiveMasterPasswordKey(
    username,
    masterPassword,
    "posting"
  );
  const memo = deriveHiveMasterPasswordKey(username, masterPassword, "memo");
  return {
    owner: owner.privateKey,
    active: active.privateKey,
    posting: posting.privateKey,
    memo: memo.privateKey,
    ownerPubkey: owner.publicKey,
    activePubkey: active.publicKey,
    postingPubkey: posting.publicKey,
    memoPubkey: memo.publicKey
  };
}
async function detectHiveKeyDerivation(username, seed, type = "active") {
  const uname = username.trim().toLowerCase();
  const account = await CONFIG.queryClient.fetchQuery(
    getAccountFullQueryOptions(uname)
  );
  if (!account) {
    throw new Error("[SDK][Wallets] \u2013 no account found for key derivation");
  }
  const auth = account[type];
  let matchBip44 = false;
  try {
    const bip44 = deriveHiveKeys(seed);
    const bip44Pub = type === "owner" ? bip44.ownerPubkey : bip44.activePubkey;
    matchBip44 = auth.key_auths.some(([pub]) => String(pub) === bip44Pub);
  } catch {
  }
  if (matchBip44) return "bip44";
  const legacyPub = PrivateKey.fromLogin(uname, seed, type).createPublic().toString();
  const matchLegacy = auth.key_auths.some(([pub]) => String(pub) === legacyPub);
  if (matchLegacy) return "master-password";
  return "unknown";
}

// src/modules/wallets/utils/metamask-discovery.ts
var CHAIN_PREFIX_MAP = {
  "solana:": "SOL" /* SOL */,
  "bip122:": "BTC" /* BTC */
};
var HIVE_SNAP_ID = "npm:@hiveio/metamask-snap";
async function fetchMultichainAddresses() {
  const addresses = {};
  try {
    const { getWallets } = await import('@wallet-standard/app');
    const walletsApi = getWallets();
    const wallets = walletsApi.get();
    const mmWallets = wallets.filter(
      (w) => w.name.toLowerCase().includes("metamask") && w.features["standard:connect"]
    );
    for (const mmWallet of mmWallets) {
      try {
        const connectFeature = mmWallet.features["standard:connect"];
        await connectFeature.connect();
      } catch (connectErr) {
        if (false) ;
        continue;
      }
      for (const account of mmWallet.accounts ?? []) {
        if (!account.address || !Array.isArray(account.chains)) continue;
        for (const [prefix, currency] of Object.entries(CHAIN_PREFIX_MAP)) {
          if (addresses[currency]) continue;
          if (account.chains.some((c) => c.startsWith(prefix))) {
            addresses[currency] = account.address;
          }
        }
      }
    }
  } catch (e) {
  }
  return addresses;
}
async function fetchEvmAddress() {
  if (typeof window === "undefined" || !window.ethereum?.isMetaMask) return void 0;
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts"
    });
    return accounts?.[0] ?? void 0;
  } catch {
    return void 0;
  }
}
async function discoverMetaMaskWallets() {
  const addresses = {};
  const evmAddress = await fetchEvmAddress();
  if (evmAddress) {
    addresses["ETH" /* ETH */] = evmAddress;
    addresses["BNB" /* BNB */] = evmAddress;
  }
  const multichainAddresses = await fetchMultichainAddresses();
  Object.assign(addresses, multichainAddresses);
  return addresses;
}
async function installHiveSnap() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not available");
  }
  await window.ethereum.request({
    method: "wallet_requestSnaps",
    params: { [HIVE_SNAP_ID]: {} }
  });
}
async function getHivePublicKeys() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not available");
  }
  const result = await window.ethereum.request({
    method: "wallet_invokeSnap",
    params: {
      snapId: HIVE_SNAP_ID,
      request: {
        method: "hive_getPublicKeys",
        params: {
          keys: [
            { role: "owner", accountIndex: 0 },
            { role: "active", accountIndex: 0 },
            { role: "posting", accountIndex: 0 },
            { role: "memo", accountIndex: 0 }
          ]
        }
      }
    }
  });
  const keys = result?.publicKeys;
  if (!Array.isArray(keys)) {
    throw new Error("Hive Snap returned invalid response \u2014 expected publicKeys array");
  }
  return keys;
}

// src/index.ts
rememberScryptBsvVersion();

export { EcencyWalletBasicTokens, EcencyWalletCurrency, private_api_exports as EcencyWalletsPrivateApi, buildTokensPayload, deriveHiveKey, deriveHiveKeys, deriveHiveMasterPasswordKey, deriveHiveMasterPasswordKeys, detectHiveKeyDerivation, discoverMetaMaskWallets, ensureEvmChain, estimateEvmGas, fetchEvmAddress, fetchMultichainAddresses, formatLamports, formatWei, getAccountWalletListQueryOptions, getAllTokensListQueryOptions, getEvmChainConfig, getEvmExplorerUrl, getHivePublicKeys, getSolExplorerUrl, getTokenOperationsQueryOptions, getTokenPriceQueryOptions, installHiveSnap, parseToLamports, parseToWei, sendEvmTransfer, sendSolTransfer, useExternalTransfer, useGetExternalWalletBalanceQuery, useSaveWalletInformationToMetadata };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map