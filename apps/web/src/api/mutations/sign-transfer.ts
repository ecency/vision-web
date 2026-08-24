"use client";

import { UseQueryResult } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hpToVests } from "@/features/shared/transfer/hp-to-vests";
import type { TransferAsset, TransferMode } from "@/features/shared/transfer";
import { DEFAULT_DYNAMIC_PROPS } from "@/consts/default-dynamic-props";
import { getDynamicPropsQueryOptions } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { invalidateWalletQueries } from "@/features/wallet/utils/invalidate-wallet-queries";
import { encryptMemo } from "@/utils/memo-crypto";
import { getLoginType } from "@/utils/user-token";
import {
  useTransferMutation,
  useTransferPointMutation,
  useTransferToSavingsMutation,
  useTransferFromSavingsMutation,
  useTransferToVestingMutation,
  useWithdrawVestingMutation,
  useConvertMutation,
  useClaimInterestMutation,
  useDelegateVestingSharesMutation,
  useTransferEngineTokenMutation,
} from "@/api/sdk-mutations";

// Helper to safely read hivePerMVests with a typed fallback
const useHivePerMVests = () => {
  const { data } = useQuery(getDynamicPropsQueryOptions()) as UseQueryResult<
    typeof DEFAULT_DYNAMIC_PROPS,
    Error
  >;
  return (data ?? DEFAULT_DYNAMIC_PROPS).hivePerMVests;
};

export interface SignTransferPayload {
  to: string;
  amount: string;
  memo: string;
  /** Overrides the hook-level asset for this call. Use when the desired asset
   *  may differ from the one captured by the hook (e.g. after a state update
   *  that hasn't triggered a re-render yet). */
  asset?: TransferAsset;
}

/**
 * Unified sign-transfer hook.
 *
 * Dispatches to the appropriate SDK mutation based on `mode` and `asset`.
 * Auth is handled entirely by the SDK adapter (showAuthUpgradeUI for web,
 * stored keys for mobile). No more KeyOrHot — single "Sign" button.
 */
export function useSignTransfer(mode: TransferMode, asset: TransferAsset) {
  const { activeUser } = useActiveAccount();
  const hivePerMVests = useHivePerMVests();
  const queryClient = useQueryClient();

  // All SDK mutation hooks (lightweight — just useMutation wrappers)
  const transfer = useTransferMutation();
  const transferPoint = useTransferPointMutation();
  const toSavings = useTransferToSavingsMutation();
  const fromSavings = useTransferFromSavingsMutation();
  const toVesting = useTransferToVestingMutation();
  const withdrawVesting = useWithdrawVestingMutation();
  const convert = useConvertMutation();
  const claimInterest = useClaimInterestMutation();
  const delegate = useDelegateVestingSharesMutation();
  const transferEngine = useTransferEngineTokenMutation();

  const isPending =
    transfer.isPending ||
    transferPoint.isPending ||
    toSavings.isPending ||
    fromSavings.isPending ||
    toVesting.isPending ||
    withdrawVesting.isPending ||
    convert.isPending ||
    claimInterest.isPending ||
    delegate.isPending ||
    transferEngine.isPending;

  return {
    isPending,
    mutateAsync: async ({ to, amount, memo, asset: overrideAsset }: SignTransferPayload) => {
      const effectiveAsset = overrideAsset ?? asset;

      // Only encrypt for flows that actually carry a memo on-chain.
      // Convert/power-up/power-down/delegate don't, so skip the
      // (interactive) encryption step there — otherwise users would be
      // prompted for a memo key for nothing.
      const memoSupported =
        mode === "transfer-saving" ||
        mode === "withdraw-saving" ||
        mode === "claim-interest" ||
        mode === "transfer";

      let processedMemo = memo;
      if (memoSupported && memo.startsWith("#") && to && activeUser) {
        const loginType = getLoginType(activeUser.username);
        processedMemo = await encryptMemo(
          loginType,
          activeUser.username,
          to,
          memo.slice(1)
        );
      }

      const fullAmount = `${(+amount).toFixed(3)} ${effectiveAsset}`;
      const requestId = Date.now() >>> 0;

      switch (mode) {
        case "transfer":
          if (effectiveAsset === "POINT") {
            await transferPoint.mutateAsync({ to, amount: fullAmount, memo: processedMemo });
          } else if (effectiveAsset !== "HIVE" && effectiveAsset !== "HBD") {
            // Hive Engine token
            await transferEngine.mutateAsync({ to, quantity: amount, symbol: effectiveAsset, memo: processedMemo });
          } else {
            await transfer.mutateAsync({ to, amount: fullAmount, memo: processedMemo });
          }
          break;

        case "transfer-saving":
          await toSavings.mutateAsync({ to, amount: fullAmount, memo: processedMemo });
          break;

        case "withdraw-saving":
          await fromSavings.mutateAsync({ to, amount: fullAmount, memo: processedMemo, requestId });
          break;

        case "convert":
          await convert.mutateAsync({
            amount: fullAmount,
            requestId,
            collateralized: effectiveAsset === "HIVE",
          });
          break;

        case "claim-interest":
          await claimInterest.mutateAsync({ to, amount: fullAmount, memo: processedMemo, requestId });
          break;

        case "power-up":
          await toVesting.mutateAsync({ to, amount: fullAmount });
          break;

        case "power-down": {
          const vests = hpToVests(Number(amount), hivePerMVests);
          await withdrawVesting.mutateAsync({ vestingShares: vests });
          break;
        }

        case "delegate": {
          const vests = hpToVests(Number(amount), hivePerMVests);
          await delegate.mutateAsync({ delegatee: to, vestingShares: vests });
          break;
        }
      }

      // Invalidate wallet caches after successful transaction
      invalidateWalletQueries(queryClient, activeUser?.username);
    },
  };
}
