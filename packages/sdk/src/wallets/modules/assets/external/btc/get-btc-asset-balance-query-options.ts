import { ConfigManager } from "../../../../../index";
import { queryOptions } from "@tanstack/react-query";
import { parsePrivateApiBalance } from "../common/parse-private-api-balance";

export function getBtcAssetBalanceQueryOptions(address: string) {
  return queryOptions({
    queryKey: ["assets", "btc", "balance", address],
    queryFn: async () => {
      const baseUrl = `${ConfigManager.getValidatedBaseUrl()}/private-api/balance/btc/${encodeURIComponent(
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
        return +parsePrivateApiBalance(await primaryResponse.json(), "btc").balanceString;
      }

      if (primaryResponse && !primaryResponse.ok) {
        primaryFailure = `[SDK][Wallets] – primary request failed(${baseUrl}) status ${primaryResponse.status} ${primaryResponse.statusText}`;
      }

      const fallbackUrl = `${baseUrl}?provider=chainz`;
      let fallbackResponse: Response;
      try {
        fallbackResponse = await fetch(fallbackUrl);
      } catch (error) {
        throw new Error(
          `${primaryFailure}; [SDK][Wallets] – fallback request failed(${fallbackUrl}): ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error }
        );
      }
      if (!fallbackResponse.ok) {
        throw new Error(
          `${primaryFailure}; [SDK][Wallets] – fallback request failed(${fallbackUrl}) status ${fallbackResponse.status} ${fallbackResponse.statusText}`
        );
      }

      return +parsePrivateApiBalance(await fallbackResponse.json(), "btc").balanceString;
    },
  });
}
