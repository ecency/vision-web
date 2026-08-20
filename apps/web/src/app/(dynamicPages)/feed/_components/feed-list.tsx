"use client";

import React, { useMemo } from "react";
import { usePostsFeedQuery } from "@/api/queries";
import { Entry, SearchResponse } from "@/entities";
import type { InfiniteData } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { DetectBottom } from "@/features/shared/detect-bottom";
import { EntryListContent, EntryListContentLoading, EntryListContentNoData } from "@/features/shared/entry-list-content";
import { EcencyConfigManager } from "@/config";
import { useVisibleEntries } from "@/features/shared/entry-list-item/use-muted-authors";
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
  const { data, fetchNextPage, isLoading, isFetching, isFetchingNextPage, hasNextPage } =
    usePostsFeedQuery(filter, tag, observer);

  // Extract entries from all pages (no skipping - simpler and works with client-side navigation)
  const entries = useMemo(() => {
    const pages = (data as InfiniteData<Page, unknown> | undefined)?.pages ?? [];

    const extracted: Entry[] = pages.flatMap((page) =>
      Array.isArray(page) ? page : ((page as any).items ?? (page as any).results ?? [])
    );

    if (noReblog) {
      return extracted.filter(
        (entry: Entry) => !entry.reblogged_by || entry.reblogged_by.length === 0
      );
    }

    return extracted;
  }, [data, filter, tag, observer, noReblog]); // Include filter/tag/observer to ensure recalc on param changes

  // Everything the viewer can actually see: a feed whose every author they muted
  // has to reach the empty state below, not render as blank space.
  const visibleEntries = useVisibleEntries(entries);

  // Simple, clear loading and empty state logic. `!hasNextPage` keeps the
  // message off while pages the viewer might see are still to come: everything
  // loaded so far being muted is not an empty feed, and DetectBottom is already
  // fetching the next page.
  const isLoadingData = isLoading || (isFetching && visibleEntries.length === 0);
  const isEmpty = !isLoading && !isFetching && !hasNextPage && visibleEntries.length === 0;
  const showLoading = isLoadingData || isFetchingNextPage;

  // Check if this is a global feed (should never show empty state)
  // Global feed = trending/hot/created/payout/muted/promoted (always has content)
  // "feed" is also a valid filter (user's personalized feed) but may legitimately be empty
  const isGlobalFeed = ["trending", "hot", "created", "payout", "muted", "promoted"].includes(filter) && tag !== "my";

  // Only show empty state for personalized feeds, never for global feeds
  const shouldShowEmpty = isEmpty && !isGlobalFeed;

  // Only allow pagination after initial data is loaded
  const handleLoadMore = () => {
    // Don't fetch next page if:
    // 1. Still loading initial data
    // 2. Already fetching
    // 3. No entries loaded yet (prevents early pagination)
    if (isLoading || isFetching || entries.length === 0) {
      return;
    }
    fetchNextPage();
  };

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
      <DetectBottom onBottom={handleLoadMore} />

      {/* Loading indicator - single instance */}
      {showLoading && <EntryListContentLoading />}
    </>
  );
}
