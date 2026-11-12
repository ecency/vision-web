import { queryOptions } from "@tanstack/react-query";
import { GeneralAssetInfo } from "../../types";
import { CONFIG } from "../../../../../index";
import { getSolAssetBalanceQueryOptions } from "./get-sol-asset-balance-query-options";
import { getTokenPriceQueryOptions } from "../../../wallets";
import { getAddressFromAccount } from "../common";

export function getSolAssetGeneralInfoQueryOptions(username: string) {
  return queryOptions({
    queryKey: ["assets", "sol", "general-info", username],
    staleTime: 60000,
    refetchInterval: 90000,
    queryFn: async () => {
      const address = await getAddressFromAccount(username, "SOL");

      await CONFIG.queryClient.fetchQuery(
        getSolAssetBalanceQueryOptions(address)
      );
      const accountBalance =
        (CONFIG.queryClient.getQueryData<number>(
          getSolAssetBalanceQueryOptions(address).queryKey
        ) ?? 0) / 1e9;

      await CONFIG.queryClient.prefetchQuery(
        getTokenPriceQueryOptions("SOL")
      );
      const price =
        CONFIG.queryClient.getQueryData<number>(
          getTokenPriceQueryOptions("SOL").queryKey
        ) ?? 0;

      return {
        name: "SOL",
        title: "Solana",
        price,
        accountBalance,
      } satisfies GeneralAssetInfo;
    },
  });
}
