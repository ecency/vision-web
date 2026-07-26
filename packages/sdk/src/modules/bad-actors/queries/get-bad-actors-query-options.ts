import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "../../core";

const BAD_ACTORS_URL =
  "https://raw.githubusercontent.com/openhive-network/watchmen/main/output/flat/badactors.txt";

export function getBadActorsQueryOptions() {
  return queryOptions({
    queryKey: QueryKeys.badActors.list(),
    queryFn: async ({ signal }) => {
      const response = await fetch(BAD_ACTORS_URL, { signal });

      if (!response.ok) {
        throw new Error(`Failed to fetch bad actors list: ${response.status}`);
      }

      const text = await response.text();
      return new Set(text.split("\n").filter(Boolean));
    },
    staleTime: 24 * 60 * 60 * 1000,
    /**
     * Deliberately left unbounded, including under SSR.
     *
     * `Infinity` is the one value that schedules no gc timer at all —
     * `isValidTimeout` in query-core rejects non-finite timeouts, so
     * `scheduleGc` is a no-op. With no timer there is no GC root, and on a
     * per-request client the entry dies with the request that made it.
     * Replacing it with a finite window would *create* a timer that retains the
     * Query and, through it, that request's whole QueryCache — strictly worse
     * here than leaving it alone.
     */
    gcTime: Infinity
  });
}
