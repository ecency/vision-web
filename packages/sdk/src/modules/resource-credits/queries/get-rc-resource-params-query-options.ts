import { queryOptions } from "@tanstack/react-query";
import { callRPC } from "@/modules/core/hive-tx";
import { QueryKeys } from "@/modules/core";
import type { RcResourceParams } from "../types/resource-params";

/**
 * Curve coefficients and sizing constants used to price resource usage.
 *
 * These only change at a hardfork, so the entry is kept for the session.
 * `Infinity` is deliberate: it is the one value that schedules no gc timer at
 * all, so it does not hold a request's query cache open on the server the way
 * a long finite window would.
 */
export function getRcResourceParamsQueryOptions() {
  return queryOptions({
    queryKey: QueryKeys.resourceCredits.resourceParams(),
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => (await callRPC("rc_api.get_resource_params", {})) as RcResourceParams
  });
}
