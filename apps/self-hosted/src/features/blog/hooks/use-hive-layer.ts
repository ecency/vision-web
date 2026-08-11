import { isCommunityInstance } from '@/core/instance-mode';
import { useMemo } from 'react';
import type { ResolvedHiveLayer } from '@/core';
import { InstanceConfigManager, resolveHiveLayer } from '@/core';
import { resolveCreatePostTarget } from '@/features/auth/utils/create-post-target';

/**
 * The resolved Hive layer for this instance.
 *
 * A reactive read: the Configuration Editor's preview serves a draft config
 * through the store, so this hook must recompute when the store notifies, or
 * a page opened mid-preview would keep rendering drafted payout labels and
 * composer targets after preview ends. The memo is keyed on the config object
 * the store served, which changes identity exactly when a notify fires.
 */
export function useHiveLayer(): ResolvedHiveLayer {
  const config = InstanceConfigManager.useFullConfig();
  return useMemo(() => {
    const { configuration } = config;
    const instance = configuration.instanceConfiguration;

    // One definition, in core/instance-mode. This used to be the same
    // expression written out again, kept in step with use-instance-config by a
    // comment; a third copy was about to be written for the config editor.
    const isCommunityMode = isCommunityInstance(instance);

    const composer = resolveCreatePostTarget({
      createPostUrl: configuration.general?.createPostUrl,
      isCommunityMode,
    });

    return resolveHiveLayer({
      features: instance?.features,
      composerIsInternal: composer.kind === 'internal',
    });
  }, [config]);
}
