import {
  getHiveEngineTokensBalancesQueryOptions,
  getHiveEngineTokensMetadataQueryOptions,
} from "../../assets";
import {
  HiveEngineTokenBalance,
  HiveEngineTokenMetadataResponse,
} from "../../assets/hive-engine/types";
import { getQueryClient } from "../../../../index";
import { queryOptions } from "@tanstack/react-query";
import { EcencyWalletBasicTokens, EcencyWalletCurrency } from "../enums";

function createFallbackTokenMetadata(symbol: string): HiveEngineTokenMetadataResponse {
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
    totalStaked: "0",
  };
}

async function getLayer2TokensMetadata(username?: string) {
  if (!username) {
    return [] as HiveEngineTokenMetadataResponse[];
  }

  let balances: HiveEngineTokenBalance[] = [];

  try {
    balances = await getQueryClient().fetchQuery(
      getHiveEngineTokensBalancesQueryOptions(username)
    );
  } catch {
    balances = [];
  }

  const uniqueSymbols = Array.from(
    new Set(
      balances
        .map((balance) => balance.symbol)
        .filter((symbol): symbol is string => Boolean(symbol))
    )
  );

  if (uniqueSymbols.length === 0) {
    return [] as HiveEngineTokenMetadataResponse[];
  }

  let metadataList: HiveEngineTokenMetadataResponse[] = [];

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

export function getAllTokensListQueryOptions(username?: string) {
  return queryOptions({
    queryKey: ["ecency-wallets", "all-tokens-list", username ?? null],
    queryFn: async () => {
      return {
        basic: [
          EcencyWalletBasicTokens.Points,
          EcencyWalletBasicTokens.Hive,
          EcencyWalletBasicTokens.HivePower,
          EcencyWalletBasicTokens.HiveDollar,
        ],
        external: Object.values(EcencyWalletCurrency),
        layer2: await getLayer2TokensMetadata(username),
      };
    },
  });
}
