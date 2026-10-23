"use client";

import {
  DetectBottom,
  EntryListContent,
  EntryListContentLoading,
  EntryListContentNoData,
  MessageNoData
} from "@/features/shared";
import React, { useMemo } from "react";
import { usePostsFeedQuery } from "@/api/queries";
import { useBottomPagination } from "@/core/hooks";
import { EntryListLoadError } from "@/features/shared/entry-list-content/entry-list-load-error";
import {
  useMutedAuthors,
  useVisibleEntries
} from "@/features/shared/entry-list-item/use-muted-authors";
import { useAutoPagingPaused } from "@/features/shared/entry-list-item/use-auto-paging-paused";
import { isAuthorMuted } from "@ecency/sdk";
import i18next from "i18next";
import { Entry, FullAccount } from "@/entities";
// Direct module import, not the `_helpers` barrel: that barrel also re-exports
// generate-profile-metadata, which is server-only.
import { isPinnedDuplicate } from "@/app/(dynamicPages)/profile/[username]/_helpers/pinned-permlink";

/**
 * Sections made only of the profile owner's own posts. Not replies (written by
 * other people) and not blog, whose reblogs of other authors stay visible; a
 * blog that shows nothing is left to useAutoPagingPaused.
 */
const OWNER_AUTHORED_SECTIONS = ["posts", "comments"];

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
  /**
   * Identity keys ("author/permlink") of the post the server's pinned card is
   * showing, computed there because only the server holds the pinned entry.
   * Empty when no pinned card was rendered, and then nothing is filtered: the
   * pinned post keeps its normal feed position instead of disappearing.
   */
  pinnedKeys: string[];
  initialDataLoaded: boolean;
}

export function ProfileEntriesInfiniteList({
  section,
  account,
  initialEntryAuthors,
  initialPageEntriesCount,
  pinnedKeys,
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
  const { fetchNextPage, refetch, data, dataUpdatedAt, isError, isFetching, hasNextPage, isFetchingNextPage } =
    usePostsFeedQuery(section, `@${account.name}`);

  // A viewer who muted the owner can see none of these entries, so the sentinel
  // never leaves the viewport and would page through the owner's entire history
  // (tens of thousands of posts for an active account). Say so and stop paging.
  const mutedAuthors = useMutedAuthors();
  const ownerMuted =
    OWNER_AUTHORED_SECTIONS.includes(section) && isAuthorMuted(account.name, mutedAuthors);

  const dropFirstPage = initialPageEntriesCount > 0;

  // The client pages as the list renders them, pinned duplicates dropped, so
  // the pause below counts exactly what the viewer could have seen.
  const relevantPages = useMemo(() => {
    const pages = (data?.pages ?? []) as Entry[][];
    return (dropFirstPage ? pages.slice(1) : pages).map((page) =>
      // Same comparison the server used on page 1: a raw
      // `permlink !== profile.pinned` misses the cross-post wrapper, whose
      // card renders the pinned post itself (#1807), and it read the
      // unvalidated metadata string rather than the entry that was shown.
      page.filter((item: Entry) => !isPinnedDuplicate(item, pinnedKeys))
    );
  }, [data?.pages, dropFirstPage, pinnedKeys]);
  const autoPagingPaused = useAutoPagingPaused(relevantPages);

  const entryList = useMemo(() => relevantPages.flat(), [relevantPages]);

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
  // `!hasNextPage` keeps the message off while pages the viewer might see are
  // still to come: everything loaded so far being muted is not an empty profile,
  // and the sentinel below is already fetching the next page.
  const shouldShowEmptyState =
    isDataReady && !isFetchingData && !isError && !hasNextPage && totalEntriesCount === 0;

  // Not an inline handler: that is a new function every render, so a FAILED
  // fetch re-ran the sentinel and retried at once, in a loop for as long as the
  // API was down. See useBottomPagination. With the owner muted, the list
  // below is not rendered at all.
  const handleBottom = useBottomPagination({
    data,
    dataUpdatedAt,
    hasNextPage,
    isFetching: isFetchingData,
    fetchNextPage
  });

  // The pagination callback only fetches a next page (or a missing first one);
  // a failed refetch of a list that is already complete needs a plain refetch.
  const retry = hasNextPage || !data?.pages?.length ? handleBottom : () => refetch();

  if (ownerMuted) {
    return (
      <MessageNoData
        title={i18next.t("profile.muted-owner-title", { n: account.name })}
        description={i18next.t("profile.muted-owner-description")}
        buttonText=""
        buttonTo=""
      />
    );
  }

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
      <DetectBottom onBottom={handleBottom} paused={autoPagingPaused} />
      {isError && !isFetchingData && (
        <EntryListLoadError onRetry={retry} nothingShown={totalEntriesCount === 0} />
      )}
      {isFetchingData && <EntryListContentLoading />}
    </>
  );
}
