import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Terminal's structure is a Shell and an ArchiveList, so unlike Gallery most
 * of it is components rather than CSS. Two rules still carry weight and both
 * are silent when broken, which is what this pins.
 *
 * The listing rule outranks the shared archive rule in components.css on
 * specificity alone, and stays here rather than leaning on that: a console
 * listing is Terminal's own claim about its feed, not an inherited default.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'themes', 'terminal.css'), 'utf8');

function rules() {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].replace(/\s+/g, ' ').trim(),
    body: m[2],
  }));
}

const layoutRules = () => rules().filter((r) => r.selector.includes('.blog-'));

describe('terminal layout rules', () => {
  it('keeps the archive a listing', () => {
    const listing = layoutRules().find((r) => /\.blog-posts-list$/.test(r.selector));
    expect(listing).toBeDefined();
    expect(listing!.body).toMatch(/display:\s*flex/);
    expect(listing!.body).toMatch(/flex-direction:\s*column/);
  });

  it('widens the measure only on a page that has the listing on it', () => {
    // Without the :has, an article and the About page would render prose at
    // the listing's 900px instead of a reading measure.
    const measure = layoutRules().find((r) => /\.blog-page-measure/.test(r.selector));
    expect(measure).toBeDefined();
    expect(measure!.selector).toContain(':has(.blog-posts-list)');
    expect(measure!.body).toMatch(/max-width:\s*var\(--theme-content-width\)/);
  });

  it('carries no sidebar rules, because its shell renders no sidebar', () => {
    // Gallery needs them: it keeps the shared shell and has to collapse the
    // column that shell reserves. TerminalShell renders its own frame, so a
    // rule hiding a sidebar here would match nothing and mislead the reader.
    expect(CSS).not.toContain('.blog-sidebar-container');
    expect(CSS).not.toContain('.blog-layout-grid');
  });

  it('keeps every layout selector rooted, so it outranks components.css', () => {
    const selectors = layoutRules().map((r) => r.selector);
    expect(selectors.length).toBeGreaterThanOrEqual(2);
    for (const selector of selectors) {
      expect(selector, selector).toMatch(
        /^:root\[data-style-template="terminal"\]/,
      );
    }
  });
});
