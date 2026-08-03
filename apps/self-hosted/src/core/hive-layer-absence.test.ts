import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveHiveLayer } from './hive-layer';

/**
 * The Hive layer is inert on every config already on disk.
 *
 * Not the resolver in isolation: this runs a served document through the real
 * `mergeConfig` over `CONFIG_SKELETON` and reads the result the way the app
 * does, so the property survives a change to the merge or the skeleton as well
 * as to the resolver.
 *
 * Lives in its own file rather than as a second case in
 * `config-merge-wiring.test.ts`: `configStore.initialize()` is idempotent and
 * neither it nor `InstanceConfigManager` has a reset, so a second `it()` in one
 * module silently asserts against the first one's config.
 */

vi.mock('../../config.json', () => ({
  default: {
    version: 1,
    configuration: {
      general: { theme: 'light', styles: {} },
      instanceConfiguration: {
        type: 'blog',
        username: 'ecency',
        meta: {},
        layout: { sidebar: {} },
        features: {},
      },
    },
  },
}));

async function serveAndResolve(configuration: unknown) {
  // A fresh module graph per case, so the singleton config store is new and
  // `initialize()` is genuinely reached rather than short-circuiting.
  vi.resetModules();
  vi.stubGlobal('window', {});
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ version: 2, configuration }),
  })) as unknown as typeof fetch;

  const { InstanceConfigManager } = await import('./configuration-loader');
  await InstanceConfigManager.initialize();
  const config = InstanceConfigManager.getConfig();
  const instance = config.configuration.instanceConfiguration;

  return {
    features: instance.features,
    layer: resolveHiveLayer({
      features: instance.features,
      isCommunityMode: instance.type === 'community' && !!instance.communityId,
      composerIsInternal: true,
    }),
  };
}

const OFF_POSTURE = {
  showPayoutOnPost: false,
  showPayoutInFeed: false,
  showChainNote: false,
  showChainPermalink: false,
  showVoteWeightPicker: false,
  allowDownvotes: false,
};

function posture(layer: ReturnType<typeof resolveHiveLayer>) {
  return {
    showPayoutOnPost: layer.showPayoutOnPost,
    showPayoutInFeed: layer.showPayoutInFeed,
    showChainNote: layer.showChainNote,
    showChainPermalink: layer.showChainPermalink,
    showVoteWeightPicker: layer.showVoteWeightPicker,
    allowDownvotes: layer.allowDownvotes,
  };
}

describe('the Hive layer through the real config merge', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('is off, and adds no key, on a config that predates it', async () => {
    // Every instance currently on disk is in this state.
    const { features, layer } = await serveAndResolve({
      general: { theme: 'dark' },
      instanceConfiguration: {
        type: 'blog',
        username: 'someone',
        features: { likes: { enabled: true }, comments: { enabled: true } },
      },
    });

    expect(posture(layer)).toEqual(OFF_POSTURE);
    expect(layer.authorRewards).toBe('off');
    expect(layer.payoutLabel).toBeNull();
    expect(layer.learnMoreUrl).toBeNull();
    // Nothing is added to CONFIG_SKELETON: a value placed there would silently
    // become the consumer's default instead of the resolver's.
    expect(features.hive).toBeUndefined();
  });

  it('is off, and does not throw, when the stored block is a scalar', async () => {
    // Storable today: the hosting API's merge takes an incoming value verbatim
    // when nothing is stored at that key, so a hand-crafted PATCH can put a
    // bare string here and it reaches the client unvalidated.
    const { layer } = await serveAndResolve({
      general: {},
      instanceConfiguration: {
        type: 'blog',
        username: 'someone',
        features: { hive: 'full' },
      },
    });
    expect(posture(layer)).toEqual(OFF_POSTURE);
  });

  it('turns on when the served document says so', async () => {
    // The other half of the property: absence is inert because it is absent,
    // not because the wiring is dead.
    const { layer } = await serveAndResolve({
      general: {},
      instanceConfiguration: {
        type: 'blog',
        username: 'someone',
        features: { hive: { readerLayer: 'standard' } },
      },
    });
    expect(layer.showPayoutOnPost).toBe(true);
    expect(layer.showChainPermalink).toBe(true);
    expect(layer.showPayoutInFeed).toBe(false);
  });
});
