'use client';

import {
  getAccountPostsInfiniteQueryOptions,
  getPostsRankedInfiniteQueryOptions,
} from '@ecency/sdk';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { t } from '@/core';
import { BlogPostItem } from './blog-post-item';
import { DetectBottom } from './detect-bottom';
import { useInstanceConfig } from '../hooks/use-instance-config';
import { ErrorMessage } from '@/features/shared/error-message';

interface Props {
  filter?: string;
  limit?: number;
}

// Map blog filters to community sort options
const communityFilterMap: Record<string, string> = {
  posts: 'created',
  blog: 'created',
  trending: 'trending',
  hot: 'hot',
  new: 'created',
  payout: 'payout',
  muted: 'muted',
};

export function BlogPostsList({ filter = 'posts', limit = 20 }: Props) {
  const { username, communityId, isCommunityMode } = useInstanceConfig();

  // Use different query based on instance type
  const communitySort = communityFilterMap[filter] || 'created';

  // Memoize select function to avoid creating new reference on each render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectPosts = useCallback(
    (data: { pages: any[][] }) => data.pages.flat(),
    []
  );

  // Get query options and preserve their built-in enabled guards
  const accountOptions = getAccountPostsInfiniteQueryOptions(username, filter, limit);
  // The SDK's ranked-posts query, not a local bridge call: it is the path that
  // applies DMCA post filtering and drops a tag that is itself listed. A
  // bespoke get_ranked_posts call here served takedown-listed content.
  const communityOptions = getPostsRankedInfiniteQueryOptions(
    communitySort,
    communityId,
    limit,
    '',
    !!communityId && isCommunityMode,
  );

  const blogQuery = useInfiniteQuery({
    ...accountOptions,
    select: selectPosts,
    enabled: accountOptions.enabled && !isCommunityMode,
  });

  const communityQuery = useInfiniteQuery({
    ...communityOptions,
    select: selectPosts,
  });

  const { data = [], fetchNextPage, isFetching, hasNextPage, isError, refetch } = isCommunityMode
    ? communityQuery
    : blogQuery;

  const previousLengthRef = useRef(0);

  useEffect(() => {
    // If data length decreased (e.g., filter changed), reset the ref
    if (data.length < previousLengthRef.current) {
      previousLengthRef.current = 0;
    } else {
      previousLengthRef.current = data.length;
    }
  }, [data.length]);

  if (isError) {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  return (
    <div className="blog-posts-list">
      {data.length === 0 && !isFetching && (
        <div className="text-center py-12 text-theme-muted">{t('noPosts')}</div>
      )}

      {data.map((post, index) => {
        const isNewItem = index >= previousLengthRef.current;
        const batchIndex = isNewItem ? index - previousLengthRef.current : 0;
        return (
          <BlogPostItem
            key={`${post.author}/${post.permlink}`}
            entry={post}
            index={batchIndex}
          />
        );
      })}

      {hasNextPage && <DetectBottom onBottom={() => fetchNextPage()} />}

      {isFetching && (
        <div className="text-center py-8 text-theme-muted">
          {t('loadingMore')}
        </div>
      )}
    </div>
  );
}
