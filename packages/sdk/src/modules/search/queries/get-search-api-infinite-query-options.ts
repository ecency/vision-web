import { infiniteQueryOptions } from "@tanstack/react-query";
import { CONFIG, INTERNAL_API_TIMEOUT_MS, withTimeoutSignal, QueryKeys } from "@/modules/core";
import { SearchResponse } from "../types/search-response";
import { parseJsonResponse } from "../parse-json-response";
import { searchRetryPolicy } from "../retry-policy";

export function getSearchApiInfiniteQueryOptions(
  q: string,
  sort: string,
  hideLow: boolean,
  since?: string,
  votes?: number,
  includeNsfw?: boolean
) {
  return infiniteQueryOptions({
    queryKey: QueryKeys.search.api(q, sort, hideLow, since, votes, includeNsfw),
    queryFn: async ({ pageParam, signal }: { pageParam: string | undefined; signal: AbortSignal }) => {
      interface SearchApiPayload {
        q: string;
        sort: string;
        hide_low: boolean;
        since?: string;
        scroll_id?: string;
        votes?: number;
        include_nsfw?: number;
      }

      const payload: SearchApiPayload = { q, sort, hide_low: hideLow };

      if (since) {
        payload.since = since;
      }
      if (pageParam) {
        payload.scroll_id = pageParam;
      }
      if (votes !== undefined) {
        payload.votes = votes;
      }
      if (includeNsfw) {
        payload.include_nsfw = 1;
      }

      const response = await fetch(CONFIG.privateApiHost + "/search-api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ecency-Client": CONFIG.clientId,
        },
        body: JSON.stringify(payload),
        signal: withTimeoutSignal(INTERNAL_API_TIMEOUT_MS, signal),
      });

      // Keeps the backend's own explanation of a rejected query on the error
      // (status + body), instead of collapsing it to a status code.
      return parseJsonResponse<SearchResponse>(response);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: SearchResponse) => lastPage?.scroll_id,
    enabled: !!q,
    retry: searchRetryPolicy,
  });
}
