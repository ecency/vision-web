import { getAccountPostsInfiniteQueryOptions, getPostsRankedInfiniteQueryOptions } from "@ecency/sdk";
import { prefetchInfiniteQuery, getInfiniteQueryData, QueryIdentifiers } from "@/core/react-query";
import { InfiniteData, UndefinedInitialDataInfiniteOptions, UseInfiniteQueryResult, useInfiniteQuery, infiniteQueryOptions } from "@tanstack/react-query";
import { Entry, SearchResponse } from "@/entities";
import { appAxios } from "@/api/axios";
import { apiBase } from "@/api/helper";
import { DEFAULT_OBSERVER } from "@/consts/observer";

// Unify all branches on a single page type
type Page = Entry[] | SearchResponse;
type FeedInfinite = InfiniteData<Page, unknown>;

// Helper function to create promoted entries infinite query
// This wraps the SDK query in an infinite query shape for feed compatibility
type PromotedPage = Entry[];
type PromotedCursor = "empty" | "fetched";

function getPromotedEntriesInfiniteQuery() {
  return infiniteQueryOptions({
    // Widened to match the SDK feed queries' key type so the three branches in
    // usePostsFeedQuery form a single assignable options union.
    queryKey: [QueryIdentifiers.PROMOTED_ENTRIES, "infinite"] as (string | number)[],
    initialPageParam: "empty" as PromotedCursor,
    queryFn: async ({ pageParam }: { pageParam: PromotedCursor }) => {
      if (pageParam === "fetched") return [];
      const response = await appAxios.get<Entry[]>(
        apiBase(`/private-api/promoted-entries`)
      );
      return response.data;
    },
    getNextPageParam: (
      _lastPage: PromotedPage,
      _allPages: PromotedPage[],
      lastPageParam: PromotedCursor
    ): PromotedCursor | undefined =>
      lastPageParam === "empty" ? "fetched" : undefined,
  });
}

export async function prefetchGetPostsFeedQuery(
    what: string,
    tag = "",
    limit = 20,
    observer?: string
): Promise<FeedInfinite | undefined> {
  const isUser = tag.startsWith("@") || tag.startsWith("%40");
  const isPromotedSection = what === "promoted";
  const resolvedObserver = observer ?? DEFAULT_OBSERVER;

  if (isPromotedSection) {
    return prefetchInfiniteQuery(getPromotedEntriesInfiniteQuery()) as Promise<FeedInfinite | undefined>;
  }

  if (isUser) {
    return prefetchInfiniteQuery(
      getAccountPostsInfiniteQueryOptions(
        tag.replace("@", "").replace(/%40/g, ""),
        what,
        limit,
        resolvedObserver,
        true
      )
    ) as Promise<FeedInfinite | undefined>;
  }

  if (what === "feed") {
    return prefetchInfiniteQuery(
      getPostsRankedInfiniteQueryOptions(
        what,
        tag,
        limit,
        resolvedObserver,
        true,
        { resolvePosts: false }
      )
    ) as Promise<FeedInfinite | undefined>;
  }

  return prefetchInfiniteQuery(
    getPostsRankedInfiniteQueryOptions(what, tag, limit, resolvedObserver)
  ) as Promise<FeedInfinite | undefined>;
}

export function getPostsFeedQueryData(
    what: string,
    tag: string,
    limit = 20,
    observer?: string
): FeedInfinite | undefined {
  const isUser = tag.startsWith("@") || tag.startsWith("%40");
  const isPromotedSection = what === "promoted";
  const resolvedObserver = observer ?? DEFAULT_OBSERVER;

  if (isPromotedSection) {
    return getInfiniteQueryData(getPromotedEntriesInfiniteQuery()) as FeedInfinite | undefined;
  }

  if (isUser) {
    return getInfiniteQueryData(
      getAccountPostsInfiniteQueryOptions(
        tag.replace("@", "").replace(/%40/g, ""),
        what,
        limit,
        resolvedObserver,
        true
      )
    ) as FeedInfinite | undefined;
  }

  if (what === "feed") {
    return getInfiniteQueryData(
      getPostsRankedInfiniteQueryOptions(
        what,
        tag,
        limit,
        resolvedObserver,
        true,
        { resolvePosts: false }
      )
    ) as FeedInfinite | undefined;
  }

  return getInfiniteQueryData(
    getPostsRankedInfiniteQueryOptions(what, tag, limit, resolvedObserver)
  ) as FeedInfinite | undefined;
}

export function usePostsFeedQuery(
    what: string,
    tag: string,
    observer?: string,
    limit = 20
): UseInfiniteQueryResult<InfiniteData<Page, unknown>, Error> {
  const isUser = tag.startsWith("@") || tag.startsWith("%40");
  const isPromotedSection = what === "promoted";
  const resolvedObserver = observer ?? DEFAULT_OBSERVER;

  const queryOptions =
      isPromotedSection
          ? getPromotedEntriesInfiniteQuery()
          : isUser
              ? getAccountPostsInfiniteQueryOptions(
                  tag.replace("@", "").replace(/%40/g, ""),
                  what,
                  limit,
                  resolvedObserver,
                  true
              )
              : getPostsRankedInfiniteQueryOptions(
                    what,
                    tag,
                    limit,
                    resolvedObserver,
                    true,
                    what === "feed" ? { resolvePosts: false } : undefined
                );

  // Each branch above is individually a valid infinite query, but they use
  // different page-param and page types, so their union matches no single
  // useInfiniteQuery overload. Unify at this boundary only.
  // No placeholderData here. It would be inherited on EVERY query key change,
  // not just an observer change, so navigating between two profiles or two tags
  // would render the previous author's entries under the new heading.
  return useInfiniteQuery(
    queryOptions as unknown as UndefinedInitialDataInfiniteOptions<
      Page,
      Error,
      FeedInfinite,
      (string | number)[],
      unknown
    >
  ) as unknown as UseInfiniteQueryResult<InfiniteData<Page, unknown>, Error>;
}
