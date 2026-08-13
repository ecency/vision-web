import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Gallery is the first layout-level theme that keeps the shared shell, so its
 * structure is CSS rather than a Shell component. That makes these rules
 * load-bearing and silent when broken, and it makes their SCOPE the thing
 * most likely to go wrong: the classes they hang off are rendered by more
 * than the blog shell.
 *
 * Two real bugs are pinned here, both found in review:
 *
 * 1. The measure widening applied to every route in the shell, so an article
 *    and the About page lost the reading width that makes prose readable.
 *    It now only applies to a page that actually contains a grid.
 * 2. The sidebar rules applied to /publish and /edit, which render
 *    `.blog-sidebar-container` and `.blog-layout-grid` themselves, outside
 *    the theme seam. They took the editor's sidebar away on a Gallery
 *    instance. They are now qualified by the wrapper only the blog shell
 *    renders.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'themes', 'gallery.css'), 'utf8');

/** Every rule as { selector, declarations }, comments and newlines removed. */
function rules(): { selector: string; body: string }[] {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].replace(/\s+/g, ' ').trim(),
    body: m[2],
  }));
}

/** The rules whose subject is one of the shared layout classes. */
function layoutRules() {
  return rules().filter((r) => r.selector.includes('.blog-'));
}

function ruleFor(match: RegExp) {
  return layoutRules().find((r) => match.test(r.selector)) ?? null;
}

describe('gallery layout rules', () => {
  it('turns the archive into a grid whatever list type the config carries', () => {
    const archive = ruleFor(/\.blog-posts-list$/);
    expect(archive).not.toBeNull();
    expect(archive!.body).toMatch(/display:\s*grid/);
    expect(archive!.body).toMatch(/grid-template-columns:\s*repeat\(auto-fill/);
  });

  it('widens the measure only on a page that has a grid on it', () => {
    // Without the :has, an article and the About page render prose at the
    // gallery's 1200px content width instead of a reading measure.
    const measure = ruleFor(/\.blog-page-measure/);
    expect(measure).not.toBeNull();
    expect(measure!.selector).toContain(':has(.blog-posts-list)');
    expect(measure!.body).toMatch(/max-width:\s*var\(--theme-content-width\)/);
  });

  it('touches the sidebar only inside the blog shell', () => {
    // /publish and /edit render .blog-sidebar-container and
    // .blog-layout-grid directly. Only the blog shell renders
    // .blog-page-measure, which is what separates them.
    const sidebarRules = layoutRules().filter((r) =>
      /\.blog-sidebar-container|\.blog-layout-grid/.test(r.selector),
    );
    expect(sidebarRules.length).toBeGreaterThanOrEqual(2);
    for (const rule of sidebarRules) {
      expect(rule.selector, rule.selector).toContain(':has(.blog-page-measure)');
    }
    expect(
      sidebarRules.find((r) => /\.blog-sidebar-container/.test(r.selector))!.body,
    ).toMatch(/display:\s*none/);
  });

  it('keeps every layout selector rooted, so it outranks components.css', () => {
    // components.css is imported after the themes, so an equal-specificity
    // selector there would win. `:root` is the step that prevents it, and a
    // "tidy up" that drops it would break the layout with nothing else failing.
    const selectors = layoutRules().map((r) => r.selector);
    expect(selectors.length).toBeGreaterThanOrEqual(4);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(
        /^:root\[data-style-template="gallery"\]/,
      );
    }
  });
});
