import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * globals.css must keep its element rules in @layer base and its <html> and
 * <body> rules out of it.
 *
 * Unlayered normal declarations beat every layered one whatever the
 * specificity, so the element rules here used to beat every Tailwind utility:
 * `a { color: inherit }` beat `text-theme-accent`, `img { height: auto }` beat
 * `h-48`, `* { font-family: inherit }` beat `font-mono`. In @layer base they
 * behave like base rules everywhere else.
 *
 * The exemption is the load-bearing half. `general.styles.background` is a
 * free-form class string an owner types into the configuration panel, and it
 * lands on <body>. It has never painted, because `body`'s own
 * `background-color` outranks any `bg-*` utility the owner names. Layering the
 * body rule would hand the win to `bg-black` and `bg-white`, which are compiled
 * from elsewhere in the app, while `color: var(--theme-text-primary)` stayed
 * put: an unreadable page from a valid value, saved with a 200 OK, on a live
 * instance. `@source inline(...)` on those class names would do the same
 * through `background-image`, which is why it is refused here too.
 *
 * The `body` font-size overrides are body rules for a second reason: layering
 * them while the main body rule stayed unlayered would let
 * `var(--theme-text-base)` beat both media queries and shrink desktop body copy
 * on every instance.
 *
 * jsdom does not implement cascade layers, so a computed-style assertion would
 * pass for the wrong reason. This reads the stylesheet instead, and says so.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const GLOBALS = join(resolve(HERE, '..'), 'globals.css');

const LAYER = '@layer base';

/**
 * Selectors that must stay out of the layer, and why. This list is the guard:
 * "unlayered" is a deliberate, explained property of exactly these rules.
 */
const UNLAYERED_BY_DESIGN: Record<string, string> = {
  body: 'an owner-supplied bg-* class on <body> must never win',
  'html, body': 'page-level box rules, same exposure through body classes',
};

interface Rule {
  selector: string;
  declarations: string;
  layered: boolean;
}

/** Style rules of a stylesheet, at any at-rule nesting depth. */
function rules(css: string): Rule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];

  const parse = (body: string, layered: boolean) => {
    let prelude = '';
    let depth = 0;
    let start = 0;
    for (let i = 0; i < body.length; i += 1) {
      const char = body[i];
      if (depth === 0) {
        if (char === '{') {
          depth = 1;
          start = i + 1;
        } else if (char === ';') {
          prelude = '';
        } else {
          prelude += char;
        }
        continue;
      }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth > 0) continue;
        const selector = prelude.trim().replace(/\s+/g, ' ');
        const inner = body.slice(start, i);
        if (selector.startsWith('@')) {
          parse(inner, layered || selector.startsWith('@layer'));
        } else {
          out.push({ selector, declarations: inner, layered });
        }
        prelude = '';
      }
    }
  };

  parse(source, false);
  return out;
}

describe('globals.css cascade layers', () => {
  const css = readFileSync(GLOBALS, 'utf8');
  const parsed = rules(css);

  it('parses the stylesheet it is asserting on', () => {
    expect(parsed.length).toBeGreaterThan(8);
    expect(parsed.map((rule) => rule.selector)).toContain('body');
    expect(css).toContain(`${LAYER} {`);
  });

  it('every rule that is not exempt is inside @layer base', () => {
    const unlayered = parsed
      .filter((rule) => !rule.layered)
      .map((rule) => rule.selector)
      .filter((selector) => !(selector in UNLAYERED_BY_DESIGN));

    expect(unlayered).toEqual([]);
  });

  it('every exempt rule is a <html>/<body> rule and is unlayered', () => {
    for (const selector of Object.keys(UNLAYERED_BY_DESIGN)) {
      const parts = selector.split(',').map((part) => part.trim());
      expect(parts.every((part) => part === 'html' || part === 'body')).toBe(
        true,
      );
      const matching = parsed.filter((rule) => rule.selector === selector);
      expect(matching.length).toBeGreaterThan(0);
      expect(matching.every((rule) => !rule.layered)).toBe(true);
    }
  });

  it('the body rule still declares the background the exemption protects', () => {
    const body = parsed.filter(
      (rule) => rule.selector === 'body' && !rule.layered,
    );
    expect(
      body.some((rule) =>
        /background-color:\s*var\(--theme-bg-primary\)/.test(rule.declarations),
      ),
    ).toBe(true);
  });

  it('does not force the owner background classes into the build', () => {
    expect(css).not.toMatch(/@source\s+inline\(/);
  });
});
