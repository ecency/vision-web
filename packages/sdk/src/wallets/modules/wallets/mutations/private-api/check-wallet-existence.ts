import { ConfigManager } from "../../../../../index";
import { EcencyWalletCurrency } from "../../enums";
import { useMutation } from "@tanstack/react-query";

interface Payload {
  address: string;
  currency: EcencyWalletCurrency;
}

export function useCheckWalletExistence() {
  return useMutation({
    mutationKey: ["ecency-wallets", "check-wallet-existence"],
    mutationFn: async ({ address, currency }: Payload) => {
      const response = await fetch(
        `${ConfigManager.getValidatedBaseUrl()}/private-api/wallets-exist`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address,
            token: currency,
          }),
        }
      );
      const data = await response.json();
      return data.length === 0;
    },
  });
}
