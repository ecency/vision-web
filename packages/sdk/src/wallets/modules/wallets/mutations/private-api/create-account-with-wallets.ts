import { ConfigManager } from "../../../../../index";
import { EcencyWalletCurrency } from "../../enums";
import { getBoundFetch } from "../../utils/get-bound-fetch";
import { useMutation } from "@tanstack/react-query";

interface HiveKeys {
  ownerPublicKey?: string;
  activePublicKey?: string;
  postingPublicKey?: string;
  memoPublicKey?: string;
}

interface Payload {
  currency: EcencyWalletCurrency;
  address: string;
  hiveKeys?: HiveKeys;
  walletAddresses?: Partial<Record<EcencyWalletCurrency, string>>;
}

export function useCreateAccountWithWallets(username: string) {
  const fetchApi = getBoundFetch();

  return useMutation({
    mutationKey: ["ecency-wallets", "create-account-with-wallets", username],
    mutationFn: async ({ currency, address, hiveKeys, walletAddresses }: Payload) => {
      const addresses: Record<string, string> = {};
      if (walletAddresses) {
        for (const [k, v] of Object.entries(walletAddresses)) {
          if (v) addresses[k] = v;
        }
      }

      const response = await fetchApi(`${ConfigManager.getValidatedBaseUrl()}/private-api/wallets-add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          token: currency,
          address,
          meta: {
            ...hiveKeys,
            ...addresses,
            [currency]: address
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Account creation failed (${response.status})`);
      }

      return response;
    },
  });
}
