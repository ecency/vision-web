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
function bareHoverSelectors(rawSource: string): string[] {
  // Comments first, for two separate reasons found by testing the detector
  // rather than trusting it: a comment that merely MENTIONS :hover was reported
  // as a bare rule, and a comment containing a brace desynced the depth
  // tracking and produced garbage selectors. `parseBlocks` in the sibling test
  // strips them for the same reason.
  const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, '');
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
    // `hover: hover` specifically. A looser test also accepted
    // `@media (hover: none)`, which is the opposite condition and would have
    // counted a rule that only applies on touch as correctly gated.
    const insideHoverMedia = openers.some((o) =>
      /@media[^{]*\(\s*(?:any-)?hover\s*:\s*hover\s*\)/.test(o),
    );

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

  /** A comment that talks about hover is not a rule that uses it. */
  it('ignores :hover inside comments', () => {
    expect(
      bareHoverSelectors('/* keep :hover out of here */ .a { color: red; }'),
    ).toEqual([]);
  });

  /** A brace in a comment used to desync the depth tracking entirely. */
  it('survives a brace inside a comment', () => {
    expect(
      bareHoverSelectors('/* a { b } */ @media (hover: hover) { .a:hover { x: 1; } }'),
    ).toEqual([]);
  });

  /**
   * `hover: none` is the opposite condition. Accepting it as a gate would pass
   * a rule that applies only where the problem is.
   */
  it('does not accept hover: none as a gate', () => {
    expect(
      bareHoverSelectors('@media (hover: none) { .a:hover { x: 1; } }'),
    ).toEqual(['.a:hover']);
  });

  /** `any-hover: hover` is a legitimate gate and must be accepted. */
  it('accepts any-hover: hover', () => {
    expect(
      bareHoverSelectors('@media (any-hover: hover) { .a:hover { x: 1; } }'),
    ).toEqual([]);
  });
});
