import { describe, expect, it } from 'vitest';
import { STYLE_TEMPLATES } from '../../hosting/api/src/style-templates';
import { allThemeManifests, getThemeManifest } from './registry';

/**
 * The no-op migration proof: every roster template has a manifest, none of
 * the five carries component overrides (they are CSS-only, so the resolved
 * tree is exactly the pre-manifest tree), and unknown ids resolve to the
 * default template's manifest the same way apply-config-dom resolves the
 * data-style-template attribute.
 */
describe('theme manifest registry', () => {
  it('is total over the roster with matching ids', () => {
    const manifests = allThemeManifests();
    expect(manifests.map((m) => m.id).sort()).toEqual([...STYLE_TEMPLATES].sort());
  });

  it('all five existing templates are CSS-only no-op manifests', () => {
    for (const manifest of allThemeManifests()) {
      expect(manifest.components, `${manifest.id} must not override components yet`).toBeUndefined();
      expect(manifest.tier).toBe('free');
    }
  });

  it('unknown and absent ids resolve to the default template', () => {
    expect(getThemeManifest(undefined).id).toBe('medium');
    expect(getThemeManifest('no-such-theme').id).toBe('medium');
    expect(getThemeManifest(42).id).toBe('medium');
    expect(getThemeManifest('magazine').id).toBe('magazine');
  });
});

// Imported at module scope: the resolver drags the whole component graph in,
// and paying that import inside the test body spends the 5s test budget on
// cold-transform time in CI (it timed out on the merged develop). Collection
// time is not budgeted.
const { DEFAULT_THEME_COMPONENTS, resolveThemeComponents } = await import(
  './use-theme-components'
);

describe('component resolution', () => {
  it('every roster template resolves to exactly the shared defaults today', () => {
    for (const id of STYLE_TEMPLATES) {
      const resolved = resolveThemeComponents(id);
      // Identity per seam, not just deep equality: the no-op migration means
      // the very same component functions render, so nothing remounts.
      for (const key of Object.keys(DEFAULT_THEME_COMPONENTS) as Array<
        keyof typeof DEFAULT_THEME_COMPONENTS
      >) {
        expect(resolved[key], `${id}.${key}`).toBe(DEFAULT_THEME_COMPONENTS[key]);
      }
    }
    expect(resolveThemeComponents(undefined)).toEqual(
      resolveThemeComponents('medium'),
    );
  });
});
