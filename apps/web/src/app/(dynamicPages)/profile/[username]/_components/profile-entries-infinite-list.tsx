"use client";

import {
  DetectBottom,
  EntryListContent,
  EntryListContentLoading,
  EntryListContentNoData
} from "@/features/shared";
import React, { useMemo } from "react";
import { usePostsFeedQuery } from "@/api/queries";
import { Entry, FullAccount } from "@/entities";
import { useObserver } from "@/core/hooks/use-observer";

interface Props {
  account: FullAccount;
  section: string;
  initialEntriesCount: number;
  initialPageEntriesCount: number;
  initialDataLoaded: boolean;
}

export function ProfileEntriesInfiniteList({
  section,
  account,
  initialEntriesCount,
  initialPageEntriesCount,
  initialDataLoaded
}: Props) {
  const observer = useObserver();
  const { fetchNextPage, data, isFetching, isLoading, hasNextPage, isFetchingNextPage } =
    usePostsFeedQuery(section, `@${account.name}`, observer);

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

  const totalEntriesCount = initialEntriesCount + entryList.length;
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
