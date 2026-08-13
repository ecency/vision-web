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
const CONFIG_FIELDS = readFileSync(
  join(HERE, '..', 'features', 'floating-menu', 'config-fields.ts'),
  'utf8',
);

/**
 * This list is empty and should stay that way. It briefly held
 * `data-show-following`, whose toggle had a field, a seed, an attribute and a
 * rule but no component rendering the class it hid, so it had never done
 * anything (#1477). An entry here means a toggle that lies to the owner.
 */
const RENDERS_NOTHING_YET = new Set<string>();

/**
 * The sidebar is TWO components in one module, and an instance renders exactly
 * one of them. Checking the module as a whole is what let #1480 through: the
 * blog half rendered all three classes, which satisfied the assertion on
 * behalf of a community half that rendered none of them, so every toggle was
 * inert on a community instance while this file stayed green.
 *
 * An attribute a mode does NOT serve must be hidden from that mode's editor,
 * asserted below, so the two halves of the rule cannot drift apart either.
 */
const MODE_SECTIONS = {
  BlogSidebarContent: [
    'data-show-followers',
    'data-show-following',
    'data-show-hive-info',
  ],
  CommunitySidebar: ['data-show-followers', 'data-show-hive-info'],
} as const;

/** The body of one top-level `function Name(` declaration in the sidebar. */
function componentSource(name: string): string {
  const start = SIDEBAR.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in blog-sidebar.tsx`);
  const next = SIDEBAR.slice(start + 1).search(/\n(?:export )?function \w+\(/);
  return next < 0 ? SIDEBAR.slice(start) : SIDEBAR.slice(start, start + 1 + next);
}

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

  it('collapses the counts row when both of its sections are hidden', () => {
    // Needs both attributes, so it is not in hidingRules(). Without it the
    // row's bottom margin survives its contents as a gap.
    const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const collapse = withoutComments.match(
      /\[data-show-followers="false"\]\[data-show-following="false"\]\s*\.([a-z-]+)\s*\{([^{}]*)\}/,
    );
    expect(collapse, 'no rule collapses the follow-stats row').not.toBeNull();
    expect(collapse![2]).toMatch(/display:\s*none/);
    expect(SIDEBAR).toContain(collapse![1]);
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

  it('renders the class in EACH mode that serves the toggle', () => {
    const rules = hidingRules();
    for (const [component, attributes] of Object.entries(MODE_SECTIONS)) {
      const source = componentSource(component);
      for (const attribute of attributes) {
        const rule = rules.get(attribute);
        expect(rule, `no rule for ${attribute}`).toBeDefined();
        expect(
          source.includes(rule!.className),
          `${component} never renders .${rule!.className}, so ${attribute} does nothing on that instance mode`,
        ).toBe(true);
      }
    }
  });

  it('governs EVERY chain-info block a community renders, not just the first', () => {
    // The community tree presents chain information as two sibling blocks,
    // Community Info and Team, so one class on the first left the moderator
    // list visible with the toggle off. A toggle that half works is the same
    // defect as one that does nothing.
    const source = componentSource('CommunitySidebar');
    const occurrences = source.split('sidebar-hive-info-section').length - 1;
    expect(
      occurrences,
      'each sibling chain-info block in CommunitySidebar needs the class in its own right',
    ).toBeGreaterThanOrEqual(2);

    // Anchored to the team block itself, not merely to the class appearing
    // somewhere before the word "team": this region runs from the block's
    // guard to its heading, so it holds that block's opening element and
    // nothing else. A looser `class ... [\s\S]*? t("team")` was satisfied by
    // the Community Info block above and proved nothing.
    const guard = source.indexOf('community.team');
    const heading = source.search(/t\(["']team["']\)/);
    expect(guard, 'team block not found').toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(guard);
    expect(
      source.slice(guard, heading),
      'the team block must carry the class on its own element',
    ).toContain('sidebar-hive-info-section');
  });

  it('hides from the editor any toggle a mode cannot serve', () => {
    const served = new Set(MODE_SECTIONS.CommunitySidebar);
    const unserved = MODE_SECTIONS.BlogSidebarContent.filter(
      (a) => !served.has(a as (typeof MODE_SECTIONS.CommunitySidebar)[number]),
    );
    // Today that is exactly `following`: a community page does not advertise
    // what its own account follows. Showing the control anyway is the #1480
    // bug, so the field must carry an instance-type gate.
    expect(unserved).toEqual(['data-show-following']);
    const field = CONFIG_FIELDS.slice(
      CONFIG_FIELDS.indexOf('following: {'),
      CONFIG_FIELDS.indexOf('hiveInformation: {'),
    );
    expect(field).toContain('visibleWhen');
    expect(field).toContain('isCommunityConfig');
  });
});
