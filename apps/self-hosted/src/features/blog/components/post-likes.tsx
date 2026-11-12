'use client';

import { type Entry, getPostQueryOptions } from '@ecency/sdk';
import { useQuery } from '@tanstack/react-query';
import { VoteButton } from '@/features/auth';

/**
 * The like button and count of a post. The vote goes to the post itself, or
 * to the original for a cross-post, and the count is read from THAT post's
 * entry cache key: the one the SDK's vote cache update moves, exactly once
 * per vote. A cross-post's original is seeded into its own key from the copy
 * the cross-post carries (no request: staleTime is infinite for this read).
 */
export function PostLikes({ entry }: { entry: Entry }) {
  const target = entry.original_entry || entry;
  const { data } = useQuery({
    ...getPostQueryOptions(target.author, target.permlink),
    initialData: target,
    staleTime: Infinity,
  });
  const count = (data ?? target).stats?.total_votes ?? 0;
  return <VoteButton author={target.author} permlink={target.permlink} totalVotes={count} />;
}
