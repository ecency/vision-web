import { queryOptions } from "@tanstack/react-query";
import { callRPC } from "@/modules/core/hive-tx";
import { QueryKeys } from "@/modules/core";
import type { RcResourceParams } from "../types/resource-params";

/**
 * Curve coefficients and sizing constants used to price resource usage.
 *
 * These only change at a hardfork, so the entry is kept for the session:
 * `gcTime: Infinity` is the one value that schedules no gc timer at all, so it
 * does not hold a request's query cache open on the server the way a long
 * finite window would.
 *
 * `staleTime` stays bounded on purpose. Making it infinite too would mean a
 * long-lived session keeps pricing with pre-hardfork coefficients forever,
 * quietly producing wrong RC estimates with no way to recover short of a
 * reload. A day is long enough that this is effectively never refetched, and
 * short enough that a hardfork corrects itself.
 */
export function getRcResourceParamsQueryOptions() {
  return queryOptions({
    queryKey: QueryKeys.resourceCredits.resourceParams(),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: Infinity,
    queryFn: async () => (await callRPC("rc_api.get_resource_params", {})) as RcResourceParams
  });
}
