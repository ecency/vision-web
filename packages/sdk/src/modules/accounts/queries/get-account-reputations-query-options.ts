import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { AccountReputation } from "../types";
import { callRPC } from "@/modules/core/hive-tx";
import { isQueryableAccountName } from "../utils/account-name-query";

export function getAccountReputationsQueryOptions(query: string, limit = 50) {
  return queryOptions({
    queryKey: QueryKeys.accounts.reputations(query, limit),
    enabled: !!query,
    queryFn: async (): Promise<AccountReputation[]> => {
      // Same account_name_type argument as lookup_accounts, same assert if the value
      // is longer than the chain can hold.
      if (!query || !isQueryableAccountName(query)) {
        return [];
      }

      return callRPC("condenser_api.get_account_reputations", [query, limit]) as Promise<AccountReputation[]>;
    },
  });
}
