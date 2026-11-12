import { EcencyWalletCurrency } from "../enums";
import { ConfigManager } from "../../../../index";
import { useQuery } from "@tanstack/react-query";

const currencyChainMap: Record<EcencyWalletCurrency, string> = {
  [EcencyWalletCurrency.BTC]: "btc",
  [EcencyWalletCurrency.ETH]: "eth",
  [EcencyWalletCurrency.BNB]: "bnb",
  [EcencyWalletCurrency.SOL]: "sol",
};

interface PrivateApiBalanceResponse {
  chain: string;
  balance: number | string;
  unit: string;
  raw?: unknown;
  nodeId?: string;
}

export interface ExternalWalletBalance {
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

function normalizeBalance(balance: number | string): string {
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

function parsePrivateApiBalance(
  result: unknown,
  expectedChain: string
): ExternalWalletBalance {
  if (!result || typeof result !== "object") {
    throw new Error("Private API returned an unexpected response");
  }

  const { chain, balance, unit, raw, nodeId } =
    result as PrivateApiBalanceResponse;

  if (typeof chain !== "string" || chain !== expectedChain) {
    throw new Error("Private API response chain did not match request");
  }

  if (typeof unit !== "string" || unit.length === 0) {
    throw new Error("Private API response is missing unit information");
  }

  if (balance === undefined || balance === null) {
    throw new Error("Private API response is missing balance information");
  }

  const balanceString = normalizeBalance(balance);

  let balanceBigInt: bigint;

  try {
    balanceBigInt = BigInt(balanceString);
  } catch (error) {
    throw new Error("Private API returned a balance that is not an integer");
  }

  return {
    chain,
    unit,
    raw,
    nodeId:
      typeof nodeId === "string" && nodeId.length > 0 ? nodeId : undefined,
    balanceBigInt,
    balanceString,
  };
}

export function useGetExternalWalletBalanceQuery(
  currency: EcencyWalletCurrency,
  address: string
) {
  return useQuery<ExternalWalletBalance>({
    queryKey: ["ecency-wallets", "external-wallet-balance", currency, address],
    queryFn: async () => {
      const chain = currencyChainMap[currency];

      if (!chain) {
        throw new Error(`Unsupported currency ${currency}`);
      }

      const baseUrl = `${ConfigManager.getValidatedBaseUrl()}/private-api/balance/${chain}/${encodeURIComponent(
        address
      )}`;

      let primaryResponse: Response | undefined;
      let primaryError: unknown;

      try {
        primaryResponse = await fetch(baseUrl);
      } catch (error) {
        primaryError = error;
      }

      let response = primaryResponse;

      if (!response || !response.ok) {
        const fallbackUrl = `${baseUrl}?provider=chainz`;
        let fallbackError: unknown;

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
          const failureReasons: string[] = [];

          if (primaryError) {
            const message =
              primaryError instanceof Error
                ? primaryError.message
                : String(primaryError);
            failureReasons.push(`primary provider failed: ${message}`);
          } else if (primaryResponse && !primaryResponse.ok) {
            failureReasons.push(
              `primary provider status ${primaryResponse.status}`
            );
          }

          if (fallbackError) {
            const message =
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError);
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

      const result = (await response.json()) as unknown;

      return parsePrivateApiBalance(result, chain);
    },
  });
}
