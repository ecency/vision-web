import { queryOptions } from "@tanstack/react-query";
import { CONFIG, QueryKeys } from "@/modules/core";

export interface ProMembersResponse {
  /** Usernames of active Ecency Pro members. */
  members: string[];
  count: number;
}

/**
 * Public, cached roster of Ecency Pro members. Backed by a lightweight private-api
 * endpoint (no auth) so any surface can decorate a username with a Pro badge without
 * a per-user request.
 *
 * `staleTime` is deliberately shorter than the endpoint's own cache window and is
 * NOT raised to match it. react-query has no idea how old a response already was
 * when `fetch` served it from the browser cache: it treats a nine-minute-old
 * cached body as freshly fetched and starts its own window from zero. Worst-case
 * staleness is therefore the endpoint's window plus this one, so raising this to
 * match the server would roughly double it rather than align it.
 */
export function getProMembersQueryOptions() {
  return queryOptions({
    queryKey: QueryKeys.accounts.proMembers(),
    queryFn: async () => {
      const response = await fetch(CONFIG.privateApiHost + "/private-api/pro-members", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch pro members: ${response.status}`);
      }

      return response.json() as Promise<ProMembersResponse>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Lowercased set of member usernames for O(1), case-insensitive membership checks. */
export function proMembersSet(members?: string[]): Set<string> {
  return new Set((members ?? []).map((m) => m.toLowerCase()));
}
