import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import type { CurationApplicationState } from "../types";
import { curationApplicationListRequest } from "../requests";

/**
 * The review queue. Admin only upstream, so it is keyed by the viewer and never
 * shares an entry with anything public. No state asked for means the live queue:
 * what is still waiting on a decision, oldest first.
 */
export function getCurationApplicationsQueryOptions(
  username: string | undefined,
  code: string | undefined,
  state?: CurationApplicationState,
) {
  return queryOptions({
    queryKey: QueryKeys.curation.applications(username, state),
    queryFn: ({ signal }) => {
      // Guarded twice: `enabled` gates automatic fetching only, a prefetch or a
      // fetchQuery still runs this, and the request would throw "missing auth".
      if (!username || !code) {
        throw new Error(
          "[SDK][Curation] reading the application queue needs a signed-in account",
        );
      }
      return curationApplicationListRequest(code, { state }, signal);
    },
    enabled: !!username && !!code,
    staleTime: 60_000,
  });
}
