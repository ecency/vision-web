import { queryOptions } from "@tanstack/react-query";
import { GeneralAssetInfo } from "../../types";
import { CONFIG } from "../../../../../index";
import { getBtcAssetBalanceQueryOptions } from "./get-btc-asset-balance-query-options";
import { getTokenPriceQueryOptions } from "../../../wallets";
import { getAddressFromAccount } from "../common";

export function getBtcAssetGeneralInfoQueryOptions(username: string) {
  return queryOptions({
    queryKey: ["assets", "btc", "general-info", username],
    staleTime: 60000,
    refetchInterval: 90000,
    queryFn: async () => {
      const address = await getAddressFromAccount(username, "BTC");

      await CONFIG.queryClient.fetchQuery(
        getBtcAssetBalanceQueryOptions(address)
      );
      const accountBalance =
        (CONFIG.queryClient.getQueryData<number>(
          getBtcAssetBalanceQueryOptions(address).queryKey
        ) ?? 0) / 1e8;

      await CONFIG.queryClient.prefetchQuery(
        getTokenPriceQueryOptions("BTC")
      );
      const price =
        CONFIG.queryClient.getQueryData<number>(
          getTokenPriceQueryOptions("BTC").queryKey
        ) ?? 0;

      return {
        name: "BTC",
        title: "Bitcoin",
        price,
        accountBalance,
      } satisfies GeneralAssetInfo;
    },
  });
}
