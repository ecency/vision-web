import { infiniteQueryOptions, type InfiniteData } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { maskDmcaCurationPages } from "../dmca";
import { fetchCurationFeedPage, normalizeCurationParams } from "../requests";
import type { CurationFeedPage, CurationFeedParams, CurationRow } from "../types";

export const CURATION_FEED_PAGE_SIZE = 25;
export const CURATION_FEED_STALE_MS = 10_000;

/**
 * Drops rows whose key already appeared on an earlier page. Needed for the
 * live-keyset `unique` order (a row whose count rose between two pages repeats),
 * harmless for the immutable chronological orders. Untouched pages keep their
 * identity so memoized rows do not re-render.
 */
export function dedupePagesBy<TPage extends { items: unknown[] }>(
  data: InfiniteData<TPage, unknown>,
  keyOf: (item: TPage["items"][number]) => string | number
): InfiniteData<TPage, unknown> {
  const seen = new Set<string | number>();
  let changed = false;
  const pages = data.pages.map((page) => {
    const items = page.items.filter((row) => {
      const key = keyOf(row);
      if (seen.has(key)) {
        changed = true;
        return false;
      }
      seen.add(key);
      return true;
    });
    return items.length === page.items.length ? page : { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}

/** Feed pages dedupe by `post_id`. */
export function dedupeCurationPages<TPage extends { items: Array<{ post_id: number }> }>(
  data: InfiniteData<TPage, unknown>
): InfiniteData<TPage, unknown> {
  return dedupePagesBy(data, (row) => row.post_id);
}

interface SelectableFeedRow {
  post_id: number;
  author: string;
  permlink: string;
  title: string;
  summary?: string | null;
  first_image?: string | null;
}

/**
 * The select every desk feed shares: dedupe by `post_id`, then blank the rows
 * on the takedown list. The roster feed (web owned, because its queryFn needs
 * a fresh token) uses it too, so both feeds hide the same rows.
 */
export function selectCurationFeedPages<TPage extends { items: SelectableFeedRow[] }>(
  data: InfiniteData<TPage, unknown>
): InfiniteData<TPage, unknown> {
  return maskDmcaCurationPages(dedupeCurationPages(data));
}

/**
 * Public curation feed (route 1), keyset paginated.
 *
 * `_cursor` on the last row is opaque: it encodes the order's key (`created`
 * and `post_id` for the chronological sorts, the recommender pair for `unique`,
 * the hash pair for `random`). A short page ends the list. No `refetchInterval`
 * (React Query would refetch every loaded page) and no `initialData` (the web
 * client's `refetchOnMount: false` would then never fetch page 1): the web polls
 * `status` and refetches page 1 only when `feed_version` changes.
 */
export function getCurationFeedInfiniteQueryOptions(params: CurationFeedParams = {}) {
  const limit = params.limit ?? CURATION_FEED_PAGE_SIZE;
  const normalized = normalizeCurationParams({ ...params, limit });

  return infiniteQueryOptions({
    queryKey: QueryKeys.curation.feed(normalized),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchCurationFeedPage({ ...params, limit }, pageParam, signal),
    getNextPageParam: (lastPage: CurationFeedPage): string | undefined => {
      if (!lastPage || lastPage.items.length < limit) {
        return undefined;
      }
      const last: CurationRow | undefined = lastPage.items[lastPage.items.length - 1];
      return last?._cursor ?? lastPage.next_cursor ?? undefined;
    },
    select: selectCurationFeedPages,
    staleTime: CURATION_FEED_STALE_MS,
  });
}
