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

  it('the five original templates stay CSS-only no-op manifests', () => {
    // The no-op migration proof for the pre-manifest templates: their rendered
    // tree is exactly the shared defaults. Journal is the first structural
    // theme and is asserted separately below.
    const cssOnly = ['medium', 'minimal', 'developer', 'modern-gradient'];
    for (const manifest of allThemeManifests()) {
      if (cssOnly.includes(manifest.id)) {
        expect(manifest.components, `${manifest.id} must not override components`).toBeUndefined();
      }
      expect(manifest.tier).toBe('free');
    }
  });

  it('journal owns its shell and entry, declares what it does not consume', () => {
    const journal = getThemeManifest('journal');
    expect(journal.components?.Shell).toBeTypeOf('function');
    expect(journal.components?.PostCard).toBeTypeOf('function');
    // Navigation/Sidebar/ArchiveList fall back to the defaults.
    expect(journal.components?.ArchiveList).toBeUndefined();
    expect(journal.unsupportedOptions).toEqual(['sidebar']);
  });

  it('reader owns its shell and archive pane, declares what it does not consume', () => {
    const reader = getThemeManifest('reader');
    expect(reader.components?.Shell).toBeTypeOf('function');
    // The rail owns the archive, so the feed route's ArchiveList seam becomes
    // the reading-pane greeting rather than a second copy of the feed.
    expect(reader.components?.ArchiveList).toBeTypeOf('function');
    // Cards stay the shared default: search results render them in the pane.
    expect(reader.components?.PostCard).toBeUndefined();
    expect(reader.components?.Navigation).toBeUndefined();
    expect(reader.unsupportedOptions).toEqual(['sidebar']);
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
  it('every CSS-only template resolves to exactly the shared defaults', () => {
    const layoutThemes = new Set(['journal', 'reader', 'gallery', 'magazine', 'terminal']);
    for (const id of STYLE_TEMPLATES.filter((t) => !layoutThemes.has(t))) {
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

  it('journal resolves its own shell and entry, defaults for the rest', () => {
    const journal = getThemeManifest('journal');
    const resolved = resolveThemeComponents('journal');
    expect(resolved.Shell).toBe(journal.components?.Shell);
    expect(resolved.PostCard).toBe(journal.components?.PostCard);
    expect(resolved.Navigation).toBe(DEFAULT_THEME_COMPONENTS.Navigation);
    expect(resolved.Sidebar).toBe(DEFAULT_THEME_COMPONENTS.Sidebar);
    expect(resolved.ArchiveList).toBe(DEFAULT_THEME_COMPONENTS.ArchiveList);
  });

  it('magazine owns its archive and nothing else', () => {
    const magazine = getThemeManifest('magazine');
    const resolved = resolveThemeComponents('magazine');
    expect(resolved.ArchiveList).toBe(magazine.components?.ArchiveList);
    // The card stays shared on purpose: search results render through the
    // PostCard seam, and a hero has no meaning in a list of search hits.
    expect(resolved.PostCard).toBe(DEFAULT_THEME_COMPONENTS.PostCard);
    expect(resolved.Shell).toBe(DEFAULT_THEME_COMPONENTS.Shell);
    expect(resolved.Sidebar).toBe(DEFAULT_THEME_COMPONENTS.Sidebar);
  });

  it('gallery resolves its own tile and drops the sidebar, defaults for the rest', () => {
    const gallery = getThemeManifest('gallery');
    const resolved = resolveThemeComponents('gallery');
    expect(resolved.PostCard).toBe(gallery.components?.PostCard);
    // The sidebar seam is overridden rather than hidden in CSS, so the
    // default sidebar's follower and chain queries never run for a theme
    // that shows no sidebar at all.
    expect(resolved.Sidebar).toBe(gallery.components?.Sidebar);
    expect(resolved.Sidebar).not.toBe(DEFAULT_THEME_COMPONENTS.Sidebar);
    // Gallery keeps the shared frame: its archive becomes a grid through
    // CSS the theme owns, not through a shell of its own.
    expect(resolved.Shell).toBe(DEFAULT_THEME_COMPONENTS.Shell);
    expect(resolved.ArchiveList).toBe(DEFAULT_THEME_COMPONENTS.ArchiveList);
    expect(resolved.Navigation).toBe(DEFAULT_THEME_COMPONENTS.Navigation);
  });

  it('terminal owns its shell and listing, and mounts the composer entry', () => {
    const terminal = getThemeManifest('terminal');
    const resolved = resolveThemeComponents('terminal');
    expect(resolved.Shell).toBe(terminal.components?.Shell);
    expect(resolved.ArchiveList).toBe(terminal.components?.ArchiveList);
    // The card stays shared: search results render through that seam, and a
    // listing row has no meaning outside the archive.
    expect(resolved.PostCard).toBe(DEFAULT_THEME_COMPONENTS.PostCard);
  });

  it('reader resolves its own shell and archive pane, defaults for the rest', () => {
    const reader = getThemeManifest('reader');
    const resolved = resolveThemeComponents('reader');
    expect(resolved.Shell).toBe(reader.components?.Shell);
    expect(resolved.ArchiveList).toBe(reader.components?.ArchiveList);
    expect(resolved.Navigation).toBe(DEFAULT_THEME_COMPONENTS.Navigation);
    expect(resolved.Sidebar).toBe(DEFAULT_THEME_COMPONENTS.Sidebar);
    expect(resolved.PostCard).toBe(DEFAULT_THEME_COMPONENTS.PostCard);
  });

  it('option support reads the manifest declaration', async () => {
    const { isThemeOptionSupported } = await import('./registry');
    expect(isThemeOptionSupported('journal', 'sidebar')).toBe(false);
    expect(isThemeOptionSupported('reader', 'sidebar')).toBe(false);
    expect(isThemeOptionSupported('gallery', 'sidebar')).toBe(false);
    expect(isThemeOptionSupported('terminal', 'sidebar')).toBe(false);
    expect(isThemeOptionSupported('medium', 'sidebar')).toBe(true);
    expect(isThemeOptionSupported(undefined, 'sidebar')).toBe(true);
    // An id this build does not know supports everything: the editor must
    // not hide a control because a newer config named a template it has
    // never heard of.
    expect(isThemeOptionSupported('no-such-theme', 'sidebar')).toBe(true);
  });
});
