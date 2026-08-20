import { getAccountPostsInfiniteQueryOptions, getPostsRankedInfiniteQueryOptions } from "@ecency/sdk";
import { prefetchInfiniteQuery, getInfiniteQueryData, QueryIdentifiers } from "@/core/react-query";
import { InfiniteData, UndefinedInitialDataInfiniteOptions, UseInfiniteQueryResult, useInfiniteQuery, infiniteQueryOptions } from "@tanstack/react-query";
import { Entry, SearchResponse } from "@/entities";
import { appAxios } from "@/api/axios";
import { apiBase } from "@/api/helper";
import { DEFAULT_OBSERVER } from "@/consts/observer";
import { slimEntryPage, withSlimEntries } from "@/core/entries/slim-entry";

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
      return slimEntryPage(response.data);
    },
    getNextPageParam: (
      _lastPage: PromotedPage,
      _allPages: PromotedPage[],
      lastPageParam: PromotedCursor
    ): PromotedCursor | undefined =>
      lastPageParam === "empty" ? "fetched" : undefined,
  });
}


// Profile sections whose cards ARE the body: a comment or a reply has no title,
// no description and no cover image, so slimming one leaves an empty row. Every
// other section renders a summary card and can be slimmed.
const BODY_BACKED_SECTIONS = ["comments", "replies"];

/**
 * The one place the feed's query options are built, so the server prefetch, the
 * cache read and the client hook cannot drift apart — they share a query key, and
 * a slim page reaching one of them but not the others would mean the SSR payload
 * and the client's later pages disagreed about what an entry holds.
 */
function buildFeedQueryOptions(what: string, tag: string, limit: number, observer: string) {
  const isUser = tag.startsWith("@") || tag.startsWith("%40");

  if (what === "promoted") {
    return getPromotedEntriesInfiniteQuery();
  }

  if (isUser) {
    const options = getAccountPostsInfiniteQueryOptions(
      tag.replace("@", "").replace(/%40/g, ""),
      what,
      limit,
      observer,
      true
    );
    return BODY_BACKED_SECTIONS.includes(what) ? options : withSlimEntries(options);
  }

  if (what === "feed") {
    return withSlimEntries(
      getPostsRankedInfiniteQueryOptions(what, tag, limit, observer, true, {
        resolvePosts: false
      })
    );
  }

  return withSlimEntries(getPostsRankedInfiniteQueryOptions(what, tag, limit, observer));
}

export async function prefetchGetPostsFeedQuery(
    what: string,
    tag = "",
    limit = 20,
    observer?: string
): Promise<FeedInfinite | undefined> {
  // One page per call: prefetchInfiniteQuery fetches only the initial page param
  // unless it is handed a `pages` count, and `limit` is the bridge's own cap of 20.
  return prefetchInfiniteQuery(
    buildFeedQueryOptions(what, tag, limit, observer ?? DEFAULT_OBSERVER) as any
  ) as Promise<FeedInfinite | undefined>;
}

export function getPostsFeedQueryData(
    what: string,
    tag: string,
    limit = 20,
    observer?: string
): FeedInfinite | undefined {
  return getInfiniteQueryData(
    buildFeedQueryOptions(what, tag, limit, observer ?? DEFAULT_OBSERVER) as any
  ) as FeedInfinite | undefined;
}

export function usePostsFeedQuery(
    what: string,
    tag: string,
    observer?: string,
    limit = 20
): UseInfiniteQueryResult<InfiniteData<Page, unknown>, Error> {
  const queryOptions = buildFeedQueryOptions(what, tag, limit, observer ?? DEFAULT_OBSERVER);

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
