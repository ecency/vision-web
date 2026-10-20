"use client";

import React, { useMemo } from "react";
import { usePostsFeedQuery } from "@/api/queries";
import { useBottomPagination } from "@/core/hooks";
import { EntryListLoadError } from "@/features/shared/entry-list-content/entry-list-load-error";
import { Entry, SearchResponse } from "@/entities";
import type { InfiniteData } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { DetectBottom } from "@/features/shared/detect-bottom";
import { EntryListContent, EntryListContentLoading, EntryListContentNoData } from "@/features/shared/entry-list-content";
import { EcencyConfigManager } from "@/config";
import { useVisibleEntries } from "@/features/shared/entry-list-item/use-muted-authors";
import { useAutoPagingPaused } from "@/features/shared/entry-list-item/use-auto-paging-paused";
import { getPromotedPostsQuery } from "@ecency/sdk";
import { withSlimEntries } from "@/core/entries/slim-entry";
import { useQuery } from "@tanstack/react-query";

interface Props {
  filter: string;
  tag: string;
  observer?: string;
}

type Page = Entry[] | SearchResponse;

export function FeedList({ filter, tag, observer }: Props) {
  const searchParams = useSearchParams();
  const noReblog = searchParams?.get("no-reblog") === "true";
  const visionFeatures = EcencyConfigManager.CONFIG.visionFeatures;

  // Fetch promoted posts if feature is enabled and get the data
  const { data: promotedPosts } = useQuery({
    // Matches the server prefetch on this key — see the feed page.
    ...withSlimEntries(getPromotedPostsQuery<Entry>()),
    enabled: visionFeatures.promotions.enabled
  });

  // Single source of truth - one query call
  const { data, dataUpdatedAt, fetchNextPage, refetch, isError, isLoading, isFetching, isFetchingNextPage, hasNextPage } =
    usePostsFeedQuery(filter, tag, observer);

  // Extract entries from all pages (no skipping - simpler and works with client-side navigation)
  const entryPages = useMemo(() => {
    const pages = (data as InfiniteData<Page, unknown> | undefined)?.pages ?? [];

    return pages.map((page) => {
      const extracted: Entry[] = Array.isArray(page)
        ? page
        : ((page as any).items ?? (page as any).results ?? []);
      return noReblog
        ? extracted.filter((entry: Entry) => !entry.reblogged_by || entry.reblogged_by.length === 0)
        : extracted;
    });
  }, [data, filter, tag, observer, noReblog]); // Include filter/tag/observer to ensure recalc on param changes
  const entries = useMemo(() => entryPages.flat(), [entryPages]);
  const autoPagingPaused = useAutoPagingPaused(entryPages);

  // Everything the viewer can actually see: a feed whose every author they muted
  // has to reach the empty state below, not render as blank space.
  const visibleEntries = useVisibleEntries(entries);

  // Simple, clear loading and empty state logic. `!hasNextPage` keeps the
  // message off while pages the viewer might see are still to come: everything
  // loaded so far being muted is not an empty feed, and DetectBottom is already
  // fetching the next page.
  const isLoadingData = isLoading || (isFetching && visibleEntries.length === 0);
  // A failed load is not an empty feed; the retry below says what happened.
  const isEmpty =
    !isLoading && !isFetching && !isError && !hasNextPage && visibleEntries.length === 0;
  const showLoading = isLoadingData || isFetchingNextPage;

  // Check if this is a global feed (should never show empty state)
  // Global feed = trending/hot/created/payout/muted/promoted (always has content)
  // "feed" is also a valid filter (user's personalized feed) but may legitimately be empty
  const isGlobalFeed = ["trending", "hot", "created", "payout", "muted", "promoted"].includes(filter) && tag !== "my";

  // Only show empty state for personalized feeds, never for global feeds
  const shouldShowEmpty = isEmpty && !isGlobalFeed;

  // Not an inline handler: that is a new function every render, so a FAILED
  // fetch re-ran the sentinel and retried at once, in a loop for as long as the
  // API was down. See useBottomPagination, which also covers the old guards
  // (nothing while a fetch is in flight). A loaded page with nothing to show
  // now pages on, up to useAutoPagingPaused, instead of stalling.
  const handleLoadMore = useBottomPagination({
    data: data as { pages: unknown[] } | undefined,
    dataUpdatedAt,
    hasNextPage,
    isFetching,
    fetchNextPage
  });

  // The pagination callback only fetches a next page (or a missing first one);
  // a failed refetch of a list that is already complete needs a plain refetch.
  const retry = hasNextPage || !data?.pages?.length ? handleLoadMore : () => refetch();

  return (
    <>
      {/* Show all entries */}
      <EntryListContent
        username=""
        loading={false}
        entries={entries}
        sectionParam={filter}
        isPromoted={visionFeatures.promotions.enabled}
        promotedEntries={promotedPosts ?? []}
        showEmptyPlaceholder={false}
      />

      {/* Show empty state ONLY for personalized feeds, never for global feeds */}
      {shouldShowEmpty && (
        <EntryListContentNoData username="" loading={false} section={filter} />
      )}

      {/* Infinite scroll trigger - only active after initial load */}
      <DetectBottom onBottom={handleLoadMore} paused={autoPagingPaused} />
      {isError && !isFetching && <EntryListLoadError onRetry={retry} />}

      {/* Loading indicator - single instance */}
      {showLoading && <EntryListContentLoading />}
    </>
  );
}
