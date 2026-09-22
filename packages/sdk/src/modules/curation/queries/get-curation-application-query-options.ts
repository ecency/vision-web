import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { curationApplicationMineRequest } from "../requests";

/**
 * The viewer's own guest curator application, the window it was made in and
 * whether they are already on the roster. Keyed by the viewer: it is private,
 * and the answer is different for every account.
 */
export function getCurationApplicationQueryOptions(
  username: string | undefined,
  code: string | undefined,
) {
  return queryOptions({
    queryKey: QueryKeys.curation.application(username),
    queryFn: ({ signal }) => {
      // Guarded twice: `enabled` gates automatic fetching only, a prefetch or a
      // fetchQuery still runs this, and the request would throw "missing auth".
      if (!username || !code) {
        throw new Error(
          "[SDK][Curation] reading the own application needs a signed-in account",
        );
      }
      return curationApplicationMineRequest(code, signal);
    },
    enabled: !!username && !!code,
    staleTime: 60_000,
  });
}
