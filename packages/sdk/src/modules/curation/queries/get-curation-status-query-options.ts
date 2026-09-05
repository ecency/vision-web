import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { fetchCurationStatus } from "../requests";

/**
 * Desk status (route 2): team cursor, counts, @ecency VP and the mana budget.
 * Public, memoized 15 s at the gateway. The web polls it every 60 s while
 * visible and uses `feed_version` to decide whether page 1 needs a refetch.
 */
export function getCurationStatusQueryOptions() {
  return queryOptions({
    queryKey: QueryKeys.curation.status(),
    queryFn: ({ signal }) => fetchCurationStatus(signal),
    staleTime: 15_000,
  });
}
