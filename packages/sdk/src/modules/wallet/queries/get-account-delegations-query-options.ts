import { queryOptions } from "@tanstack/react-query";
import type { AccountDelegations } from "../types";
import { callREST } from "@/modules/core/hive-tx";
import { QueryKeys } from "@/modules/core";

/**
 * Account vesting delegations via the HAF balance-api REST endpoint
 * (`/balance-api/accounts/{account-name}/delegations`).
 *
 * Unlike `condenser_api.get_vesting_delegations` (see
 * {@link getHivePowerDelegatesInfiniteQueryOptions}), this returns the
 * complete outgoing AND incoming lists in a single request, with `callREST`
 * handling multi-node failover. `amount` is raw vests (vests * 10^6).
 */
export function getAccountDelegationsQueryOptions(username: string | undefined) {
  return queryOptions({
    queryKey: QueryKeys.assets.accountDelegations(username),
    enabled: !!username,
    queryFn: ({ signal }) =>
      callREST(
        "balance",
        "/accounts/{account-name}/delegations",
        { "account-name": username },
        undefined,
        undefined,
        signal
      ) as Promise<AccountDelegations>,
  });
}
