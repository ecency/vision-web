import { queryOptions } from "@tanstack/react-query";
import { GeneralAssetInfo } from "../../types";
import { CONFIG } from "../../../../../index";
import { getEthAssetBalanceQueryOptions } from "./get-eth-asset-balance-query-options";
import { getTokenPriceQueryOptions } from "../../../wallets";
import { getAddressFromAccount } from "../common";

export function getEthAssetGeneralInfoQueryOptions(username: string) {
  return queryOptions({
    queryKey: ["assets", "eth", "general-info", username],
    staleTime: 60000,
    refetchInterval: 90000,
    queryFn: async () => {
      const address = await getAddressFromAccount(username, "ETH");

      await CONFIG.queryClient.fetchQuery(
        getEthAssetBalanceQueryOptions(address)
      );
      const accountBalance =
        (CONFIG.queryClient.getQueryData<number>(
          getEthAssetBalanceQueryOptions(address).queryKey
        ) ?? 0) / 1e18;

      await CONFIG.queryClient.prefetchQuery(
        getTokenPriceQueryOptions("ETH")
      );
      const price =
        CONFIG.queryClient.getQueryData<number>(
          getTokenPriceQueryOptions("ETH").queryKey
        ) ?? 0;

      return {
        name: "ETH",
        title: "Ethereum",
        price,
        accountBalance,
      } satisfies GeneralAssetInfo;
    },
  });
}
