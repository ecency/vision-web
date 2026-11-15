import { useBroadcastMutation } from "@/modules/core/mutations";
import type { BroadcastMode } from "@/modules/core/mutations";
import type { AuthContextV2 } from "@/modules/core/types";
import { EcencyAnalytics } from "@/modules/analytics";
import { getQueryClient, QueryKeys } from "@/modules/core";
import type { AuthorityLevel } from "@/modules/operations/authority-map";
import { AssetOperation } from "../types";
import {
  buildTransferOp,
  buildTransferToSavingsOp,
  buildTransferFromSavingsOp,
  buildTransferToVestingOp,
  buildWithdrawVestingOp,
  buildDelegateVestingSharesOp,
  buildSetWithdrawVestingRouteOp,
  buildConvertOp,
  buildClaimInterestOps,
  buildPointTransferOp,
  buildEngineOp,
  buildEngineClaimOp,
} from "@/modules/operations/builders";
import type { Operation } from "../../../hive-tx";

export interface WalletOperationPayload {
  from: string;
  to?: string;
  amount?: string;
  memo?: string;
  request_id?: number;
  from_account?: string;
  to_account?: string;
  percent?: number;
  auto_vest?: boolean;
  mode?: string;
  [key: string]: unknown;
}

function buildHiveOperations(
  asset: string,
  operation: AssetOperation,
  payload: WalletOperationPayload
): Operation[] | null {
  const { from, to = "", amount = "", memo = "" } = payload;
  const requestId = payload.request_id ?? (Date.now() >>> 0);

  switch (asset) {
    case "HIVE":
      switch (operation) {
        case AssetOperation.Transfer:
          return [buildTransferOp(from, to, amount, memo)];
        case AssetOperation.TransferToSavings:
          return [buildTransferToSavingsOp(from, to, amount, memo)];
        case AssetOperation.WithdrawFromSavings:
          return [buildTransferFromSavingsOp(from, to, amount, memo, requestId)];
        case AssetOperation.PowerUp:
          return [buildTransferToVestingOp(from, to, amount)];
      }
      break;

    case "HBD":
      switch (operation) {
        case AssetOperation.Transfer:
          return [buildTransferOp(from, to, amount, memo)];
        case AssetOperation.TransferToSavings:
          return [buildTransferToSavingsOp(from, to, amount, memo)];
        case AssetOperation.WithdrawFromSavings:
          return [buildTransferFromSavingsOp(from, to, amount, memo, requestId)];
        case AssetOperation.ClaimInterest:
          return buildClaimInterestOps(from, to, amount, memo, requestId);
        case AssetOperation.Convert:
          return [buildConvertOp(from, amount, Math.floor(Date.now() / 1000))];
      }
      break;

    case "HP":
      switch (operation) {
        case AssetOperation.PowerDown:
          return [buildWithdrawVestingOp(from, amount)];
        case AssetOperation.Delegate:
          return [buildDelegateVestingSharesOp(from, to, amount)];
        case AssetOperation.WithdrawRoutes:
          return [buildSetWithdrawVestingRouteOp(
            payload.from_account ?? from,
            payload.to_account ?? to,
            payload.percent ?? 0,
            payload.auto_vest ?? false
          )];
      }
      break;

    case "POINTS":
      if (operation === AssetOperation.Transfer || operation === AssetOperation.Gift) {
        return [buildPointTransferOp(from, to, amount, memo)];
      }
      break;
  }

  return null;
}

function buildEngineOperations(
  asset: string,
  operation: AssetOperation,
  payload: WalletOperationPayload
): Operation[] | null {
  const { from, to = "", amount = "" } = payload;
  const quantity = typeof amount === "string" && amount.includes(" ")
    ? amount.split(" ")[0]
    : String(amount);

  switch (operation) {
    case AssetOperation.Transfer:
      return [buildEngineOp(from, "transfer", {
        symbol: asset, to, quantity, memo: payload.memo ?? ""
      })];
    case AssetOperation.Stake:
      return [buildEngineOp(from, "stake", { symbol: asset, to, quantity })];
    case AssetOperation.Unstake:
      return [buildEngineOp(from, "unstake", { symbol: asset, to, quantity })];
    case AssetOperation.Delegate:
      return [buildEngineOp(from, "delegate", { symbol: asset, to, quantity })];
    case AssetOperation.Undelegate:
      return [buildEngineOp(from, "undelegate", { symbol: asset, from: to, quantity })];
    case AssetOperation.Claim:
      return [buildEngineClaimOp(from, [asset])];
  }

  return null;
}

/**
 * Determines authority level for a wallet operation.
 * Engine token claims use posting authority; everything else uses active.
 */
function getWalletOperationAuthority(operation: AssetOperation): AuthorityLevel {
  if (operation === AssetOperation.Claim) {
    return 'posting';
  }
  return 'active';
}

/**
 * Meta-mutation hook that dispatches wallet operations based on asset and operation type.
 *
 * Supports HIVE, HBD, HP, POINTS, and Hive Engine tokens.
 * Uses `useBroadcastMutation` for unified auth handling via `AuthContextV2`.
 *
 * @param username - The Hive account performing the operation
 * @param asset - The asset symbol (e.g., "HIVE", "HBD", "HP", "POINTS", or engine token)
 * @param operation - The operation type from AssetOperation enum
 * @param auth - Auth context for broadcasting
 */
export function useWalletOperation(
  username: string | undefined,
  asset: string,
  operation: AssetOperation,
  auth?: AuthContextV2,
  broadcastMode?: BroadcastMode
) {
  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    username,
    operation as any
  );

  return useBroadcastMutation<WalletOperationPayload>(
    ["ecency-wallets", asset, operation],
    username,
    (payload) => {
      // Try native Hive + POINTS operations
      const hiveOps = buildHiveOperations(asset, operation, payload);
      if (hiveOps) return hiveOps;

      // Try engine token operations
      const engineOps = buildEngineOperations(asset, operation, payload);
      if (engineOps) return engineOps;

      throw new Error(`[SDK][Wallet] – no operation builder for asset="${asset}" operation="${operation}"`);
    },
    () => {
      recordActivity();

      const keysToInvalidate: (string | undefined)[][] = [];

      // Invalidate asset-specific queries (prefix-matches all currency variants)
      keysToInvalidate.push(["ecency-wallets", "asset-info", username, asset]);

      if (asset === "HIVE") {
        keysToInvalidate.push(["ecency-wallets", "asset-info", username, "HP"]);
      }

      // Invalidate portfolio (prefix-matches all currency/filter variants)
      keysToInvalidate.push(["wallet", "portfolio", "v2", username]);

      // A savings withdrawal is pending for 3 days: refetch the list of them.
      if (operation === AssetOperation.WithdrawFromSavings && username) {
        keysToInvalidate.push(QueryKeys.wallet.savingsWithdraw(username));
      }

      // Delay invalidation to allow blockchain to process
      setTimeout(() => {
        keysToInvalidate.forEach((key) => {
          getQueryClient().invalidateQueries({ queryKey: key });
        });
      }, 5000);
    },
    auth,
    getWalletOperationAuthority(operation),
    { broadcastMode }
  );
}
