import { infiniteQueryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { fetchCurationRecommendationsPage } from "../requests";
import { maskDmcaCurationPages } from "../dmca";
import type { CurationRecommendationsPage, CurationRecommendationsParams } from "../types";
import { dedupePagesBy } from "./get-curation-feed-infinite-query-options";

export const CURATION_RECOMMENDATIONS_PAGE_SIZE = 25;

/**
 * Open posts with at least one active recommendation (route 4), ordered by
 * unique recommenders (networks) or by first recommendation time.
 */
export function getCurationRecommendationsInfiniteQueryOptions(
  params: CurationRecommendationsParams = {}
) {
  const sort = params.sort ?? "unique";
  const limit = params.limit ?? CURATION_RECOMMENDATIONS_PAGE_SIZE;
  const normalized: Record<string, string> = { sort, limit: String(limit) };

  return infiniteQueryOptions({
    queryKey: QueryKeys.curation.recommendations(normalized),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetchCurationRecommendationsPage({ sort, limit }, pageParam, signal),
    getNextPageParam: (lastPage: CurationRecommendationsPage): string | undefined => {
      if (!lastPage || lastPage.items.length < limit) {
        return undefined;
      }
      const last = lastPage.items[lastPage.items.length - 1];
      return last?._cursor ?? lastPage.next_cursor ?? undefined;
    },
    // Route 4 items carry no post_id; the author/permlink pair is the identity.
    select: (data) =>
      maskDmcaCurationPages(dedupePagesBy(data, (item) => `${item.author}/${item.permlink}`)),
    staleTime: 10_000,
  });
}

