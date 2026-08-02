import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The build-time config.json is generated at image build and gitignored, so it
 * does not exist in CI. It is also the thing under test here: the published
 * image falls back to config.template.json, a DEMO document, so this stub uses
 * the same shape to prove none of it can leak into a tenant's config.
 */
vi.mock('../../config.json', () => ({
  default: {
    version: 1,
    configuration: {
      general: { theme: 'light', styles: { background: 'bg-demo' } },
      instanceConfiguration: {
        type: 'blog',
        username: 'ecency',
        meta: { title: 'Demo', logo: 'https://myblog.com/logo.png' },
        layout: { sidebar: { placement: 'right' } },
        features: { postsFilters: ['posts'] },
      },
    },
  },
}));

const { InstanceConfigManager } = await import('./configuration-loader');

function serve(configuration: unknown) {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ version: 2, configuration }),
  })) as unknown as typeof fetch;
}

describe('runtime config merging (wiring)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
    // loadRuntimeConfig only fetches in a browser; this suite runs in node.
    vi.stubGlobal('window', {});
  });

  it('restores omitted sections without inheriting the fallback document', async () => {
    serve({
      general: { theme: 'dark' },
      instanceConfiguration: { type: 'community', communityId: 'hive-125125' },
    });

    await InstanceConfigManager.initialize();
    const { configuration } = InstanceConfigManager.getConfig();

    // Structure the consumers dereference is present...
    expect(configuration.general.styles).toBeDefined();
    expect(configuration.instanceConfiguration.meta).toBeDefined();
    expect(configuration.instanceConfiguration.layout).toBeDefined();
    expect(configuration.instanceConfiguration.layout.sidebar).toBeDefined();

    // ...and none of the fallback document's CONTENT came with it. A leaked
    // username resolves the ownership gate (owner || username) to the wrong
    // account; a leaked logo makes the blog hotlink a domain it does not own.
    expect(configuration.instanceConfiguration.username).toBeUndefined();
    expect(configuration.instanceConfiguration.meta.logo).toBeUndefined();
    expect(configuration.general.styles.background).toBeUndefined();
    expect(configuration.general.theme).toBe('dark');
  });
});
