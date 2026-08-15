"use client";

import {
    DetectBottom,
    EntryListContent,
    EntryListContentLoading,
    EntryListContentNoData
} from "@/features/shared";
import React, { useMemo } from "react";
import { useBottomPagination } from "@/core/hooks";
import { usePostsFeedQuery } from "@/api/queries";
import { useVisibleEntries } from "@/features/shared/entry-list-item/use-muted-authors";
import { Community, Entry, SearchResponse } from "@/entities";
import type { InfiniteData } from "@tanstack/react-query";

interface Props {
    community: Community;
    section: string;
    /**
     * Authors of the server-rendered slice above, not a count: whether those are
     * visible depends on the viewer's mute list, which only exists on the client.
     * This component owns the empty state for the pair.
     */
    initialEntryAuthors: string[];
}

type FeedPage = Entry[] | SearchResponse;

export function CommunityContentInfiniteList({ section, community, initialEntryAuthors }: Props) {
    // No observer argument on purpose, so this resolves to DEFAULT_OBSERVER and
    // matches the server-rendered first page, which `entryList` drops below.
    // See profile-entries-infinite-list for why personalising only pages 2+ is
    // worse than not personalising at all.
    // ⚠️ Don't destructure the cast; assign first, then read props.
    const result = usePostsFeedQuery(section, community.name);

    const fetchNextPage = result.fetchNextPage;
    const isFetching = result.isFetching;
    const hasNextPage = result.hasNextPage;
    const dataUpdatedAt = result.dataUpdatedAt;

    // Make 'data' explicit: it's InfiniteData<FeedPage, unknown> | undefined
    const data = result.data as InfiniteData<FeedPage, unknown> | undefined;

    const pageToEntries = (p: FeedPage): Entry[] =>
        Array.isArray(p) ? p : ((p as any).items ?? (p as any).results ?? []);

    // This component re-renders when a fetch starts (it reads isFetching),
    // which re-runs DetectBottom's effect while the sentinel is still in
    // viewport — see useBottomPagination for why the naive inline handler
    // aborts its own fetch.
    const onBottom = useBottomPagination({
        data,
        dataUpdatedAt,
        hasNextPage,
        isFetching,
        fetchNextPage
    });

    const entryList = useMemo(
        () =>
            // Drop the first page (already rendered on the server)
            (data?.pages?.slice(1)?.flatMap(pageToEntries) ?? []),
        [data?.pages]
    );

    // Count what the viewer can see across the server-rendered slice and ours, so
    // a community whose every loaded author they muted says so instead of
    // rendering as blank space. The server slice may already include pages this
    // one also holds, but double counting can only overstate a non-zero total,
    // never fake a zero.
    const initialVisible = useVisibleEntries(
        useMemo(() => initialEntryAuthors.map((author) => ({ author })), [initialEntryAuthors])
    );
    const visibleEntryList = useVisibleEntries(entryList);
    const hasClientData = (data?.pages?.length ?? 0) > 0;
    // `!hasNextPage` keeps the message off while pages the viewer might see are
    // still to come: everything loaded so far being muted is not an empty
    // community, and the sentinel below is already fetching the next page.
    const shouldShowEmptyState =
        hasClientData &&
        !isFetching &&
        !hasNextPage &&
        initialVisible.length + visibleEntryList.length === 0;

    return (
        <>
            <EntryListContent
                username={community.name}
                loading={false}
                entries={entryList}
                sectionParam={section}
                isPromoted={false}
                showEmptyPlaceholder={false}
            />
            {shouldShowEmptyState && (
                <EntryListContentNoData username={community.name} loading={false} section={section} />
            )}
            <DetectBottom onBottom={onBottom} />
            {isFetching && <EntryListContentLoading />}
        </>
    );
}
