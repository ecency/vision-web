import { CONFIG, QueryKeys } from "@/modules/core";
import { InfiniteData, infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { Entry } from "../types";
import { filterDmcaEntry } from "../utils/filter-dmca-entries";
import { getPostsRanked } from "@/modules/bridge";
import { callRPC } from "@/modules/core/hive-tx";

type PageParam = {
  author: string | undefined;
  permlink: string | undefined;
  hasNextPage: boolean;
};

interface GetPostsRankedOptions {
  resolvePosts?: boolean;
}

/**
 * Display order for one page.
 *
 * Pinned entries are captured before the created-date sort: the bridge surfaces
 * them at the head of the response in the community moderators' chosen order,
 * which the sort would scatter by age. Every pin is kept, since an earlier
 * post-sort find() kept one and silently dropped the rest, so multi-pin
 * communities never displayed their other pinned posts. Pins only occur on the
 * first page, cursor pages return none, so this is a no-op elsewhere.
 *
 * Applied in `select` rather than in the query function so it cannot reach the
 * pagination cursor.
 */
function orderForDisplay(page: Entry[], sort: string): Entry[] {
  const pinned = page.filter((entry) => entry.stats?.is_pinned);
  const rest = page.filter((entry) => !entry.stats?.is_pinned);

  if (sort === "hot") {
    return [...pinned, ...rest];
  }

  const byCreated = [...rest].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );
  return [...pinned, ...byCreated];
}

export function getPostsRankedInfiniteQueryOptions(
  sort: string,
  tag: string,
  limit = 20,
  observer = "",
  enabled = true,
  _options: GetPostsRankedOptions = {}
) {
  return infiniteQueryOptions<
    Entry[],
    Error,
    InfiniteData<Entry[], PageParam>,
    (string | number)[],
    PageParam
  >({
    queryKey: QueryKeys.posts.postsRanked(sort, tag, limit, observer),
    queryFn: async ({ pageParam, signal }: { pageParam: PageParam; signal: AbortSignal }) => {
      if (!pageParam.hasNextPage) {
        return [];
      }

      let sanitizedTag = tag;
      if (CONFIG.dmcaTagRegexes.some((regex) => regex.test(tag))) {
        sanitizedTag = "";
      }

      const response = await callRPC("bridge.get_ranked_posts", {
        sort,
        start_author: pageParam.author,
        start_permlink: pageParam.permlink,
        limit,
        tag: sanitizedTag,
        observer,
      }, undefined, undefined, signal);

      if (response === null || response === undefined) {
        return [];
      }

      if (!Array.isArray(response)) {
        throw new Error(
          `[SDK] get_ranked_posts returned ${typeof response} for sort=${sort}`
        );
      }

      // Kept in the bridge's own order. getNextPageParam takes the cursor from
      // the last entry of the page this returns, and the bridge continues from
      // that entry in ITS ranking, so reordering here made the next request
      // start from the middle of the previous ranked page: for trending, payout
      // and muted the last entry by date is not the last entry by rank, and
      // scrolling repeated some posts and skipped others. Display order is
      // applied in `select`, which React Query runs after pagination.
      return filterDmcaEntry(response as Entry[]);
    },
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) => orderForDisplay(page, sort)),
    }),
    enabled,
    initialPageParam: {
      author: undefined,
      permlink: undefined,
      hasNextPage: true,
    } as PageParam,
    getNextPageParam: (lastPage: Entry[]) => {
      // React Query reads "there is no next page" from undefined alone, so
      // returning an object here always left hasNextPage true. An infinite list
      // then keeps calling fetchNextPage at the end of the feed, appending an
      // empty page each time: the query state churns and the cache grows for as
      // long as the reader sits at the bottom.
      const last = lastPage?.[lastPage.length - 1];
      if (!last) {
        return undefined;
      }

      return {
        author: last.author,
        permlink: last.permlink,
        hasNextPage: true,
      };
    },
  });
}

export function getPostsRankedQueryOptions(
  sort: string,
  start_author: string = "",
  start_permlink: string = "",
  limit: number = 20,
  tag: string = "",
  observer: string = "",
  enabled = true
) {
  return queryOptions({
    queryKey: QueryKeys.posts.postsRankedPage(sort, start_author, start_permlink, limit, tag, observer),
    enabled,
    queryFn: async ({ signal } = {} as any) => {
      let sanitizedTag = tag;
      if (CONFIG.dmcaTagRegexes.some((regex) => regex.test(tag))) {
        sanitizedTag = "";
      }

      const response = await getPostsRanked(
        sort,
        start_author,
        start_permlink,
        limit,
        sanitizedTag,
        observer,
        signal
      );

      return filterDmcaEntry(response ?? []) as Entry[];
    },
  });
}
