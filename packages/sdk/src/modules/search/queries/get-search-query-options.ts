import { InfiniteData, infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { CONFIG, INTERNAL_API_TIMEOUT_MS, withTimeoutSignal, QueryKeys } from "@/modules/core";
import { SearchResponse } from "../types/search-response";
import { parseJsonResponse } from "../parse-json-response";
import { searchRetryPolicy } from "../retry-policy";

export function searchQueryOptions(
  q: string,
  sort: string,
  hideLow: string,
  since?: string,
  scroll_id?: string,
  votes?: number
) {
  return queryOptions({
    queryKey: QueryKeys.search.results(q, sort, hideLow, since, scroll_id, votes),
    queryFn: async ({ signal }) => {
      const data: {
        q: string;
        sort: string;
        hide_low: string;
        since?: string;
        scroll_id?: string;
        votes?: number;
      } = { q, sort, hide_low: hideLow };

      if (since) data.since = since;
      if (scroll_id) data.scroll_id = scroll_id;
      if (votes) data.votes = votes;

      const response = await fetch(CONFIG.privateApiHost + "/search-api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ecency-Client": CONFIG.clientId,
        },
        body: JSON.stringify(data),
        signal: withTimeoutSignal(INTERNAL_API_TIMEOUT_MS, signal),
      });

      // Keeps the backend's own explanation of a rejected query on the error
      // (status + body) instead of collapsing it to a status code.
      return parseJsonResponse<SearchResponse>(response);
    },
    retry: searchRetryPolicy,
  });
}

type PageParam = {
  sid: string | undefined;
  hasNextPage: boolean;
};

export function getControversialRisingInfiniteQueryOptions(
  what: string,
  tag: string,
  enabled = true
) {
  return infiniteQueryOptions<
    SearchResponse,
    Error,
    InfiniteData<SearchResponse, PageParam>,
    (string | number)[],
    PageParam
  >({
    queryKey: QueryKeys.search.controversialRising(what, tag),
    initialPageParam: { sid: undefined, hasNextPage: true } as PageParam,

    queryFn: async ({ pageParam, signal }: { pageParam: PageParam; signal: AbortSignal }) => {
      if (!pageParam.hasNextPage) {
        return {
          hits: 0,
          took: 0,
          results: [],
        };
      }

      let sinceDate: Date | undefined;
      const now = new Date();

      switch (tag) {
        case "today":
          sinceDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "week":
          sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "year":
          sinceDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          sinceDate = undefined;
      }

      const q = "* type:post";
      const sort = what === "rising" ? "children" : what;
      const since = sinceDate ? sinceDate.toISOString().split(".")[0] : undefined;
      const hideLow = "0";
      const votes = tag === "today" ? 50 : 200;

      const data: {
        q: string;
        sort: string;
        hide_low: string;
        since?: string;
        scroll_id?: string;
        votes?: number;
      } = { q, sort, hide_low: hideLow };

      if (since) data.since = since;
      if (pageParam.sid) data.scroll_id = pageParam.sid;
      if (votes) data.votes = votes;

      const response = await fetch(CONFIG.privateApiHost + "/search-api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ecency-Client": CONFIG.clientId,
        },
        body: JSON.stringify(data),
        signal: withTimeoutSignal(INTERNAL_API_TIMEOUT_MS, signal),
      });

      // Keeps the backend's own explanation of a rejected query on the error
      // (status + body) instead of collapsing it to a status code.
      return parseJsonResponse<SearchResponse>(response);
    },

    getNextPageParam: (resp: SearchResponse): PageParam => {
      return {
        sid: resp?.scroll_id,
        hasNextPage: resp.results.length > 0,
      };
    },

    enabled,
    retry: searchRetryPolicy,
  });
}
