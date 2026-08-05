import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { HIVE_LAYER_CONFIG_DEFAULTS } from '@/core/hive-layer';
import { parseHexColor } from '@/core/theme-appearance';
import type { ConfigField } from './config-fields';
import { translations } from '@/core/i18n-strings';
import { buildConfigFields } from './config-fields';

/*
 * English, read from the strings module directly.
 *
 * Not `t` from `@/core/i18n`: that reads the running config and would pull the
 * gitignored build-time `config.json`, which is absent in CI. This is the same
 * lookup `t` performs once the language resolves to `en`, so these assertions
 * are about the copy an English reader sees.
 */
const configFieldsMap = buildConfigFields(
  (key) => translations.en[key] ?? key,
);
import {
  COLOR_UNSET_HINT,
  colorInputMessage,
  colorPickerValue,
  displayedBooleanValue,
  displayedSelectValue,
  displayedStringValue,
  FALLBACK_SECTION_ICON,
  getSectionIcon,
} from './field-display';
import type { ConfigValue } from './types';

/**
 * What the panel shows an owner whose config predates a field.
 *
 * Every config on disk is in that state for anything added after it was
 * written, and there is no staging tier: a merge deploys straight to live
 * blogs. So the property under test is that an absent key displays the value
 * the app resolves for an absent key, never an empty control that reads as
 * "not configured" while the site behaves otherwise.
 */

const READER_LAYER: ConfigField = {
  label: 'Show Hive activity to readers',
  type: 'select',
  default: 'off',
  options: [
    { value: 'off', label: 'Off' },
    { value: 'standard', label: 'Standard' },
    { value: 'full', label: 'Full' },
  ],
};

/** A select as they all were before `default` existed. */
const NO_DEFAULT: ConfigField = {
  label: 'Instance Type',
  type: 'select',
  options: [
    { value: 'blog', label: 'Blog (Personal)' },
    { value: 'community', label: 'Community' },
  ],
};

describe('select', () => {
  it('shows the declared default when the config has no value', () => {
    expect(displayedSelectValue(READER_LAYER, undefined)).toBe('off');
  });

  it('shows a stored value that is one of the options', () => {
    expect(displayedSelectValue(READER_LAYER, 'standard')).toBe('standard');
    expect(displayedSelectValue(READER_LAYER, 'full')).toBe('full');
  });

  const STORABLE_JUNK: Array<[string, ConfigValue]> = [
    ['a number', 42],
    ['null', null],
    ['a boolean', true],
    ['an object', { readerLayer: 'full' }],
    ['an array', ['full']],
  ];

  it.each(STORABLE_JUNK)(
    'shows the default for %s, which the API can store',
    (_label, stored) => {
      expect(displayedSelectValue(READER_LAYER, stored)).toBe('off');
    },
  );

  /**
   * The resolver does no case folding and resolves an unknown literal down to
   * `off`, so a hand-crafted PATCH of 'FULL' is an off site. A select handed a
   * value matching no option renders blank, which would claim the opposite.
   */
  it('shows the default for a string that matches no option', () => {
    expect(displayedSelectValue(READER_LAYER, 'FULL')).toBe('off');
  });

  it('is unchanged for a select that declares no default', () => {
    expect(displayedSelectValue(NO_DEFAULT, undefined)).toBe('');
    expect(displayedSelectValue(NO_DEFAULT, 42)).toBe('');
    expect(displayedSelectValue(NO_DEFAULT, 'community')).toBe('community');
  });
});

describe('boolean', () => {
  const off: ConfigField = { label: 'Enabled', type: 'boolean' };
  const onByDefault: ConfigField = {
    label: 'Enabled',
    type: 'boolean',
    default: true,
  };

  it('is unchanged for a toggle that declares no default', () => {
    expect(displayedBooleanValue(off, undefined)).toBe(false);
    expect(displayedBooleanValue(off, true)).toBe(true);
    expect(displayedBooleanValue(off, false)).toBe(false);
    expect(displayedBooleanValue(off, 'yes')).toBe(false);
  });

  it('falls through to a default of true only when nothing is stored', () => {
    expect(displayedBooleanValue(onByDefault, undefined)).toBe(true);
    expect(displayedBooleanValue(onByDefault, null)).toBe(true);
    // An owner who switched it off stays switched off.
    expect(displayedBooleanValue(onByDefault, false)).toBe(false);
  });
});

describe('string', () => {
  const label: ConfigField = {
    label: 'Earnings label',
    type: 'string',
    default: '',
    maxLength: 40,
  };

  it('shows the stored text', () => {
    expect(displayedStringValue(label, 'Rewards')).toBe('Rewards');
  });

  it('shows the default when the config has no value', () => {
    expect(displayedStringValue(label, undefined)).toBe('');
    expect(displayedStringValue(label, 5)).toBe('');
  });
});

describe('section icons', () => {
  /**
   * `getSectionIcon` is handed `field.label`, so a map keyed by the config key
   * silently yields the fallback box. Pinned on the label the editor declares.
   */
  it('finds the Hive layer glyph from its label', () => {
    expect(getSectionIcon('Hive layer')).toBe('🐝');
  });

  it('still finds the sections that already had one', () => {
    expect(getSectionIcon('Hive Information')).toBe('🐝');
    expect(getSectionIcon('Instance Configuration')).toBe('🔧');
    expect(getSectionIcon('Features')).toBe('✨');
  });

  it('falls back for a section with no entry', () => {
    expect(getSectionIcon('Layout Settings')).toBe(FALLBACK_SECTION_ICON);
  });
});

/**
 * A tenant document written before any of this existed. No `features.hive`,
 * and none of the newer keys either. Names are invented.
 */
const LEGACY_CONFIG = {
  version: 1,
  configuration: {
    general: {
      theme: 'light',
      styleTemplate: 'medium',
      language: 'en',
      styles: { background: 'bg-white' },
    },
    instanceConfiguration: {
      type: 'blog',
      username: 'blogowner',
      meta: { title: 'A Blog', description: 'Words' },
      layout: {
        listType: 'list',
        sidebar: { placement: 'right', followers: { enabled: true } },
      },
      features: {
        postsFilters: ['blog', 'posts'],
        likes: { enabled: true },
        comments: { enabled: true },
      },
    },
  },
};

type Node = Record<string, unknown>;

/** Every non-section field in the map, with the value the legacy config holds. */
function walk(
  fields: Record<string, ConfigField>,
  config: Node | undefined,
  path: string[],
): Array<{ path: string; field: ConfigField; value: unknown }> {
  return Object.entries(fields).flatMap(([key, field]) => {
    const value = config?.[key];
    if (field.type === 'section' && field.fields) {
      const child =
        typeof value === 'object' && value !== null && !Array.isArray(value)
          ? (value as Node)
          : undefined;
      return walk(field.fields, child, [...path, key]);
    }
    return [{ path: [...path, key].join('.'), field, value }];
  });
}

describe('a config written before the Hive layer existed', () => {
  const leaves = walk(configFieldsMap, LEGACY_CONFIG as unknown as Node, []);

  it('reaches every Hive layer control with nothing stored', () => {
    const hive = leaves.filter((leaf) =>
      leaf.path.startsWith(
        'configuration.instanceConfiguration.features.hive.',
      ),
    );
    expect(hive).toHaveLength(Object.keys(HIVE_LAYER_CONFIG_DEFAULTS).length);
    for (const leaf of hive) {
      expect(leaf.value).toBeUndefined();
    }
  });

  it('displays the resolver default for every Hive layer control', () => {
    for (const [key, expected] of Object.entries(HIVE_LAYER_CONFIG_DEFAULTS)) {
      const leaf = leaves.find(
        (candidate) =>
          candidate.path ===
          `configuration.instanceConfiguration.features.hive.${key}`,
      );
      if (!leaf) throw new Error(`no editor control for features.hive.${key}`);
      const value = leaf.value as ConfigValue;
      const shown =
        leaf.field.type === 'select'
          ? displayedSelectValue(leaf.field, value)
          : displayedStringValue(leaf.field, value);
      expect(shown, `features.hive.${key}`).toBe(expected);
    }
  });

  /**
   * What this is really guarding is that a select never renders an unlabelled
   * empty control, which reads as broken and tells the owner nothing about what
   * the site is currently doing.
   *
   * That is not the same as "the value is never the empty string". The font
   * preset offers `''` as a named choice, "Theme default", because an instance
   * that has never chosen a pairing is in exactly that state and has to be able
   * to return to it after picking one. There the control shows a label, so the
   * thing this test exists to prevent has not happened.
   *
   * So the rule is: the shown value must be one of the offered options, and if
   * it is blank that option must carry a label. Stricter than the old
   * `not.toBe('')`, which let an unlabelled blank option through.
   */
  it('leaves no select showing an unlabelled blank when it declares a default', () => {
    for (const leaf of leaves) {
      if (leaf.field.type !== 'select' || leaf.field.default === undefined) {
        continue;
      }
      const shown = displayedSelectValue(leaf.field, leaf.value as ConfigValue);
      const options = leaf.field.options ?? [];
      expect(
        options.map((option) => option.value),
        leaf.path,
      ).toContain(shown);

      const label = options.find((option) => option.value === shown)?.label;
      expect(label ?? '', leaf.path).not.toBe('');
    }
  });

  it('displays every other field exactly as it did before', () => {
    for (const leaf of leaves) {
      if (leaf.field.default !== undefined) continue;
      const value = leaf.value as ConfigValue;
      if (leaf.field.type === 'select') {
        expect(displayedSelectValue(leaf.field, value), leaf.path).toBe(
          typeof value === 'string' ? value : '',
        );
      } else if (leaf.field.type === 'boolean') {
        expect(displayedBooleanValue(leaf.field, value), leaf.path).toBe(
          value === true,
        );
      } else if (leaf.field.type === 'string') {
        expect(displayedStringValue(leaf.field, value), leaf.path).toBe(
          typeof value === 'string' ? value : '',
        );
      }
    }
  });
});

/**
 * Everything above tests functions the panel is supposed to call. Nothing in a
 * `.tsx` file is testable in this app, so what the panel actually calls is
 * pinned by reading its source, the same mechanism
 * `src/routes/-internal-links.test.ts` and `src/core/hive-layer-consumers.test.ts`
 * already use. Without this, inlining the old expression back into the editor
 * leaves every test above green while the select renders blank again.
 */
describe('the editor renders through these', () => {
  const path = join(__dirname, 'components', 'config-editor.tsx');
  const sf = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  /** Every function called by name in the file. */
  function calledNames(): Set<string> {
    const names = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        names.add(node.expression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return names;
  }

  /** The expressions given to a JSX attribute of this name. */
  function jsxAttributeValues(name: string): string[] {
    const values: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && node.name.getText(sf) === name) {
        values.push(node.initializer?.getText(sf) ?? '');
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return values;
  }

  it.each([
    'displayedBooleanValue',
    'displayedSelectValue',
    'displayedStringValue',
    'getSectionIcon',
  ])('calls %s', (name) => {
    expect(calledNames()).toContain(name);
  });

  /**
   * The cap belongs on the input, not only in the field table: the resolver
   * cuts the label at render and never corrects what was stored, and the
   * document as a whole is capped on the wire.
   */
  it('caps a text input at the field maxLength', () => {
    expect(jsxAttributeValues('maxLength')).toContain('{field.maxLength}');
  });
});

/**
 * The panel and the site have to agree about a value the site accepted.
 *
 * `resolveFontPreset` trims and lower-cases, so a hand-written `"Classic"`
 * renders the Classic pairing. Matching the options exactly would show
 * "Theme default" next to a site using Classic fonts, and the owner would be
 * reading a control that describes a state the site is not in. Managed tenants
 * cannot reach this, since they can only pick from the list, but a self-hoster
 * writes config.json by hand.
 */
describe('a select whose resolver normalizes', () => {
  const fontPreset: ConfigField = {
    label: 'Fonts',
    type: 'select',
    options: [
      { value: '', label: 'Theme default' },
      { value: 'classic', label: 'Classic' },
      { value: 'modern', label: 'Modern' },
    ],
    default: '',
    normalizesCase: true,
  };

  it('shows the canonical option for a differently spelled stored value', () => {
    expect(displayedSelectValue(fontPreset, ' Classic ')).toBe('classic');
    expect(displayedSelectValue(fontPreset, 'MODERN')).toBe('modern');
  });

  it('still falls back for a value no option matches', () => {
    expect(displayedSelectValue(fontPreset, 'banana')).toBe('');
  });

  /**
   * The leniency is per field, not a rule for every select. `oneOf` in
   * core/hive-layer matches with a bare `includes`, so a Hive layer select
   * showing "off" for a stored "Off" would claim a state the site rejected.
   */
  it('does not leak leniency to selects that did not ask for it', () => {
    const strict: ConfigField = {
      label: 'Show Hive activity to readers',
      type: 'select',
      options: [
        { value: 'off', label: 'Off' },
        { value: 'standard', label: 'Standard' },
      ],
      default: 'off',
    };
    expect(displayedSelectValue(strict, 'Standard')).toBe('off');
  });
});

/**
 * A bare text field accepted `banana`, saved it, and the site kept the template
 * colour with nothing said. The save succeeded, so the natural reading was that
 * the feature was broken.
 *
 * Everything here is checked against `parseHexColor`, the function the
 * appearance engine itself uses, rather than against a second regex. A panel
 * with its own opinion about the same string is how the panel and the site come
 * to disagree.
 */
describe('color input', () => {
  it('says nothing about a value the engine accepts', () => {
    for (const accepted of ['#0969da', '#abc', '#ABC', '  #0969da  ']) {
      expect(colorInputMessage(accepted), accepted).toBeNull();
    }
  });

  it('warns about anything the engine will not apply', () => {
    for (const rejected of ['banana', '#12', '#0969d', 'rgb(1,2,3)', '0969da']) {
      const note = colorInputMessage(rejected);
      expect(note?.invalid, rejected).toBe(true);
    }
  });

  /**
   * Alpha is refused by the engine on purpose: a translucent fill is a
   * readability hole no contrast correction can close. The panel has to refuse
   * it too, or it silently accepts a colour the site drops.
   */
  it('warns about an alpha hex, which the engine refuses', () => {
    expect(colorInputMessage('#0969daff')?.invalid).toBe(true);
  });

  /** Empty is a real state, not an error: it means the template's own colour. */
  it('explains empty rather than flagging it', () => {
    const note = colorInputMessage('');
    expect(note?.invalid).toBe(false);
    expect(note?.message).toBe(COLOR_UNSET_HINT);
    expect(colorInputMessage('   ')?.invalid).toBe(false);
  });

  /**
   * The warning has to say what happens, because what happens is the confusing
   * part: the save succeeds and the site does not change.
   */
  it('says what the site will do with a value it refuses', () => {
    expect(colorInputMessage('banana')?.message).toMatch(/template/i);
  });

  /**
   * Agreement with the engine, asserted as a property over both rather than as
   * two lists someone kept in step.
   */
  it.each([
    '#0969da',
    '#abc',
    'banana',
    '',
    '#0969daff',
    'rgb(0,0,0)',
    '#GGGGGG',
  ])('flags %s exactly when the engine refuses it', (text) => {
    const engineAccepts = parseHexColor(text) !== null;
    const panelFlags = colorInputMessage(text)?.invalid === true;
    // Empty is the one value that is neither accepted nor an error.
    if (text.trim() === '') {
      expect(panelFlags).toBe(false);
      return;
    }
    expect(panelFlags).toBe(!engineAccepts);
  });
});

describe('color swatch value', () => {
  /** `<input type="color">` only accepts `#rrggbb`, so `#abc` has to expand. */
  it('expands a short hex the native control cannot take', () => {
    expect(colorPickerValue('#abc')).toBe('#aabbcc');
  });

  it('passes a full hex through, lower-cased and trimmed', () => {
    expect(colorPickerValue('  #0969DA ')).toBe('#0969da');
  });

  /**
   * The swatch has no empty state, so it needs something concrete. Displaying
   * it must not write it: a value reaches the document only through onChange,
   * so an owner who opens the panel and saves without touching the swatch
   * stores nothing.
   */
  it('falls back for unset and unparseable values without inventing one', () => {
    expect(colorPickerValue('')).toBe('#888888');
    expect(colorPickerValue('banana')).toBe('#888888');
    expect(colorPickerValue('', '#123456')).toBe('#123456');
  });
});

/**
 * That the renderer actually uses the validation above.
 *
 * Every test in this file passed with the entire `case 'color'` block deleted
 * from `config-editor.tsx`, which is the whole point of the change: the helpers
 * being correct means nothing if the panel does not call them. Nothing in a
 * `.tsx` is renderable under this runner, so the call is what can be asserted,
 * and here the call IS the mechanism.
 */
describe('the editor renders colour fields with the shared validation', () => {
  const EDITOR = join(__dirname, 'components', 'config-editor.tsx');

  function calledFunctions(source: string): Set<string> {
    const file = ts.createSourceFile(
      'config-editor.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const called = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        called.add(node.expression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return called;
  }

  it('handles the color type and uses both helpers', () => {
    const source = readFileSync(EDITOR, 'utf8');
    const called = calledFunctions(source);

    expect(source).toContain("case 'color'");
    // The message, or an invalid value is stored with nothing said.
    expect(called).toContain('colorInputMessage');
    // The swatch value, or the native control gets a string it cannot take.
    expect(called).toContain('colorPickerValue');
  });
});

/**
 * That the text input actually calls `field.validate`.
 *
 * The validators being correct is not the property; the renderer invoking them
 * is. This is the third time in this series that every behaviour test passed
 * while the call site was wrong, so it is asserted directly rather than assumed
 * from the helpers being right.
 */
describe('the editor runs string validators', () => {
  const EDITOR = join(__dirname, 'components', 'config-editor.tsx');

  it('calls field.validate in the text branch', () => {
    const source = readFileSync(EDITOR, 'utf8');
    const file = ts.createSourceFile(
      'config-editor.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const argumentLists: string[][] = [];
    const visit = (node: ts.Node): void => {
      // `field.validate?.(...)` parses as a call whose expression is the
      // property access, so match on the accessed name.
      if (ts.isCallExpression(node)) {
        const target = node.expression;
        const text = ts.isPropertyAccessExpression(target)
          ? target.name.text
          : ts.isNonNullExpression(target) || ts.isParenthesizedExpression(target)
            ? ''
            : '';
        if (text === 'validate') {
          argumentLists.push(node.arguments.map((a) => a.getText(file)));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);

    expect(argumentLists.length).toBeGreaterThan(0);

    // With the value AND the whole document. Asserting only that the call
    // happens let the document argument be dropped silently, which turns every
    // rule about a combination of fields into a rule about one field: the
    // community-mode composer check then reads as though it were a blog.
    for (const args of argumentLists) {
      expect(args).toHaveLength(2);
      expect(args[1]).toBe('root');
    }
  });
});
