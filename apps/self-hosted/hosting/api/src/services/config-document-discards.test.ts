import { describe, expect, it } from 'vitest';
import { TenantService, type DiscardedField } from './tenant-service';

// Pure config-document handling: no DB, no RPC.

const BLOG_PINS = {
  version: 1,
  username: 'alice',
  owner: 'alice',
  type: 'blog',
  communityId: '',
};

const COMMUNITY_PINS = {
  version: 1,
  username: 'hive-125125',
  owner: 'alice',
  type: 'community',
  communityId: 'hive-125125',
};

function paths(discarded: DiscardedField[]): string[] {
  return discarded.map((d) => d.path);
}

/**
 * Switching the Instance Type in the editor rewrites postsFilters to the other type's list and
 * sends both. The server pins the type back, so storing the filters left a personal blog asking
 * bridge.get_account_posts to sort by 'trending': every feed tab on the instance errors.
 */
describe('post filters are normalised against the pinned instance type', () => {
  it('drops community filters from a blog instance and keeps the stored ones', () => {
    const discarded: DiscardedField[] = [];
    const clean = TenantService.sanitizeConfigDocument(
      {
        configuration: {
          instanceConfiguration: {
            type: 'community',
            features: { postsFilters: ['trending', 'hot', 'new'] },
          },
        },
      },
      BLOG_PINS,
      discarded
    );

    // Nothing valid was left, so the key is gone and the merge keeps the instance's filters.
    expect(clean.configuration.instanceConfiguration.features.postsFilters).toBeUndefined();
    expect(paths(discarded)).toEqual([
      'configuration.instanceConfiguration.type',
      'configuration.instanceConfiguration.features.postsFilters',
    ]);
  });

  it('leaves an instance with a feed when every filter it sent is invalid', async () => {
    const stored = await TenantService.buildConfig('alice', undefined, 'alice');
    const clean = TenantService.sanitizeConfigDocument(
      { configuration: { instanceConfiguration: { features: { postsFilters: ['trending'] } } } },
      BLOG_PINS
    );
    const merged = TenantService.mergeConfigGuarded(stored, clean);

    expect(merged.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'posts',
      'blog',
    ]);
  });

  it('keeps the valid filters and drops only the rest', () => {
    const discarded: DiscardedField[] = [];
    const clean = TenantService.sanitizeConfigDocument(
      {
        configuration: {
          instanceConfiguration: { features: { postsFilters: ['blog', 'trending', 'replies'] } },
        },
      },
      BLOG_PINS,
      discarded
    );

    expect(clean.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'blog',
      'replies',
    ]);
    expect(discarded).toHaveLength(1);
    expect(discarded[0].reason).toContain('trending');
  });

  it('accepts community filters on a community instance', () => {
    const discarded: DiscardedField[] = [];
    const clean = TenantService.sanitizeConfigDocument(
      {
        configuration: {
          instanceConfiguration: { features: { postsFilters: ['trending', 'hot', 'new'] } },
        },
      },
      COMMUNITY_PINS,
      discarded
    );

    expect(clean.configuration.instanceConfiguration.features.postsFilters).toEqual([
      'trending',
      'hot',
      'new',
    ]);
    expect(discarded).toEqual([]);
  });

  it('drops blog filters from a community instance', () => {
    const discarded: DiscardedField[] = [];
    TenantService.sanitizeConfigDocument(
      {
        configuration: {
          instanceConfiguration: { features: { postsFilters: ['blog', 'comments'] } },
        },
      },
      COMMUNITY_PINS,
      discarded
    );

    expect(paths(discarded)).toEqual([
      'configuration.instanceConfiguration.features.postsFilters',
    ]);
  });

  it('leaves a document that does not mention filters alone', () => {
    const discarded: DiscardedField[] = [];
    const clean = TenantService.sanitizeConfigDocument(
      { configuration: { general: { theme: 'dark' } } },
      BLOG_PINS,
      discarded
    );

    expect(clean.configuration.general.theme).toBe('dark');
    expect(discarded).toEqual([]);
  });
});

/**
 * The server has always pinned identity fields and dropped shape-mismatched values, but it did
 * so silently: the editor showed one thing, the stored config held another, and the response
 * said "Configuration updated" either way.
 */
describe('discarded values are reported back', () => {
  it('reports a pinned identity field only when the client sent something different', () => {
    const changed: DiscardedField[] = [];
    TenantService.sanitizeConfigDocument(
      { configuration: { instanceConfiguration: { owner: 'attacker' } } },
      BLOG_PINS,
      changed
    );
    expect(paths(changed)).toEqual(['configuration.instanceConfiguration.owner']);

    // The editor loads the served config and sends it back, so matching values are not noise.
    const echoed: DiscardedField[] = [];
    TenantService.sanitizeConfigDocument(
      { version: 1, configuration: { instanceConfiguration: { owner: 'alice', type: 'blog' } } },
      BLOG_PINS,
      echoed
    );
    expect(echoed).toEqual([]);
  });

  it('reports a client-supplied config version, which the server owns', () => {
    const discarded: DiscardedField[] = [];
    TenantService.sanitizeConfigDocument({ version: 99, configuration: {} }, BLOG_PINS, discarded);

    expect(paths(discarded)).toEqual(['version']);
  });

  it('reports the full path of a value dropped for disagreeing with the stored shape', async () => {
    const stored = await TenantService.buildConfig('alice', undefined, 'alice');
    const discarded: DiscardedField[] = [];

    const merged = TenantService.mergeConfigGuarded(
      stored,
      { configuration: { general: { theme: 42 }, instanceConfiguration: { layout: 'oops' } } },
      { path: '', discarded }
    );

    expect(merged.configuration.general.theme).toBe('system');
    expect(paths(discarded).sort()).toEqual([
      'configuration.general.theme',
      'configuration.instanceConfiguration.layout',
    ]);
  });

  it('still drops mismatched values when no report was asked for', async () => {
    const stored = await TenantService.buildConfig('alice', undefined, 'alice');

    const merged = TenantService.mergeConfigGuarded(stored, {
      configuration: { general: { theme: 42 } },
    });

    expect(merged.configuration.general.theme).toBe('system');
  });
});
