import { isCommunityInstance } from '@/core/instance-mode';
import { useQuery } from '@tanstack/react-query';
import { InstanceConfigManager } from '@/core';
import { getCommunityQueryOptions } from '../queries/community-queries';

export type InstanceType = 'blog' | 'community';

export function useInstanceConfig() {
  const type = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      (configuration.instanceConfiguration.type as InstanceType) || 'blog'
  );

  const username = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.username
  );

  const communityId = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      (configuration.instanceConfiguration.communityId as string) || ''
  );

  const isCommunityMode = isCommunityInstance({ type, communityId });
  const isBlogMode = type === 'blog';

  return {
    type,
    username,
    communityId,
    isCommunityMode,
    isBlogMode,
    // For data fetching, use communityId in community mode, username in blog mode
    identifier: isCommunityMode ? communityId : username,
  };
}

export function useCommunityData() {
  const { communityId, isCommunityMode } = useInstanceConfig();

  return useQuery({
    ...getCommunityQueryOptions(communityId),
    enabled: isCommunityMode && !!communityId,
  });
}
