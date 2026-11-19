import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { callRPC } from "@/modules/core/hive-tx";
import { normalizeAccountSubscriptions } from "@/modules/communities/types/subscription";

export function getAccountSubscriptionsQueryOptions(
  username: string | undefined
) {
  return queryOptions({
    queryKey: QueryKeys.accounts.subscriptions(username!),
    enabled: !!username,
    queryFn: async ({ signal }) => {
      const response = await callRPC("bridge.list_all_subscriptions", {
          account: username,
        }, undefined, undefined, signal);
      return normalizeAccountSubscriptions(response);
    },
  });
}
