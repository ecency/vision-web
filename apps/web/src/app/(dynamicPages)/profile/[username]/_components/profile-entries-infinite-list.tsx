"use client";

import {
  DetectBottom,
  EntryListContent,
  EntryListContentLoading,
  EntryListContentNoData
} from "@/features/shared";
import React, { useMemo } from "react";
import { usePostsFeedQuery } from "@/api/queries";
import { useVisibleEntries } from "@/features/shared/entry-list-item/use-muted-authors";
import { Entry, FullAccount } from "@/entities";

interface Props {
  account: FullAccount;
  section: string;
  /**
   * Authors of the server-rendered first page, not a count: whether those
   * entries are visible depends on the viewer's mute list, which only exists on
   * the client.
   */
  initialEntryAuthors: string[];
  initialPageEntriesCount: number;
  initialDataLoaded: boolean;
}

export function ProfileEntriesInfiniteList({
  section,
  account,
  initialEntryAuthors,
  initialPageEntriesCount,
  initialDataLoaded
}: Props) {
  // No observer argument on purpose, so this resolves to DEFAULT_OBSERVER and
  // matches the server-rendered first page. Personalising it here would only
  // reach pages 2+: the server fetched page 1 as DEFAULT_OBSERVER and
  // `dropFirstPage` below discards this query's own page 1, so the visitor's
  // mute list would apply to every page except the most visible one.
  // Personalising properly needs the SSR page replaced, which means adding this
  // tier to cache-policy's USER_SPECIFIC_TIERS_WHEN_LOGGED_IN (giving up the
  // shared edge-cache entry) or re-fetching page 1 on every logged-in view.
  const { fetchNextPage, data, isFetching, isLoading, hasNextPage, isFetchingNextPage } =
    usePostsFeedQuery(section, `@${account.name}`);

  const dropFirstPage = initialPageEntriesCount > 0;

  const entryList = useMemo(() => {
    const pages = (data?.pages ?? []) as Entry[][];
    const relevantPages = dropFirstPage ? pages.slice(1) : pages;
    return (
      relevantPages
        ?.reduce<Entry[]>((acc: Entry[], page: Entry[]) => [...acc, ...page], [])
        ?.filter((item: Entry) => item.permlink !== account.profile?.pinned) ?? []
    );
  }, [account.profile?.pinned, data?.pages, dropFirstPage]);

  // Count what the viewer can see, across the server-rendered page and ours: a
  // profile whose every post the viewer muted must show its empty state rather
  // than nothing at all.
  const initialVisible = useVisibleEntries(
    useMemo(() => initialEntryAuthors.map((author) => ({ author })), [initialEntryAuthors])
  );
  const visibleEntryList = useVisibleEntries(entryList);

  const totalEntriesCount = initialVisible.length + visibleEntryList.length;
  const hasClientData = (data?.pages?.length ?? 0) > 0;
  const isDataReady = initialDataLoaded || hasClientData;
  const isFetchingData = isFetching || isFetchingNextPage;
  const shouldShowEmptyState =
    isDataReady && !isFetchingData && totalEntriesCount === 0;

  const handleBottom = () => {
    if (!hasNextPage || isFetchingData) return;
    fetchNextPage();
  };

  return (
    <>
      <EntryListContent
        username={`@${account.name}`}
        loading={false}
        entries={entryList}
        sectionParam={section}
        isPromoted={false}
        showEmptyPlaceholder={false}
      />
      {shouldShowEmptyState && (
        <EntryListContentNoData
          username={`@${account.name}`}
          loading={false}
          section={section}
        />
      )}
      <DetectBottom onBottom={handleBottom} />
      {isFetchingData && <EntryListContentLoading />}
    </>
  );
}
