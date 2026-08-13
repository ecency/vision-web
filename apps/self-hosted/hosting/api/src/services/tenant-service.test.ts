import { describe, it, expect } from 'vitest';
import { TenantService } from './tenant-service';

// These exercise the pure config builders only (no DB / no RPC), which is where the
// owner (controlling account) is resolved and written into the stored config.

describe('TenantService.getDefaultConfig owner', () => {
  it('defaults owner to the showcased username when no owner is given', async () => {
    const config = await TenantService.getDefaultConfig('alice');
    expect(config.configuration.instanceConfiguration.owner).toBe('alice');
    expect(config.configuration.instanceConfiguration.username).toBe('alice');
  });

  it('uses the given owner and lowercases it', async () => {
    const config = await TenantService.getDefaultConfig('hive-125125', 'Alice');
    expect(config.configuration.instanceConfiguration.owner).toBe('alice');
    expect(config.configuration.instanceConfiguration.username).toBe('hive-125125');
  });
});

describe('TenantService.buildConfig owner + community', () => {
  it('keeps owner defaulted to username with no overrides', async () => {
    const config = await TenantService.buildConfig('bob');
    expect(config.configuration.instanceConfiguration.owner).toBe('bob');
    expect(config.configuration.instanceConfiguration.type).toBe('blog');
  });

  it('sets owner alongside a community override (owner decoupled from showcased account)', async () => {
    const config = await TenantService.buildConfig(
      'hive-125125',
      { type: 'community', communityId: 'hive-125125', title: 'My Community' },
      'alice'
    );
    const instance = config.configuration.instanceConfiguration;
    expect(instance.owner).toBe('alice');
    expect(instance.username).toBe('hive-125125');
    expect(instance.type).toBe('community');
    expect(instance.communityId).toBe('hive-125125');
    expect(instance.meta.title).toBe('My Community');
  });

  it('never lets a client override the server-resolved owner via configOverrides', async () => {
    const config = await TenantService.buildConfig(
      'bob',
      { owner: 'attacker' } as any,
      'bob'
    );
    expect(config.configuration.instanceConfiguration.owner).toBe('bob');
  });

  it('gives a community instance community post filters, not blog ones', async () => {
    const config = await TenantService.buildConfig(
      'hive-125125',
      { type: 'community', communityId: 'hive-125125', title: 'My Community' },
      'alice'
    );
    expect(config.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'trending',
      'hot',
      'created',
    ]);
  });

  it('keeps blog post filters for a personal blog', async () => {
    const config = await TenantService.buildConfig('bob', { title: 'My Blog' }, 'bob');
    expect(config.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'posts',
      'blog',
    ]);
  });
});

describe('TenantService.normalizeFlatOverrides', () => {
  it('lets an explicit empty string clear title and description', () => {
    const normalized = TenantService.normalizeFlatOverrides({ title: '', description: '' });
    expect(normalized.configuration.instanceConfiguration.meta.title).toBe('');
    expect(normalized.configuration.instanceConfiguration.meta.description).toBe('');
  });

  it('leaves title and description untouched when not provided', () => {
    const normalized = TenantService.normalizeFlatOverrides({ theme: 'dark' });
    expect('title' in normalized.configuration.instanceConfiguration.meta).toBe(false);
    expect('description' in normalized.configuration.instanceConfiguration.meta).toBe(false);
  });

  it('maps every flat key to its nested config path', () => {
    const normalized = TenantService.normalizeFlatOverrides({
      theme: 'dark',
      styleTemplate: 'minimal',
      title: 'T',
      description: 'D',
    });
    expect(normalized.configuration.general.theme).toBe('dark');
    expect(normalized.configuration.general.styleTemplate).toBe('minimal');
    expect(normalized.configuration.instanceConfiguration.meta.title).toBe('T');
    expect(normalized.configuration.instanceConfiguration.meta.description).toBe('D');
  });

  it('ignores the retired layout keys rather than writing them back', () => {
    // listType and sidebarPlacement were removed (#1471). A client that
    // still sends them must not be able to reintroduce a key nothing reads,
    // and must not fail either: they are dropped, not rejected.
    const normalized = TenantService.normalizeFlatOverrides({
      title: 'T',
      listType: 'grid',
      sidebarPlacement: 'left',
    });
    expect(normalized.configuration.instanceConfiguration.meta.title).toBe('T');
    expect('listType' in normalized.configuration.instanceConfiguration.layout).toBe(false);
    expect(
      'placement' in normalized.configuration.instanceConfiguration.layout.sidebar,
    ).toBe(false);
  });
});

describe('TenantService.sanitizeConfigDocument', () => {
  const pins = {
    version: 1,
    username: 'hive-125125',
    owner: 'alice',
    type: 'community',
    communityId: 'hive-125125',
  };

  it('pins identity fields no matter what the client sent', () => {
    const clean = TenantService.sanitizeConfigDocument(
      {
        version: 99,
        configuration: {
          general: { theme: 'dark' },
          instanceConfiguration: {
            username: 'attacker',
            owner: 'attacker',
            type: 'blog',
            communityId: '',
            meta: { title: 'New title' },
          },
        },
      },
      pins
    );
    expect(clean.version).toBe(1);
    expect(clean.configuration.instanceConfiguration.username).toBe('hive-125125');
    expect(clean.configuration.instanceConfiguration.owner).toBe('alice');
    expect(clean.configuration.instanceConfiguration.type).toBe('community');
    expect(clean.configuration.instanceConfiguration.communityId).toBe('hive-125125');
    expect(clean.configuration.instanceConfiguration.meta.title).toBe('New title');
    expect(clean.configuration.general.theme).toBe('dark');
  });

  it('rejects a document without a configuration object', () => {
    expect(() => TenantService.sanitizeConfigDocument({ version: 1 }, pins)).toThrow(
      'Invalid configuration document'
    );
  });

  it('rejects array-valued configuration containers', () => {
    // typeof [] === 'object', but serializing an array drops any pinned properties, so an
    // array must never be allowed to stand in for an identity-bearing object section.
    expect(() =>
      TenantService.sanitizeConfigDocument({ configuration: [] }, pins)
    ).toThrow('Invalid configuration document');
    expect(() =>
      TenantService.sanitizeConfigDocument(
        { configuration: { instanceConfiguration: [] } },
        pins
      )
    ).toThrow('Invalid configuration document');
  });

  it('strips the served-only managed marker from client documents', () => {
    const clean = TenantService.sanitizeConfigDocument(
      {
        configuration: {
          instanceConfiguration: { managed: true, meta: { title: 'T' } },
        },
      },
      pins
    );
    expect(clean.configuration.instanceConfiguration.managed).toBeUndefined();
    expect(clean.configuration.instanceConfiguration.meta.title).toBe('T');
  });

  it('drops prototype pollution vectors', () => {
    const clean = TenantService.sanitizeConfigDocument(
      JSON.parse('{"configuration":{"__proto__":{"polluted":true},"general":{}}}'),
      pins
    );
    expect(({} as any).polluted).toBeUndefined();
    expect(clean.configuration.general).toBeDefined();
  });

  it('nulled sections cannot erase stored configuration', async () => {
    // A document carrying nulls (hand-crafted API call or a buggy client) must not wipe the
    // sections it nulls: mergeConfig treats null as a replacement value, so sanitize strips it.
    const stored = await TenantService.buildConfig('bob', { title: 'Kept title' }, 'bob');
    const hostile = {
      configuration: {
        general: null,
        instanceConfiguration: { meta: { title: null, description: 'New desc' } },
      },
    };
    const clean = TenantService.sanitizeConfigDocument(hostile, {
      version: 1,
      username: 'bob',
      owner: 'bob',
      type: 'blog',
      communityId: '',
    });
    const merged = TenantService.mergeConfig(stored, clean);

    expect(merged.configuration.general.theme).toBe('system');
    expect(merged.configuration.general.imageProxy).toBe('https://i.ecency.com');
    expect(merged.configuration.instanceConfiguration.meta.title).toBe('Kept title');
    expect(merged.configuration.instanceConfiguration.meta.description).toBe('New desc');
  });

  it('strips null entries inside arrays', () => {
    const clean = TenantService.sanitizeConfigDocument(
      {
        configuration: {
          instanceConfiguration: { features: { postsFilters: ['trending', null, 'hot'] } },
        },
      },
      pins
    );
    expect(clean.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'trending',
      'hot',
    ]);
  });

  it('type-mismatched nested sections cannot replace stored objects or arrays', async () => {
    // Beyond the outer containers: a scalar or array standing in for any object-valued
    // section (general, meta, layout, features) must be dropped, and a scalar standing in
    // for an array (postsFilters) too. The stored config is the shape contract.
    const stored = await TenantService.buildConfig('bob', { title: 'Kept' }, 'bob');
    const hostile = TenantService.sanitizeConfigDocument(
      {
        configuration: {
          general: 'oops',
          instanceConfiguration: {
            meta: ['not', 'an', 'object'],
            features: { postsFilters: 'trending', likes: 'yes' },
            layout: 42,
          },
        },
      },
      {
        version: 1,
        username: 'bob',
        owner: 'bob',
        type: 'blog',
        communityId: '',
      }
    );
    const merged = TenantService.mergeConfigGuarded(stored, hostile);

    expect(merged.configuration.general.theme).toBe('system');
    expect(merged.configuration.instanceConfiguration.meta.title).toBe('Kept');
    expect(merged.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'posts',
      'blog',
    ]);
    expect(merged.configuration.instanceConfiguration.features.likes).toEqual({ enabled: true });
    // The point is that a scalar cannot replace a stored object. Asserted
    // through a key the layout still has, since listType was retired (#1471).
    expect(merged.configuration.instanceConfiguration.layout.search).toEqual({
      enabled: true,
    });
  });

  it('scalar replacements must match the stored primitive type', async () => {
    // "false" must not stand in for a boolean, 42 must not stand in for a string, and
    // array elements must match the stored element type.
    const stored = await TenantService.buildConfig('bob', undefined, 'bob');
    const hostile = TenantService.sanitizeConfigDocument(
      {
        configuration: {
          general: { theme: 42 },
          instanceConfiguration: {
            features: {
              likes: { enabled: 'false' },
              postsFilters: [1, 2],
            },
          },
        },
      },
      {
        version: 1,
        username: 'bob',
        owner: 'bob',
        type: 'blog',
        communityId: '',
      }
    );
    const merged = TenantService.mergeConfigGuarded(stored, hostile);

    expect(merged.configuration.general.theme).toBe('system');
    expect(merged.configuration.instanceConfiguration.features.likes.enabled).toBe(true);
    expect(merged.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'posts',
      'blog',
    ]);
  });

  it('well-shaped nested updates still apply through the guarded merge', async () => {
    const stored = await TenantService.buildConfig('bob', undefined, 'bob');
    const update = TenantService.sanitizeConfigDocument(
      {
        configuration: {
          general: { theme: 'dark' },
          instanceConfiguration: {
            features: { postsFilters: ['comments'], likes: { enabled: false } },
          },
        },
      },
      {
        version: 1,
        username: 'bob',
        owner: 'bob',
        type: 'blog',
        communityId: '',
      }
    );
    const merged = TenantService.mergeConfigGuarded(stored, update);

    expect(merged.configuration.general.theme).toBe('dark');
    expect(merged.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'comments',
    ]);
    expect(merged.configuration.instanceConfiguration.features.likes.enabled).toBe(false);
    expect(merged.configuration.general.imageProxy).toBe('https://i.ecency.com');
  });

  it('merged into the stored config, a partial document cannot erase other sections', async () => {
    // Mirrors applyConfigDocument: sanitize the client document, then deep-merge it into the
    // stored config. A document carrying only one section must leave the rest intact.
    const stored = await TenantService.buildConfig('bob', { title: 'Kept title' }, 'bob');
    const partial = { configuration: { general: { theme: 'dark' } } };
    const clean = TenantService.sanitizeConfigDocument(partial, {
      version: 1,
      username: 'bob',
      owner: 'bob',
      type: 'blog',
      communityId: '',
    });
    const merged = TenantService.mergeConfig(stored, clean);

    expect(merged.configuration.general.theme).toBe('dark');
    expect(merged.configuration.instanceConfiguration.meta.title).toBe('Kept title');
    expect(merged.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'posts',
      'blog',
    ]);
    expect(merged.configuration.general.imageProxy).toBe('https://i.ecency.com');
  });
});
