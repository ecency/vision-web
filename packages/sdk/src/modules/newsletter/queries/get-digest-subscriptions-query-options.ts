import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { getDigestSubscriptionsRequest } from "../api";

/**
 * The signed-in account's live digest subscriptions. Disabled without a
 * username + token: callers render nothing then, and a request that
 * predictably 401s is noise. `retry: false` because the common failure is a
 * stale token, which a retry with the same token cannot fix.
 */
export function getDigestSubscriptionsQueryOptions(
  username: string | undefined,
  code: string | undefined,
) {
  const name = username?.replace("@", "");
  return queryOptions({
    queryKey: QueryKeys.newsletter.subscriptions(name),
    enabled: !!name && !!code,
    queryFn: async () => {
      if (!code) {
        throw new Error("[SDK][Newsletter] – missing auth");
      }
      return getDigestSubscriptionsRequest(code);
    },
    staleTime: 60_000,
    retry: false,
  });
}
