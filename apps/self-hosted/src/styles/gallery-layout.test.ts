import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Gallery is the first layout-level theme that keeps the shared shell: its
 * structure is three CSS rules rather than a Shell component. That makes the
 * rules load-bearing and silent when broken, which is what this pins.
 *
 * Delete the grid rule and Gallery renders a single column of covers, which
 * looks like a styling choice rather than a bug. Delete the measure rule and
 * the wall is capped at the reading width the text templates use. Weaken the
 * selectors and components.css wins, because it is imported AFTER the themes.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'themes', 'gallery.css'), 'utf8');

/** The declarations of the first rule whose selector matches exactly. */
function rule(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  return match ? match[1] : null;
}

describe('gallery layout rules', () => {
  it('turns the archive into a grid whatever list type the config carries', () => {
    // listType is hidden by the manifest, but a config written before that
    // (or by hand) can still say 'list', and the grid has to hold anyway.
    const archive = rule(':root[data-style-template="gallery"] .blog-posts-list');
    expect(archive).not.toBeNull();
    expect(archive).toMatch(/display:\s*grid/);
    expect(archive).toMatch(/grid-template-columns:\s*repeat\(auto-fill/);
  });

  it('widens the shared reading measure to the theme content width', () => {
    const measure = rule(':root[data-style-template="gallery"] .blog-page-measure');
    expect(measure).not.toBeNull();
    expect(measure).toMatch(/max-width:\s*var\(--theme-content-width\)/);
  });

  it('collapses the sidebar column the shell reserves', () => {
    expect(
      rule(':root[data-style-template="gallery"] .blog-sidebar-container'),
    ).toMatch(/display:\s*none/);
    expect(
      rule(':root[data-style-template="gallery"] .blog-layout-grid'),
    ).toMatch(/grid-template-columns:\s*1fr/);
  });

  it('keeps every layout selector rooted, so it outranks components.css', () => {
    // components.css is imported after the themes, so an equal-specificity
    // selector there would win. `:root` is the step that prevents it, and a
    // "tidy up" that drops it would break the layout with nothing else failing.
    const layoutSelectors = [...CSS.matchAll(/^(\S.*)\{/gm)]
      .map((m) => m[1].trim())
      .filter((s) => s.includes('.blog-'));
    expect(layoutSelectors.length).toBeGreaterThanOrEqual(4);
    for (const selector of layoutSelectors) {
      expect(selector, selector).toMatch(/^:root\[data-style-template="gallery"\]/);
    }
  });
});
