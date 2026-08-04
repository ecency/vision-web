import { infiniteQueryOptions, isServer } from "@tanstack/react-query";
import { CONFIG, INTERNAL_API_TIMEOUT_MS, withTimeoutSignal, QueryKeys } from "@/modules/core";
import { SearchResponse } from "../types/search-response";
import { parseJsonResponse, type RequestError } from "../parse-json-response";

// A `retry` callback replaces React Query's budget outright, so it has to be
// restated: the library default of 3 in the browser, and none on the server,
// where retrying a single-region search backend only stalls the render.
const MAX_RETRIES = isServer ? 0 : 3;

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
    retry: (failureCount: number, error: Error) => {
      // A 4xx is the backend rejecting the query itself (too many tags, over
      // the length cap, nothing left to search once the filters are parsed
      // out). Repeating it repeats the same answer, so the only effect is four
      // requests over several seconds before the UI can say what to change.
      // 408 and 429 are the exceptions: they describe when the request arrived
      // rather than what it contained, and backing off is what resolves them.
      // A client-side timeout aborts the fetch and carries no status at all,
      // so this covers only a real 408 from a gateway in front of the API.
      const { status } = error as RequestError;
      const isTransient = status === 408 || status === 429;
      if (status !== undefined && status >= 400 && status < 500 && !isTransient) {
        return false;
      }

      return failureCount < MAX_RETRIES;
    },
  });
}
