import { AssetOperation } from "@ecency/sdk";

/**
 * i18n namespace and keys for the wallet operation dialog header.
 *
 * Delegate is shared by Hive Power and Hive Engine tokens, and Undelegate only exists for
 * Hive Engine tokens, so anything that is not HP uses the token wording instead of
 * "Delegate Hive Power" (or a missing `transfer.undelegate-title`).
 */
export function getWalletOperationTitleKeys(operation: AssetOperation, asset: string) {
  if (operation === AssetOperation.WithdrawRoutes) {
    return ["withdraw-routes", "title", "description"] as const;
  }

  if (operation === AssetOperation.Transfer && asset === AssetOperation.Gift) {
    return ["transfer", "transfer-title-point", `${operation}-sub-title`] as const;
  }

  if (
    (operation === AssetOperation.Delegate && asset !== "HP") ||
    operation === AssetOperation.Undelegate
  ) {
    return [
      "transfer",
      `${operation}-hive-engine-title`,
      `${operation}-hive-engine-sub-title`
    ] as const;
  }

  return ["transfer", `${operation}-title`, `${operation}-sub-title`] as const;
}
