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
import { RelatedFeeds, RELATED_FETCH_LIMIT, buildRelatedColumns } from "./entry-related-columns";
import { EntryRelatedFooterView } from "./entry-related-footer-view";
import { SimilarRow } from "./entry-related-item";
import { RelatedSource } from "./entry-related-source";

interface Props {
  author: string;
  permlink: string;
  source: RelatedSource | null;
  /** Which feeds failed during the server render. */
  failed: { similar: boolean; author: boolean; community: boolean };
  /** What the server render did get; a failed feed's entry is empty. */
  initial: RelatedFeeds;
  /** The post fields the similar query reads, sent only when it failed. */
  similarInput?: { title: string; body: string; tags: string[] };
}

/**
 * The related footer when one of its feeds failed during the server render
 * (#1881). It streams after the page head, so the failure cannot keep the page
 * out of the cache, and the cached copy would lose that column for the whole
 * cache tier. The columns that loaded are rendered at once (and are in the
 * server HTML, so crawlers still get those links); a failed one is fetched
 * again in the browser.
 */
export function EntryRelatedFooterRefill({ author, permlink, source, failed, initial, similarInput }: Props) {
  const similar = useQuery({
    ...getSimilarEntriesQueryOptions({
      author,
      permlink,
      title: similarInput?.title ?? "",
      body: similarInput?.body ?? "",
      json_metadata: { tags: similarInput?.tags ?? [] }
    } as never),
    enabled: failed.similar && !!similarInput
  });
  const authorPosts = useQuery({
    ...withCardOnlyPageEntries(getAccountPostsQueryOptions(author, "posts", "", "", RELATED_FETCH_LIMIT)),
    enabled: failed.author
  });
  const communityPosts = useQuery({
    ...withCardOnlyPageEntries(
      getPostsRankedQueryOptions("created", "", "", RELATED_FETCH_LIMIT, source?.tag ?? "")
    ),
    enabled: failed.community && !!source
  });

  const columns = useMemo(
    () =>
      buildRelatedColumns({ author, permlink }, source, {
        similar: failed.similar ? ((similar.data as SimilarRow[] | undefined) ?? []) : initial.similar,
        authorPosts: failed.author
          ? ((authorPosts.data as unknown as Entry[] | undefined) ?? [])
          : initial.authorPosts,
        communityPosts: failed.community
          ? ((communityPosts.data as unknown as Entry[] | undefined) ?? [])
          : initial.communityPosts
      }),
    [author, permlink, source, failed, initial, similar.data, authorPosts.data, communityPosts.data]
  );

  return <EntryRelatedFooterView columns={columns} />;
}
