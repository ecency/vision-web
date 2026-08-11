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

describe('style template roster', () => {
  it('matches the CSS theme files one to one', () => {
    expect([...STYLE_TEMPLATES].sort()).toEqual(cssTemplateIds());
  });

  it('every template CSS file declares its own data-style-template block', () => {
    for (const id of STYLE_TEMPLATES) {
      const css = readFileSync(join(THEMES_DIR, `${id}.css`), 'utf8');
      expect(css, `${id}.css must scope to its template id`).toContain(
        `[data-style-template="${id}"]`,
      );
    }
  });

  it('every template CSS file is imported by the registry index', () => {
    const index = readFileSync(join(THEMES_DIR, 'index.css'), 'utf8');
    for (const id of STYLE_TEMPLATES) {
      expect(index, `index.css must import ${id}.css`).toContain(
        `./${id}.css`,
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
