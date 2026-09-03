import { queryOptions } from "@tanstack/react-query";
import { getQueryClient, QueryKeys } from "@/modules/core";
import { getAccountDelegationsQueryOptions } from "./get-account-delegations-query-options";
import { toReceivedVestingShares } from "../utils/received-vesting-shares";

/**
 * The same list as {@link getReceivedVestingSharesQueryOptions} under the key
 * the wallet's HP asset views use. Both read the HAF balance-api through the
 * shared account-delegations query, so neither depends on the Ecency
 * notification database.
 */
export function getHivePowerDelegatingsQueryOptions(username: string) {
  return queryOptions({
    queryKey: QueryKeys.assets.hivePowerDelegatings(username),
    enabled: !!username,
    queryFn: async () =>
      toReceivedVestingShares(
        username,
        // A page that shows the totals and the list asks twice within seconds;
        // a minute of freshness makes that one balance-api request.
        await getQueryClient().fetchQuery({
          ...getAccountDelegationsQueryOptions(username),
          staleTime: 60_000,
        }),
      ),
  });
}
