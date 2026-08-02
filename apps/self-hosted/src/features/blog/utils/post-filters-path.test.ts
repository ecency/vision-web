import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  instanceConfiguration: {} as Record<string, unknown>,
}));

vi.mock('../../../core', () => ({
  InstanceConfigManager: {
    getConfigValue: (selector: (config: unknown) => unknown) =>
      selector({
        configuration: { instanceConfiguration: state.instanceConfiguration },
      }),
  },
}));

const { getConfiguredPostsFilters } = await import('./post-filters');

/**
 * The helper validated the VALUE thoroughly but dereferenced the PATH, so a
 * config with no features section threw inside the very guard that exists to
 * stop a bad config from taking the layout down.
 */
describe('getConfiguredPostsFilters path handling', () => {
  it('survives a missing features section', () => {
    state.instanceConfiguration = {};

    expect(() => getConfiguredPostsFilters()).not.toThrow();
    expect(getConfiguredPostsFilters()).toEqual(['posts']);
  });

  it('survives a null features section', () => {
    state.instanceConfiguration = { features: null };

    expect(() => getConfiguredPostsFilters()).not.toThrow();
    expect(getConfiguredPostsFilters()).toEqual(['posts']);
  });

  it('still reads a configured list', () => {
    state.instanceConfiguration = {
      features: { postsFilters: ['blog', 'posts'] },
    };

    expect(getConfiguredPostsFilters()).toEqual(['blog', 'posts']);
  });
});
