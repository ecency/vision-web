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

  it('does not let the served config replace a section with a scalar', () => {
    // This previously asserted the opposite. Allowing it reproduced the crash
    // the skeleton exists to prevent, because components dereference the
    // section during render.
    expect(mergeConfig({ a: { b: 1 } }, { a: 2 } as never)).toEqual({
      a: { b: 1 },
    });
  });

  it('returns the override when either side is not an object', () => {
    expect(mergeConfig(null, { a: 1 } as never)).toEqual({ a: 1 });
    expect(mergeConfig({ a: 1 } as never, null)).toBe(null);
  });

  it('treats a null section as absent rather than erasing the shape', () => {
    // Letting null through would overwrite the structure the merge exists to
    // guarantee, reproducing the crash it prevents.
    const merged = mergeConfig(
      { general: { styles: {} }, layout: { sidebar: {} } },
      { general: null, layout: { sidebar: null } } as never,
    );

    expect(merged.general).toEqual({ styles: {} });
    expect(merged.layout.sidebar).toEqual({});
  });

  it('ignores prototype-bearing keys from a served document', () => {
    // JSON.parse yields __proto__ as an own enumerable key, and assigning it
    // would invoke the inherited setter and replace the section's prototype.
    const served = JSON.parse('{"a": 1, "__proto__": {"polluted": true}}');
    const merged = mergeConfig({ a: 0 }, served);

    expect(merged.a).toBe(1);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('keeps a section when the served value is the wrong shape', () => {
    // A scalar cannot stand in for a section: applyConfig's try/catch only
    // covers the boot path, while components dereference
    // configuration.general.* during render and land in the error boundary.
    const skeleton = {
      general: { styles: {} },
      features: { postsFilters: [] },
    };

    expect(
      mergeConfig(skeleton, { general: 'invalid' } as never).general,
    ).toEqual({
      styles: {},
    });
    expect(mergeConfig(skeleton, { general: 42 } as never).general).toEqual({
      styles: {},
    });
    expect(mergeConfig(skeleton, { general: [] } as never).general).toEqual({
      styles: {},
    });
  });

  it('keeps the whole configuration section when it is served as a scalar', () => {
    // A truthy scalar passes the loader's version/configuration presence check,
    // so without type agreement it replaced the skeleton outright and
    // applyConfig destructured a string.
    const skeleton = {
      version: 1,
      configuration: { general: { styles: {} }, instanceConfiguration: {} },
    };

    for (const bad of ['bad', 42, true, [], ['a']]) {
      const merged = mergeConfig(skeleton, {
        version: 2,
        configuration: bad,
      } as never);

      expect(merged.configuration.general).toEqual({ styles: {} });
      expect(merged.version).toBe(2);
    }
  });

  it('keeps an array when the served value is not an array', () => {
    const merged = mergeConfig({ postsFilters: ['posts'] }, {
      postsFilters: 'trending',
    } as never);

    expect(merged.postsFilters).toEqual(['posts']);
  });
});
