import { EcencyWalletCurrency } from "../enums";
import { sendEvmTransfer, parseToWei } from "../utils/metamask-evm-transfer";
import { sendSolTransfer } from "../utils/metamask-sol-transfer";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type TransferableCurrency =
  | EcencyWalletCurrency.ETH
  | EcencyWalletCurrency.BNB
  | EcencyWalletCurrency.SOL;

interface ExternalTransferPayload {
  to: string;
  amount: string;
  /** EVM only: the linked wallet address. The send is blocked if the active
   *  MetaMask account does not match it (funds safety). */
  expectedFrom?: string;
}

export function useExternalTransfer(currency: TransferableCurrency) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["ecency-wallets", "external-transfer", currency],
    mutationFn: async ({ to, amount, expectedFrom }: ExternalTransferPayload) => {
      switch (currency) {
        case EcencyWalletCurrency.ETH:
        case EcencyWalletCurrency.BNB: {
          const valueHex = parseToWei(amount);
          const txHash = await sendEvmTransfer(to, valueHex, currency, expectedFrom);
          return { txHash, currency };
        }
        case EcencyWalletCurrency.SOL: {
          const signature = await sendSolTransfer(to, amount);
          return { txHash: signature, currency };
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["ecency-wallets", "external-wallet-balance"]
      });
    }
  });
}
