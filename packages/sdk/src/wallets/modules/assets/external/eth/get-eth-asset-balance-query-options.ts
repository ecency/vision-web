import { ConfigManager } from "../../../../../index";
import { queryOptions } from "@tanstack/react-query";
import { parsePrivateApiBalance } from "../common/parse-private-api-balance";

export function getEthAssetBalanceQueryOptions(address: string) {
  return queryOptions({
    queryKey: ["assets", "eth", "balance", address],
    queryFn: async () => {
      const baseUrl = `${ConfigManager.getValidatedBaseUrl()}/private-api/balance/eth/${encodeURIComponent(
        address
      )}`;
      let primaryResponse: Response | undefined;
      let primaryFailure = "";

      try {
        primaryResponse = await fetch(baseUrl);
      } catch (error) {
        console.error(error);
        primaryFailure = `[SDK][Wallets] – primary request failed(${baseUrl}): ${
          error instanceof Error ? error.message : String(error)
        }`;
      }

      if (primaryResponse?.ok) {
        return +parsePrivateApiBalance(await primaryResponse.json(), "eth").balanceString;
      }

      if (primaryResponse && !primaryResponse.ok) {
        primaryFailure = `[SDK][Wallets] – primary request failed(${baseUrl}) status ${primaryResponse.status} ${primaryResponse.statusText}`;
      }

      const fallbackUrl = `${baseUrl}?provider=chainz`;
      const fallbackResponse = await fetch(fallbackUrl);
      if (!fallbackResponse.ok) {
        throw new Error(
          `${primaryFailure}; [SDK][Wallets] – fallback request failed(${fallbackUrl}) status ${fallbackResponse.status} ${fallbackResponse.statusText}`
        );
      }

      return +parsePrivateApiBalance(await fallbackResponse.json(), "eth").balanceString;
    },
  });
}
