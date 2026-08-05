import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Hover styling must be gated on a device that can hover.
 *
 * On a touch screen `:hover` latches after a tap and stays until the reader
 * taps something else. A tapped tag keeps its dimmed look, a tapped button
 * keeps its hover fill, and both read as still selected. It is the kind of bug
 * nobody reports because it looks like the app is confused rather than broken.
 *
 * Tailwind v4 already wraps its own `hover:` variants in `@media (hover: hover)`
 * (confirmed in the deployed stylesheet: three such blocks, 31 of the 57 hover
 * rules). The hand-written CSS was the half left bare.
 *
 * Asserted on source rather than on the build output, because the build is not
 * available to this runner and the source is where a new rule gets added.
 */

const STYLE_ROOT = join(__dirname, '..');

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

/**
 * Selectors containing `:hover` that are NOT inside an `@media (hover: ...)`
 * block, found by tracking brace depth and which `@media` opened each level.
 */
function bareHoverSelectors(source: string): string[] {
  const bare: string[] = [];
  const openers: string[] = [];
  let i = 0;

  while (i < source.length) {
    const brace = source.indexOf('{', i);
    if (brace === -1) break;

    const head = source.slice(i, brace);
    const close = source.indexOf('}', i);

    // A closing brace before the next opening one ends enclosing blocks.
    if (close !== -1 && close < brace) {
      openers.pop();
      i = close + 1;
      continue;
    }

    const selector = head.split('}').pop()!.trim();
    const insideHoverMedia = openers.some((o) => /@media[^{]*\(\s*hover/.test(o));

    if (selector.includes(':hover') && !selector.startsWith('@') && !insideHoverMedia) {
      bare.push(selector.replace(/\s+/g, ' ').slice(0, 100));
    }

    openers.push(selector);
    i = brace + 1;
  }

  return bare;
}

describe('hover styling is gated on hover-capable devices', () => {
  const files = cssFiles(STYLE_ROOT);

  it('finds the stylesheets to check', () => {
    // Guards the reader: an empty list would make everything below vacuous.
    expect(files.length).toBeGreaterThan(3);
    expect(files.some((f) => f.endsWith('globals.css'))).toBe(true);
  });

  it.each(files.map((f) => [f.slice(STYLE_ROOT.length + 1), f]))(
    '%s has no ungated :hover rule',
    (_label, path) => {
      expect(bareHoverSelectors(readFileSync(path, 'utf8'))).toEqual([]);
    },
  );

  /**
   * The detector has to actually detect. Without this the suite passes on a
   * parser that finds nothing, which is the failure mode a source scan invites.
   */
  it('reports a bare rule and stays quiet about a gated one', () => {
    expect(bareHoverSelectors('.a:hover { opacity: 0.5; }')).toEqual([
      '.a:hover',
    ]);
    expect(
      bareHoverSelectors('@media (hover: hover) { .a:hover { opacity: 0.5; } }'),
    ).toEqual([]);
    expect(bareHoverSelectors('.a { color: red; }')).toEqual([]);
  });
});
