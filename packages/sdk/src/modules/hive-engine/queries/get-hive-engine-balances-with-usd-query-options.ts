import {
  getHiveEngineTokensBalances,
  getHiveEngineTokensMarket,
  getHiveEngineTokensMetadata,
} from "../requests";
import { queryOptions } from "@tanstack/react-query";
import type {
  HiveEngineTokenBalance,
  Token,
  TokenMetadata,
  HiveEngineTokenInfo,
} from "../types";
import { HiveEngineToken } from "../utils";

interface DynamicProps {
  base: number;
  quote: number;
}

export function getHiveEngineBalancesWithUsdQueryOptions(
  account: string,
  dynamicProps?: DynamicProps,
  allTokens?: HiveEngineTokenInfo[]
) {
  return queryOptions({
    queryKey: [
      "assets",
      "hive-engine",
      "balances-with-usd",
      account,
      dynamicProps,
      allTokens,
    ] as const,
    queryFn: async () => {
      if (!account) {
        throw new Error("[HiveEngine] No account in a balances query");
      }

      const balances = await getHiveEngineTokensBalances<HiveEngineTokenBalance>(account);

      const tokens = await getHiveEngineTokensMetadata<Token>(
        balances.map((t) => t.symbol)
      );

      const pricePerHive = dynamicProps
        ? dynamicProps.base / dynamicProps.quote
        : 0;
      const providedMetrics: ReadonlyArray<HiveEngineTokenInfo> = Array.isArray(
        allTokens
      )
        ? allTokens
        : [];

      // Whatever the caller passed comes from an unfiltered metrics call, which the node
      // caps at 1000 rows – held tokens outside that page have no price and used to be
      // valued at zero, understating the wallet. Ask for the missing ones by symbol.
      const unpricedSymbols = balances
        .map((balance) => balance.symbol)
        .filter(
          (symbol) =>
            symbol !== "SWAP.HIVE" &&
            !providedMetrics.some((metric) => metric.symbol === symbol)
        );

      const metrics: ReadonlyArray<HiveEngineTokenInfo> = [
        ...providedMetrics,
        ...(unpricedSymbols.length
          ? await getHiveEngineTokensMarket<HiveEngineTokenInfo>(
              undefined,
              unpricedSymbols
            )
          : []),
      ];

      return balances.map((balance) => {
        const token = tokens.find((t) => t.symbol === balance.symbol);
        let tokenMetadata: TokenMetadata | undefined;

        if (token?.metadata) {
          try {
            tokenMetadata = JSON.parse(token.metadata) as TokenMetadata;
          } catch {
            tokenMetadata = undefined;
          }
        }

        const metric = metrics.find((m) => m.symbol === balance.symbol);
        const lastPrice = Number(metric?.lastPrice ?? "0");
        const balanceAmount = Number(balance.balance);

        const usdValue =
          balance.symbol === "SWAP.HIVE"
            ? pricePerHive * balanceAmount
            : lastPrice === 0
              ? 0
              : Number(
                  (lastPrice * pricePerHive * balanceAmount).toFixed(10)
                );

        return new HiveEngineToken({
          symbol: balance.symbol,
          name: token?.name ?? balance.symbol,
          icon: tokenMetadata?.icon ?? "",
          precision: token?.precision ?? 0,
          precisionKnown: typeof token?.precision === "number",
          stakingEnabled: token?.stakingEnabled ?? false,
          delegationEnabled: token?.delegationEnabled ?? false,
          balance: balance.balance,
          stake: balance.stake,
          delegationsIn: balance.delegationsIn,
          delegationsOut: balance.delegationsOut,
          usdValue,
        });
      });
    },
    enabled: !!account,
  });
}
