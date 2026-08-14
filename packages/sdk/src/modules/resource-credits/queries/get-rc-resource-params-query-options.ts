import { queryOptions } from "@tanstack/react-query";
import { callRPC } from "@/modules/core/hive-tx";
import type { RcResourceParams } from "../types/resource-params";

/**
 * Curve coefficients and sizing constants used to price resource usage.
 *
 * These only change at a hardfork, so they are cached aggressively; the
 * volatile half of the calculation (pools, regen, share) comes from rc_stats.
 */
export function getRcResourceParamsQueryOptions() {
  return queryOptions({
    queryKey: ["resource-credits", "resource-params"],
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => (await callRPC("rc_api.get_resource_params", {})) as RcResourceParams
  });
}
