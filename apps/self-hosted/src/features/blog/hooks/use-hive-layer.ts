import { useMemo } from 'react';
import type { ResolvedHiveLayer } from '@/core';
import { InstanceConfigManager, resolveHiveLayer } from '@/core';
import { resolveCreatePostTarget } from '@/features/auth/utils/create-post-target';

/**
 * The resolved Hive layer for this instance.
 *
 * A non-reactive `getConfig()` read behind a `useMemo`, in exactly the shape
 * `use-tipping-config.ts` already uses. Config is loaded once before the app
 * renders and the editor's preview channel is DOM attributes, which cannot
 * express a React render decision anyway. Introducing a second, reactive read
 * idiom for one corner of the app is how the panel and the site end up
 * disagreeing; saving and reloading is how every other field behaves today.
 */
export function useHiveLayer(): ResolvedHiveLayer {
  return useMemo(() => {
    const { configuration } = InstanceConfigManager.getConfig();
    const instance = configuration.instanceConfiguration;

    // Same expression as use-instance-config, deliberately: a second definition
    // of "is a community" would disagree with the sidebar on an instance typed
    // community with no communityId.
    const isCommunityMode =
      instance?.type === 'community' && !!instance?.communityId;

    const composer = resolveCreatePostTarget({
      createPostUrl: configuration.general?.createPostUrl,
      isCommunityMode,
    });

    return resolveHiveLayer({
      features: instance?.features,
      isCommunityMode,
      composerIsInternal: composer.kind === 'internal',
    });
  }, []);
}
