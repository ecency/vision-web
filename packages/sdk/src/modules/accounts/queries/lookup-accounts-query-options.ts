import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { callRPC } from "@/modules/core/hive-tx";
import { isQueryableAccountName } from "../utils/account-name-query";

/**
 * Lookup accounts by username prefix
 *
 * @param query - Username prefix to search for
 * @param limit - Maximum number of results (default: 50)
 */
export function lookupAccountsQueryOptions(query: string, limit = 50) {
  return queryOptions({
    queryKey: QueryKeys.accounts.lookup(query, limit),
    queryFn: async (): Promise<string[]> => {
      // `lower_bound_name` is an account_name_type, so a prefix the chain cannot
      // hold is an assert rather than an empty result. Callers feed this from raw
      // input (the editor's `@` autocomplete hands over whatever follows the `@`,
      // punctuation included), so answer "nothing matches" here instead.
      if (!isQueryableAccountName(query)) {
        return [];
      }

      return callRPC("condenser_api.lookup_accounts", [
        query,
        limit,
      ]) as Promise<string[]>;
    },
    enabled: !!query,
    staleTime: Infinity,
  });
}
