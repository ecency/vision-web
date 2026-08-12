'use client';

import {
  getAccountPostsInfiniteQueryOptions,
  getPostsRankedInfiniteQueryOptions,
} from '@ecency/sdk';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useInstanceConfig } from './use-instance-config';

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

/**
 * The archive feed as one infinite query, flattened. Extracted from
 * BlogPostsList so a theme's own archive surface (the Reader rail) cannot
 * drift from the seam default's fetching: same queries, same enabled guards,
 * same paging.
 *
 * Community instances go through the SDK's ranked-posts query, not a local
 * bridge call: it is the path that applies DMCA post filtering and drops a
 * tag that is itself listed. A bespoke get_ranked_posts call here served
 * takedown-listed content.
 */
export function useArchiveFeed(filter = 'posts', limit = 20) {
  const { username, communityId, isCommunityMode } = useInstanceConfig();

  const communitySort = communityFilterMap[filter] || 'created';

  // Memoize select function to avoid creating new reference on each render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectPosts = useCallback(
    (data: { pages: any[][] }) => data.pages.flat(),
    []
  );

  // Get query options and preserve their built-in enabled guards
  const accountOptions = getAccountPostsInfiniteQueryOptions(username, filter, limit);
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

  return isCommunityMode ? communityQuery : blogQuery;
}
