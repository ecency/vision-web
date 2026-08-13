import {
  applyConfigDom,
  type InstanceConfig,
  InstanceConfigManager,
} from '@/core';

/**
 * Live preview of an UNCLAIMED subdomain: instead of the static claim CTA, the
 * real app boots against a config synthesized for the host's name, so the
 * visitor sees their own Hive content as a blog before committing to anything.
 *
 * Entirely in-memory and per-tab: nothing is provisioned, nothing persisted,
 * and a plain reload without the `preview` param lands back on the CTA. The
 * config disables auth outright, so every broadcast affordance (login, likes,
 * comments, tipping, composer) stays hidden: a preview is a brochure, not an
 * instance. The `claimPreview` marker is what renders the persistent claim
 * banner, which also re-establishes the robots noindex the claim landing
 * removes on unmount.
 */

/** Query param that boots an unclaimed host straight into preview. */
export const CLAIM_PREVIEW_PARAM = 'preview';

export function isClaimPreviewRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).get(CLAIM_PREVIEW_PARAM) === '1';
  } catch {
    return false;
  }
}

export function buildClaimPreviewConfig(
  name: string,
  isCommunity: boolean,
): InstanceConfig {
  return {
    version: 1,
    configuration: {
      general: {
        theme: 'system',
        language: 'en',
        styles: {},
      },
      instanceConfiguration: {
        type: isCommunity ? 'community' : 'blog',
        username: name,
        communityId: isCommunity ? name : '',
        // Never persisted anywhere; read by the app to render the claim banner.
        claimPreview: true,
        meta: {
          title: name,
          description: '',
          logo: '',
          favicon: '',
          keywords: '',
        },
        layout: {
          search: { enabled: true },
          sidebar: {
            followers: { enabled: true },
            following: { enabled: true },
            hiveInformation: { enabled: true },
          },
        },
        features: {
          postsFilters: isCommunity
            ? ['trending', 'hot', 'created']
            : ['posts', 'blog'],
          likes: { enabled: true },
          comments: { enabled: true },
          post: { text2Speech: { enabled: false } },
          auth: { enabled: false, methods: [] },
        },
      },
    },
  } as unknown as InstanceConfig;
}

/**
 * Swap the running config for the preview one. The `template` flag is absent
 * from the synthesized config, so the root component's gate flips reactively
 * and the real route tree renders.
 */
export function enterClaimPreview(name: string, isCommunity: boolean): void {
  const config = buildClaimPreviewConfig(name, isCommunity);
  InstanceConfigManager.updateConfig(config);
  applyConfigDom(config, { syncSystemTheme: true });
}

export function isClaimPreviewActive(config: InstanceConfig): boolean {
  return (
    (config.configuration.instanceConfiguration as { claimPreview?: boolean })
      .claimPreview === true
  );
}
