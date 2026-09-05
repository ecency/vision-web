import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { fetchCurationRoster } from "../requests";

/** Curator roster (route 3): usernames and roles. Changes rarely; 10 minutes shared. */
export function getCurationRosterQueryOptions() {
  return queryOptions({
    queryKey: QueryKeys.curation.roster(),
    queryFn: ({ signal }) => fetchCurationRoster(signal),
    staleTime: 600_000,
  });
}
