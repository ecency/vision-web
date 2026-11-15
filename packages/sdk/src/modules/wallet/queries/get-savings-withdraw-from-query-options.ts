import { queryOptions } from "@tanstack/react-query";
import { SavingsWithdrawRequest } from "../types";
import { callRPC } from "@/modules/core/hive-tx";
import { QueryKeys } from "@/modules/core";

/**
 * Get pending savings withdrawal requests for an account
 *
 * @param account - The account username
 */
export function getSavingsWithdrawFromQueryOptions(account: string) {
  return queryOptions({
    queryKey: QueryKeys.wallet.savingsWithdraw(account),
    queryFn: () =>
      callRPC("condenser_api.get_savings_withdraw_from", [
        account,
      ]) as Promise<SavingsWithdrawRequest[]>,
    select: (data) => data.sort((a, b) => a.request_id - b.request_id),
  });
}
