import { queryOptions } from "@tanstack/react-query";
import { getQueryClient, QueryKeys } from "@/modules/core";
import { getAccountDelegationsQueryOptions } from "./get-account-delegations-query-options";
import { toReceivedVestingShares } from "../utils/received-vesting-shares";

/**
 * Who delegates HP to `username`, largest first.
 *
 * Read from the HAF balance-api through {@link getAccountDelegationsQueryOptions}
 * (fetched via the shared query client, so a page showing the totals and the
 * list makes one request), not from the Ecency notification database any more.
 * The return shape is unchanged apart from `timestamp`, which balance-api does
 * not carry.
 */
export function getReceivedVestingSharesQueryOptions(username: string) {
  return queryOptions({
    queryKey: QueryKeys.wallet.receivedVestingShares(username),
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
