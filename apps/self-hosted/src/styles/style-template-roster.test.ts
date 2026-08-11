import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STYLE_TEMPLATE,
  STYLE_TEMPLATES,
} from '../../hosting/api/src/style-templates';

/**
 * The roster (hosting/api/src/style-templates.ts) is the single source of
 * truth for template ids: the hosting API validates against it and the editor
 * offers it. This suite locks the CSS side to it, so an id cannot exist
 * without a stylesheet (a selectable template that renders unstyled) and a
 * stylesheet cannot exist without an id (a design no one can pick, which is
 * how a sixth theme stayed unshippable for a month).
 */

const THEMES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'themes',
);

/** Theme files that are not templates: the shared token baseline. */
const NOT_TEMPLATES = new Set(['variables.css', 'index.css']);

function cssTemplateIds(): string[] {
  return readdirSync(THEMES_DIR)
    .filter((name) => name.endsWith('.css') && !NOT_TEMPLATES.has(name))
    .map((name) => name.replace(/\.css$/, ''))
    .sort();
}

/**
 * Both assertions below read CSS with comments removed first: a commented-out
 * `@import` or selector block is exactly the disabled state this suite exists
 * to catch, and a substring or line match alone would accept it.
 */
function activeCss(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('style template roster', () => {
  it('matches the CSS theme files one to one', () => {
    expect([...STYLE_TEMPLATES].sort()).toEqual(cssTemplateIds());
  });

  it('every template CSS file declares its own data-style-template block', () => {
    for (const id of STYLE_TEMPLATES) {
      const css = activeCss(join(THEMES_DIR, `${id}.css`));
      expect(css, `${id}.css must scope to its template id`).toContain(
        `[data-style-template="${id}"]`,
      );
    }
  });

  it('every template CSS file is imported by the registry index', () => {
    const index = activeCss(join(THEMES_DIR, 'index.css'));
    for (const id of STYLE_TEMPLATES) {
      // An exact active @import declaration, not toContain: a filename inside
      // a longer path must not satisfy this, and comment stripping above has
      // already removed any disabled declaration.
      expect(index, `index.css must import ${id}.css`).toMatch(
        new RegExp(`^\\s*@import\\s+["']\\./${id}\\.css["'];`, 'm'),
      );
    }
  });

  it('the default template is on the roster', () => {
    expect(STYLE_TEMPLATES).toContain(DEFAULT_STYLE_TEMPLATE);
  });

  it('ids are unique and url-safe', () => {
    expect(new Set(STYLE_TEMPLATES).size).toBe(STYLE_TEMPLATES.length);
    for (const id of STYLE_TEMPLATES) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});
