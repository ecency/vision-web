import { describe, expect, it } from 'vitest';
import { mergeConfig } from './merge-config';

describe('mergeConfig', () => {
  it('keeps sections the served config does not mention', () => {
    const base = {
      configuration: {
        general: { theme: 'light', styles: { background: 'bg-white' } },
        instanceConfiguration: { layout: { sidebar: { placement: 'right' } } },
      },
    };
    const served = { configuration: { general: { theme: 'dark' } } };

    const merged = mergeConfig(base, served as typeof base);

    expect(merged.configuration.general.theme).toBe('dark');
    expect(merged.configuration.general.styles.background).toBe('bg-white');
    expect(
      merged.configuration.instanceConfiguration.layout.sidebar.placement,
    ).toBe('right');
  });

  it('replaces arrays rather than combining them', () => {
    const merged = mergeConfig(
      { postsFilters: ['posts', 'blog'] },
      {
        postsFilters: ['trending'],
      },
    );

    expect(merged.postsFilters).toEqual(['trending']);
  });

  it('lets the served config override a section with a scalar', () => {
    expect(mergeConfig({ a: { b: 1 } }, { a: 2 } as never)).toEqual({ a: 2 });
  });

  it('returns the override when either side is not an object', () => {
    expect(mergeConfig(null, { a: 1 } as never)).toEqual({ a: 1 });
    expect(mergeConfig({ a: 1 } as never, null)).toBe(null);
  });
});
