"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAccountPostsQueryOptions,
  getPostsRankedQueryOptions,
  getSimilarEntriesQueryOptions
} from "@ecency/sdk";
import { Entry } from "@/entities";
import { withCardOnlyPageEntries } from "@/core/entries/slim-entry";
import {
  RELATED_FETCH_LIMIT,
  RelatedItems,
  RelatedTitles,
  authorItems,
  communityItems,
  selectFooterColumns,
  similarItems
} from "./entry-related-columns";
import { EntryRelatedFooterView } from "./entry-related-footer-view";
import { SimilarRow } from "./entry-related-item";
import { RelatedSource } from "./entry-related-source";

interface Props {
  author: string;
  permlink: string;
  source: RelatedSource | null;
  /** Translated on the server, so the first render matches the server HTML. */
  titles: RelatedTitles;
  /** Which feeds failed during the server render. */
  failed: { similar: boolean; author: boolean; community: boolean };
  /** The rows the server render did get; a failed feed's list is empty. */
  initial: RelatedItems;
  /** The post fields the similar query reads, sent only when it failed. */
  similarInput?: { title: string; body: string; tags: string[] };
}

// A page cached with a failed feed asks again from every reader's browser for
// as long as it stays cached: no refetch on focus, and one retry for the feeds
// from the API. The similar query keeps the SDK's own `retry: false`, which
// stops a degraded search backend being asked twice by every reader.
const REFILL_QUERY = { refetchOnWindowFocus: false } as const;
const FEED_RETRY = { retry: 1 } as const;

/**
 * The related footer when one of its feeds failed during the server render
 * (#1881). It streams after the page head, so the failure cannot keep the page
 * out of the cache, and the cached copy would lose that column for the whole
 * cache tier. The columns that loaded are rendered at once (and are in the
 * server HTML, so crawlers still get those links); a failed one is fetched
 * again in the browser.
 */
export function EntryRelatedFooterRefill({
  author,
  permlink,
  source,
  titles,
  failed,
  initial,
  similarInput
}: Props) {
  const similar = useQuery({
    ...getSimilarEntriesQueryOptions({
      author,
      permlink,
      title: similarInput?.title ?? "",
      body: similarInput?.body ?? "",
      json_metadata: { tags: similarInput?.tags ?? [] }
    } as never),
    ...REFILL_QUERY,
    enabled: failed.similar && !!similarInput
  });
  const authorPosts = useQuery({
    ...withCardOnlyPageEntries(getAccountPostsQueryOptions(author, "posts", "", "", RELATED_FETCH_LIMIT)),
    ...REFILL_QUERY,
    ...FEED_RETRY,
    enabled: failed.author
  });
  const communityPosts = useQuery({
    ...withCardOnlyPageEntries(
      getPostsRankedQueryOptions("created", "", "", RELATED_FETCH_LIMIT, source?.tag ?? "")
    ),
    ...REFILL_QUERY,
    ...FEED_RETRY,
    enabled: failed.community && !!source
  });

  const columns = useMemo(() => {
    const post = { author, permlink };
    return selectFooterColumns(post, titles, {
      similar: failed.similar ? similarItems((similar.data as SimilarRow[] | undefined) ?? []) : initial.similar,
      author: failed.author
        ? authorItems(post, (authorPosts.data as unknown as Entry[] | undefined) ?? [])
        : initial.author,
      community: failed.community
        ? communityItems(post, (communityPosts.data as unknown as Entry[] | undefined) ?? [])
        : initial.community
    });
  }, [author, permlink, titles, failed, initial, similar.data, authorPosts.data, communityPosts.data]);

  return <EntryRelatedFooterView columns={columns} />;
}
