import { callRPC } from '@ecency/sdk';
import { queryOptions } from '@tanstack/react-query';
import type { Community } from './types';

export type { Community };

/**
 * Get community details
 */
export function getCommunityQueryOptions(communityId: string) {
  return queryOptions({
    queryKey: ['community', communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const result = await callRPC('bridge.get_community', {
        name: communityId,
        observer: '',
      });
      return result as Community | null;
    },
  });
}

/*
 * The community feed used to be a bespoke bridge.get_ranked_posts call here. It
 * bypassed the SDK's DMCA post filtering and tag sanitisation entirely, so
 * takedown-listed content was served. Use getPostsRankedInfiniteQueryOptions
 * from @ecency/sdk instead; see blog-posts-list.
 */

/**
 * Get community subscribers count
 */
export function getCommunitySubscribersQueryOptions(communityId: string) {
  return queryOptions({
    queryKey: ['community-subscribers', communityId],
    enabled: !!communityId,
    queryFn: async () => {
      const result = await callRPC('bridge.list_subscribers', {
        community: communityId,
      });
      return (result as Array<unknown>)?.length || 0;
    },
  });
}
