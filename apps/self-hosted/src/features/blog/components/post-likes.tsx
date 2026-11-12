'use client';

import { type Entry, getPostQueryOptions, QueryKeys } from '@ecency/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { VoteButton } from '@/features/auth';

/**
 * The like button and count of a post. The vote goes to the post itself, or
 * to the original for a cross-post, and the count is read from THAT post's
 * entry cache key: the one the SDK's vote cache update moves, exactly once
 * per vote.
 *
 * A cross-post carries a copy of its original. That copy seeds the original's
 * key with the time the cross-post was fetched, and replaces a cached
 * original only when it is newer, so the newer of the two is shown. This read
 * itself never refetches (staleTime is infinite): the page's own reads and
 * the SDK's post-vote refresh keep the key current.
 */
export function PostLikes({ entry }: { entry: Entry }) {
  const queryClient = useQueryClient();
  const target = entry.original_entry || entry;
  const isCrossPost = !!entry.original_entry;
  const copyUpdatedAt = isCrossPost
    ? queryClient.getQueryState(QueryKeys.posts.entry(`/@${entry.author}/${entry.permlink}`))?.dataUpdatedAt
    : undefined;
  const options = getPostQueryOptions(target.author, target.permlink);

  useEffect(() => {
    if (!isCrossPost || !copyUpdatedAt) return;
    const cached = queryClient.getQueryState(options.queryKey)?.dataUpdatedAt ?? 0;
    if (cached < copyUpdatedAt) {
      queryClient.setQueryData(options.queryKey, target, { updatedAt: copyUpdatedAt });
    }
  }, [isCrossPost, copyUpdatedAt, target, queryClient, options.queryKey]);

  const { data } = useQuery({
    ...options,
    initialData: target,
    initialDataUpdatedAt: copyUpdatedAt,
    staleTime: Infinity,
  });
  const count = (data ?? target).stats?.total_votes ?? 0;
  return <VoteButton author={target.author} permlink={target.permlink} totalVotes={count} />;
}
