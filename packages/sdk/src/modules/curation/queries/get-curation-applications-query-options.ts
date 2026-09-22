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
    queryFn: ({ signal }) =>
      curationApplicationListRequest(code, { state }, signal),
    enabled: !!username && !!code,
    staleTime: 60_000,
  });
}
