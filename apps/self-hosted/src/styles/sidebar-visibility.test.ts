import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The sidebar's per-section toggles are a three-part chain, and every part is
 * silent when it breaks:
 *
 *   config flag -> data-show-* on <html> -> CSS rule -> a rendered class
 *
 * The toggle writes the attribute and nothing else. A missing CSS rule leaves
 * the section on screen with the toggle off, and a rule naming a class no
 * component renders leaves the toggle off with nothing to hide. Neither shows
 * up in a component test, because both ends of the chain are still there.
 *
 * Retiring the sidebar-placement rules (#1471) deleted the followers rule
 * along with them: 944 tests passed and the Followers toggle was dead. That is
 * the regression the first case here pins.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'components.css'), 'utf8');
const APPLY_CONFIG_DOM = readFileSync(
  join(HERE, '..', 'core', 'apply-config-dom.ts'),
  'utf8',
);
const SIDEBAR = readFileSync(
  join(HERE, '..', 'features', 'blog', 'layout', 'blog-sidebar.tsx'),
  'utf8',
);

/**
 * Known-dead, tracked in #1477: the editor offers a Following toggle and the
 * whole chain exists except the component. Resolving that issue empties this
 * list, at which point the last case below starts enforcing on it too.
 */
const RENDERS_NOTHING_YET = new Set(['data-show-following']);

/** Every data-show-* attribute apply-config-dom actually emits. */
function emittedAttributes(): string[] {
  return [
    ...APPLY_CONFIG_DOM.matchAll(/attribute:\s*'(data-show-[a-z-]+)'/g),
  ].map((m) => m[1]);
}

/** Every `[data-show-x="false"] .y` rule, mapped attribute -> hidden class. */
function hidingRules(): Map<string, { className: string; body: string }> {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map<string, { className: string; body: string }>();
  for (const match of withoutComments.matchAll(
    /\[(data-show-[a-z-]+)="false"\]\s*\.([a-z-]+)\s*\{([^{}]*)\}/g,
  )) {
    rules.set(match[1], { className: match[2], body: match[3] });
  }
  return rules;
}

describe('sidebar section visibility', () => {
  it('gives every emitted data-show-* attribute a rule that hides its section', () => {
    const rules = hidingRules();
    const emitted = emittedAttributes();

    expect(emitted.length).toBeGreaterThanOrEqual(3);
    for (const attribute of emitted) {
      const rule = rules.get(attribute);
      expect(
        rule,
        `${attribute} is written to <html> but components.css has no rule for it, so its toggle does nothing`,
      ).toBeDefined();
      expect(rule!.body).toMatch(/display:\s*none/);
    }
  });

  it('emits an attribute for every rule, so no rule outlives its toggle', () => {
    const emitted = new Set(emittedAttributes());
    for (const attribute of hidingRules().keys()) {
      expect(
        emitted.has(attribute),
        `components.css hides on ${attribute}, but apply-config-dom never writes it`,
      ).toBe(true);
    }
  });

  it('hides a class the sidebar actually renders', () => {
    for (const [attribute, rule] of hidingRules()) {
      if (RENDERS_NOTHING_YET.has(attribute)) continue;
      expect(
        SIDEBAR.includes(rule.className),
        `${attribute} hides .${rule.className}, which blog-sidebar.tsx never renders`,
      ).toBe(true);
    }
  });
});
