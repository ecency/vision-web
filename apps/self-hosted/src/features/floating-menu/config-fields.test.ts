import { describe, expect, it } from 'vitest';
import {
  HIVE_LAYER_CONFIG_DEFAULTS,
  PAYOUT_LABEL_MAX_LENGTH,
  resolveHiveLayer,
  resolveLearnMoreUrl,
} from '@/core/hive-layer';
import {
  FONT_PRESET_OPTIONS,
  resolveFontPreset,
} from '@/core/theme-appearance';
import { AUTH_METHODS } from '@/features/auth/utils/auth-methods';
import { resolveCreatePostTarget } from '@/features/auth/utils/create-post-target';
import type { ConfigField } from './config-fields';
import { translations } from '@/core/i18n-strings';
import { buildConfigFields,
  isFieldVisible,
  pickFields,
} from './config-fields';

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
import { displayedSelectValue } from './field-display';

/** The field at a config path, or undefined when the editor does not offer it. */
function fieldAt(path: readonly string[]): ConfigField | undefined {
  let fields: Record<string, ConfigField> | undefined = configFieldsMap;
  let field: ConfigField | undefined;

  for (const key of path) {
    field = fields?.[key];
    if (!field) return undefined;
    fields = field.fields;
  }

  return field;
}

const CLIENT_ID_PATH = [
  'configuration',
  'general',
  'hivesigner',
  'clientId',
] as const;
const METHODS_PATH = [
  'configuration',
  'instanceConfiguration',
  'features',
  'auth',
  'methods',
] as const;

/**
 * Without this the setting exists only in the JSON document, which an owner on
 * managed hosting has no way to reach, so Hivesigner login could be configured
 * and never switched on.
 */
describe('hivesigner client id', () => {
  it('is offered in the editor, at the path the app reads', () => {
    expect(fieldAt(CLIENT_ID_PATH)).toBeDefined();
  });

  /**
   * A text input. The number input writes null when cleared, and null erases
   * the stored section on merge.
   */
  it('is a text field', () => {
    expect(fieldAt(CLIENT_ID_PATH)?.type).toBe('string');
  });

  it('gives both routes to a working setup', () => {
    const description = fieldAt(CLIENT_ID_PATH)?.description ?? '';

    // Route one: the owner registers an app themselves.
    expect(description).toContain('register your own');
    // Route two: only Ecency can register this site on the shared app.
    expect(description).toContain('hello@ecency.com');
    expect(description).toContain('ecency.app');
  });

  /**
   * A managed tenant's client id is written by the registration job, not by the
   * owner, so copy telling them to set it themselves describes work they will
   * never do and a login they will believe is broken until they do it.
   *
   * Asserted on the field an owner actually reads rather than on the job, because
   * the job being right is what makes this text wrong: the two drifted apart once
   * already, with the editor promising a manual step the reconcile had removed.
   */
  it('says the hosted case is automatic, and that an own id survives it', () => {
    const description = fieldAt(CLIENT_ID_PATH)?.description ?? '';

    expect(description).toMatch(/hosted by Ecency/i);
    expect(description).toMatch(/filled in for you|automatically/i);
    // The reconcile leaves a non-shared value alone; the owner has to be told so,
    // or setting their own app reads as a change something else may undo.
    expect(description).toMatch(/never overwritten|not be overwritten/i);
  });

  /**
   * The email route is only half an instruction. Nothing writes the field on a
   * self-hosted instance: the reconcile iterates the hosting database, so an
   * owner who emails us and waits sees the button stay hidden for a step that
   * was never going to happen on its own.
   *
   * `gives both routes to a working setup` does not cover this. It asserts the
   * three substrings are present, and they all were in a revision that had
   * dropped the save step, which is how this shipped for review.
   */
  it('tells a self-hoster taking the email route to save ecency.app themselves', () => {
    const description = fieldAt(CLIENT_ID_PATH)?.description ?? '';

    expect(description).toMatch(/self-hosted/i);
    expect(description).toMatch(/put ecency\.app here/i);
  });

  it('is pointed at from the login methods field', () => {
    expect(fieldAt(METHODS_PATH)?.description).toContain('Hivesigner');
  });
});

const FEATURES_PATH = [
  'configuration',
  'instanceConfiguration',
  'features',
] as const;
const HIVE_PATH = [...FEATURES_PATH, 'hive'] as const;

/**
 * The Hive layer resolves entirely from `features.hive`, and until these
 * controls existed the only way to set it was a hand-written PATCH.
 *
 * Everything here is checked against the resolver rather than against a copy of
 * its values, because a panel offering a value the app does not resolve, or
 * defaulting to a different one, is worse than no panel: it reports a state the
 * site disagrees with.
 */
describe('hive layer', () => {
  it('is offered as a section under features', () => {
    expect(fieldAt(HIVE_PATH)?.type).toBe('section');
  });

  /** `getSectionIcon` matches on the label, so this is what picks the glyph. */
  it('is labelled Hive layer', () => {
    expect(fieldAt(HIVE_PATH)?.label).toBe('Hive layer');
  });

  it('is the first section an owner meets under features', () => {
    const sections = Object.entries(fieldAt(FEATURES_PATH)?.fields ?? {})
      .filter(([, field]) => field.type === 'section')
      .map(([key]) => key);
    expect(sections[0]).toBe('hive');
  });

  it('offers a control for every key the resolver reads, and no others', () => {
    expect(Object.keys(fieldAt(HIVE_PATH)?.fields ?? {}).sort()).toEqual(
      Object.keys(HIVE_LAYER_CONFIG_DEFAULTS).sort(),
    );
  });

  /**
   * No `number`, because the number input writes null when cleared, and no
   * `array`, because `isValidArrayReplacement` in the hosting API drops an
   * array holding objects while the save still answers 200.
   */
  it('uses only selects and text inputs', () => {
    for (const key of Object.keys(HIVE_LAYER_CONFIG_DEFAULTS)) {
      expect(['select', 'string'], key).toContain(
        fieldAt([...HIVE_PATH, key])?.type,
      );
    }
  });

  it('defaults every control to what the resolver reads for an absent key', () => {
    for (const [key, expected] of Object.entries(HIVE_LAYER_CONFIG_DEFAULTS)) {
      expect(fieldAt([...HIVE_PATH, key])?.default, key).toBe(expected);
    }
  });

  it('lists the default first on every select', () => {
    for (const key of Object.keys(HIVE_LAYER_CONFIG_DEFAULTS)) {
      const field = fieldAt([...HIVE_PATH, key]);
      if (field?.type !== 'select') continue;
      expect(field.options?.[0]?.value, key).toBe(field.default);
    }
  });

  it('offers only values the resolver accepts as given', () => {
    const readerLayers = fieldAt([...HIVE_PATH, 'readerLayer'])?.options ?? [];
    expect(readerLayers.map((option) => option.value)).toEqual([
      'off',
      'standard',
      'full',
    ]);
    for (const { value } of readerLayers) {
      const resolved = resolveHiveLayer({
        features: { hive: { readerLayer: value } },
        composerIsInternal: true,
      });
      // An option the resolver downgrades would be a posture the owner picked
      // and did not get.
      expect(resolved.readerLayer, value).toBe(value);
    }

    const rewards = fieldAt([...HIVE_PATH, 'authorRewards'])?.options ?? [];
    expect(rewards.map((option) => option.value)).toEqual(['off', 'author']);
    for (const { value } of rewards) {
      const resolved = resolveHiveLayer({
        features: { hive: { authorRewards: value } },
        composerIsInternal: true,
      });
      expect(resolved.authorRewards, value).toBe(value);
    }
  });

  /**
   * The resolver cuts this label at render and never corrects what is stored,
   * so the input has to stop at the same place or an owner stores text that is
   * never shown, in a document capped at 64KB as a whole.
   */
  it('caps the earnings label where the resolver cuts it', () => {
    expect(fieldAt([...HIVE_PATH, 'payoutLabel'])?.maxLength).toBe(
      PAYOUT_LABEL_MAX_LENGTH,
    );
  });

  it('says what an empty earnings label and an empty link mean', () => {
    expect(fieldAt([...HIVE_PATH, 'payoutLabel'])?.description).toContain(
      'Leave empty',
    );
    expect(fieldAt([...HIVE_PATH, 'learnMoreUrl'])?.description).toContain(
      'Leave empty',
    );
  });

  /** House rule, and these strings are read by owners, not developers. */
  it('uses no em or en dashes in its copy', () => {
    const section = fieldAt(HIVE_PATH);
    const copy = [
      section?.label,
      section?.description,
      ...Object.values(section?.fields ?? {}).flatMap((field) => [
        field.label,
        field.description,
        ...(field.options ?? []).map((option) => option.label),
      ]),
    ].join(' ');
    expect(copy).not.toMatch(/[—–]/);
  });
});

describe('login methods', () => {
  /** A list of names, never objects: the hosting API drops those and reports success. */
  it('stays a list', () => {
    expect(fieldAt(METHODS_PATH)?.type).toBe('array');
  });

  it('accepts only the methods the app can serve', () => {
    expect(fieldAt(METHODS_PATH)?.allowedValues).toEqual(AUTH_METHODS);
  });
});

const ACCENT_PATH = [
  'configuration',
  'general',
  'styles',
  'accent',
] as const;
const FONT_PRESET_PATH = [
  'configuration',
  'general',
  'styles',
  'fontPreset',
] as const;

/**
 * `apply-config-dom` has read `configuration.general.styles.accent` and
 * `.fontPreset` since the appearance work shipped, and `theme-appearance`
 * derives the palette and type scale from them. The editor described neither,
 * so the only way to set either was to write the config document by hand, which
 * no owner does. The engine and the panel disagreeing that way is invisible:
 * everything is green, every instance just silently keeps the default.
 *
 * The path strings below are the contract. They have to stay equal to the ones
 * in `apply-config-dom`'s PATHS, which is module-private, so this asserts the
 * editor side and the appearance tests assert the reader side.
 */
describe('appearance knobs', () => {
  it('offers the accent where the appearance engine reads it', () => {
    expect(fieldAt(ACCENT_PATH)).toBeDefined();
  });

  /**
   * Text, never `number`. The number input writes null when cleared and null
   * erases the stored section on merge, which would take `background` and the
   * font preset out with it.
   */
  it('takes the accent as a color field, which writes text', () => {
    // Pinned exactly: a regression to a bare `string` would drop the swatch
    // and the inline validation while every other guard stayed green, because
    // the orphaned `case 'color'` block would keep the call-site test passing.
    // `color` writes strings, so the invariant this test has always been about
    // holds too: never `number`, whose input writes null when cleared, and
    // null erases the whole stored styles section on merge, taking
    // `background` and the font preset with it.
    expect(fieldAt(ACCENT_PATH)?.type).toBe('color');
  });

  it('offers the font preset where the appearance engine reads it', () => {
    expect(fieldAt(FONT_PRESET_PATH)).toBeDefined();
  });

  /**
   * The exported list itself, not a hand-copied one. A second list here would
   * drift from the presets the engine can actually resolve, and an owner would
   * pick a pairing that silently resolves to null.
   */
  it('offers exactly the presets the engine can resolve', () => {
    expect(fieldAt(FONT_PRESET_PATH)?.options).toEqual([
      ...FONT_PRESET_OPTIONS,
    ]);
  });

  /**
   * Every instance currently stores no preset, so the panel has to have a value
   * that means that, and it has to be reachable again after a change. Without
   * the empty entry the first selection is permanent.
   */
  it('keeps a way back to the template default', () => {
    const options = fieldAt(FONT_PRESET_PATH)?.options ?? [];
    expect(options.some((option) => option.value === '')).toBe(true);
    expect(fieldAt(FONT_PRESET_PATH)?.default).toBe('');
  });
});

/**
 * Tied to the real field and the real resolver, not a fixture.
 *
 * field-display.test.ts proves the mechanism with a local select, which would
 * keep passing if `normalizesCase` were dropped from the field itself. This is
 * the assertion that fails in that case: for any spelling the engine resolves,
 * the panel has to show the matching option rather than falling back to
 * "Theme default" and describing a site that is not what the reader sees.
 */
describe('font preset panel agrees with the engine', () => {
  const FONT_PRESET_PATH_REAL = [
    'configuration',
    'general',
    'styles',
    'fontPreset',
  ] as const;

  it.each([' Classic ', 'MODERN', 'Editorial'])(
    'shows a real option for %s, which the engine resolves',
    (stored) => {
      // Guard the premise: if the engine stopped resolving these, the panel
      // falling back would be correct and this test would be asserting nothing.
      expect(resolveFontPreset(stored)).not.toBeNull();

      const field = fieldAt(FONT_PRESET_PATH_REAL);
      if (!field) throw new Error('no font preset field');
      const shown = displayedSelectValue(field, stored);

      expect(shown).not.toBe('');
      expect(shown).toBe(stored.trim().toLowerCase());
    },
  );
});

/**
 * Inline validation for `string` fields.
 *
 * The colour field got its own surface in #1358; every other text field still
 * accepted anything, stored it, and let the site quietly ignore it. Two fields
 * have a resolver that genuinely refuses a value, and both fail the same way:
 * the save succeeds and the site keeps doing what it did before.
 *
 * Each rule is checked AGAINST the resolver that owns it, never against a
 * second copy of the rule, so the panel cannot warn about something the site
 * accepts or accept something the site drops.
 */
describe('string field validation', () => {
  const LEARN_MORE_PATH = [
    'configuration',
    'instanceConfiguration',
    'features',
    'hive',
    'learnMoreUrl',
  ] as const;
  const CREATE_POST_PATH = [
    'configuration',
    'general',
    'createPostUrl',
  ] as const;

  describe('learn more link', () => {
    const validate = (value: string) =>
      fieldAt(LEARN_MORE_PATH)?.validate?.(value) ?? null;

    it('has a validator at all', () => {
      expect(fieldAt(LEARN_MORE_PATH)?.validate).toBeTypeOf('function');
    });

    it('says nothing about a link the resolver will use', () => {
      for (const ok of ['https://hive.io', 'http://example.com/x']) {
        expect(resolveLearnMoreUrl(ok), ok).not.toBeNull();
        expect(validate(ok), ok).toBeNull();
      }
    });

    /**
     * `javascript:` is the one that matters: the value becomes an href, and the
     * resolver refuses it so it cannot reach the DOM. The panel accepting it
     * silently would suggest the site had taken it.
     */
    it('warns about anything the resolver refuses', () => {
      for (const bad of ['hive.io', '/relative', 'javascript:alert(1)']) {
        expect(resolveLearnMoreUrl(bad), bad).toBeNull();
        expect(validate(bad), bad).not.toBeNull();
      }
    });

    it('treats empty as the documented "plain text" state, not an error', () => {
      expect(validate('')).toBeNull();
      expect(validate('   ')).toBeNull();
    });

    it('flags exactly what the resolver refuses, as a property', () => {
      const samples = [
        'https://hive.io',
        'hive.io',
        'javascript:alert(1)',
        'http://a.b',
        '/x',
        'ftp://a.b',
      ];
      for (const sample of samples) {
        const refused = resolveLearnMoreUrl(sample) === null;
        expect(validate(sample) !== null, sample).toBe(refused);
      }
    });
  });

  describe('create post url', () => {
    const validate = (value: string) =>
      fieldAt(CREATE_POST_PATH)?.validate?.(value) ?? null;

    it('has a validator at all', () => {
      expect(fieldAt(CREATE_POST_PATH)?.validate).toBeTypeOf('function');
    });

    /**
     * Empty and the legacy defaults all mean the built-in editor deliberately.
     * Flagging them would tell an owner something is wrong with a setting the
     * product documents as the normal one.
     */
    it('says nothing about the values that mean the built-in editor', () => {
      for (const internal of [
        '',
        '   ',
        '/publish',
        'https://ecency.com/publish',
        'https://ecency.com/submit',
      ]) {
        expect(
          resolveCreatePostTarget({
            createPostUrl: internal,
            isCommunityMode: false,
          }).kind,
          internal,
        ).toBe('internal');
        expect(validate(internal), internal).toBeNull();
      }
    });

    it('says nothing about a composer the site will open', () => {
      const external = 'https://example.com/write';
      expect(
        resolveCreatePostTarget({
          createPostUrl: external,
          isCommunityMode: false,
        }).kind,
      ).toBe('external');
      expect(validate(external)).toBeNull();
    });

    /**
     * The case that was silent: a refused address falls back to the built-in
     * editor, so the owner who asked for an external composer got the internal
     * one and no reason.
     */
    it('warns about an address that silently falls back', () => {
      for (const bad of ['example.com/write', 'javascript:alert(1)', 'notaurl']) {
        expect(
          resolveCreatePostTarget({
            createPostUrl: bad,
            isCommunityMode: false,
          }).kind,
          bad,
        ).toBe('internal');
        expect(validate(bad), bad).not.toBeNull();
      }
    });
  });

  /**
   * A validator on a field the editor renders as something other than a text
   * input would never run. The colour field has its own surface and must not
   * grow a second one.
   */
  it('only puts validators on string fields', () => {
    const withValidator: string[] = [];
    const visit = (
      fields: Record<string, ConfigField>,
      path: string[],
    ): void => {
      for (const [key, field] of Object.entries(fields)) {
        if (field.validate) withValidator.push(`${[...path, key].join('.')}:${field.type}`);
        if (field.fields) visit(field.fields, [...path, key]);
      }
    };
    visit(configFieldsMap, []);

    expect(withValidator.length).toBeGreaterThan(0);
    for (const entry of withValidator) {
      expect(entry.endsWith(':string'), entry).toBe(true);
    }
  });
});


/**
 * The composer rule depends on the instance TYPE, not just the value.
 *
 * A community instance ignores this field entirely, valid address or not: the
 * built-in editor carries the community target, which an external composer
 * would lose. So the owner most likely to set it is the one it does nothing
 * for, and before this they got no composer and no explanation.
 *
 * This is why `validate` takes the whole document. The instance type lives in a
 * different branch of the tree from the field being validated.
 */
describe('create post url on a community instance', () => {
  const CREATE_POST_PATH = [
    'configuration',
    'general',
    'createPostUrl',
  ] as const;

  const doc = (type: string, communityId?: string) => ({
    configuration: {
      instanceConfiguration: {
        type,
        ...(communityId === undefined ? {} : { communityId }),
      },
    },
  });

  const validate = (value: string, config?: unknown) =>
    fieldAt(CREATE_POST_PATH)?.validate?.(
      value,
      config as Record<string, never>,
    ) ?? null;

  it('says the address is unused, even when it is a valid one', () => {
    const note = validate(
      'https://example.com/write',
      doc('community', 'hive-125125'),
    );
    expect(note).not.toBeNull();
    expect(note).toMatch(/built-in editor/i);
  });

  /**
   * Different sentence from the blog-mode one. "Not a web address" would be a
   * lie here: the address is fine, the instance type is what ignores it.
   */
  it('does not call a valid address invalid', () => {
    const note = validate(
      'https://example.com/write',
      doc('community', 'hive-125125'),
    );
    expect(note).not.toMatch(/not a web address/i);
  });

  /**
   * Typed community with no id is a blog everywhere else in the app, so the
   * blog rule applies and a valid address is honoured.
   */
  it('treats a community with no id as a blog, like the rest of the app', () => {
    expect(validate('https://example.com/write', doc('community'))).toBeNull();
    expect(validate('https://example.com/write', doc('community', ''))).toBeNull();
  });

  it('still flags a refused address on a blog instance', () => {
    expect(validate('example.com/write', doc('blog'))).toMatch(
      /not a web address/i,
    );
  });

  /** Empty means the built-in editor everywhere, and is never an error. */
  it('says nothing about an empty value on either kind', () => {
    expect(validate('', doc('community', 'hive-1'))).toBeNull();
    expect(validate('', doc('blog'))).toBeNull();
  });

  /**
   * The document is optional on the hook. Without it the field falls back to
   * the blog rule rather than throwing, since that is what a config with no
   * instance type resolves to.
   */
  it('falls back to the blog rule when handed no document', () => {
    expect(validate('https://example.com/write')).toBeNull();
    expect(validate('example.com/write')).toMatch(/not a web address/i);
  });
});

/**
 * The panel must not offer a control that can blank the whole site.
 *
 * `configuration-loader` applies a served config only when
 * `runtimeConfig?.version` is truthy. The editor's number input writes `null`
 * when cleared, and `version` was the one field using it, so an owner who
 * emptied that box shipped `version: null` and every visitor's browser then
 * discarded the entire document and rendered the bare skeleton: no title, no
 * logo, no theme, default everything.
 *
 * A schema version is not an owner setting. The value still rides along in the
 * saved document, which goes out whole, so removing the control loses nothing.
 */
describe('fields that must not be editable', () => {
  it('offers no control for the config version', () => {
    expect(fieldAt(['version'])).toBeUndefined();
  });

  /**
   * The general rule, not just the one field. Asserted over the whole map
   * because the hazard is the input type rather than the path: null erases the
   * stored section on merge wherever it lands.
   */
  it('offers no number input anywhere', () => {
    const numeric: string[] = [];
    const visit = (
      fields: Record<string, ConfigField>,
      path: string[],
    ): void => {
      for (const [key, field] of Object.entries(fields)) {
        if ((field.type as string) === 'number') {
          numeric.push([...path, key].join('.'));
        }
        if (field.fields) visit(field.fields, [...path, key]);
      }
    };
    visit(configFieldsMap, []);

    expect(numeric).toEqual([]);
  });
});

/**
 * Every label and description resolves to real copy.
 *
 * `t()` returns the KEY when it has no entry, so a typo or a key added to the
 * panel but not to `en` renders as `panel_configuration_general_styles_accent_label`
 * in the settings panel and nothing throws. That is the failure mode this whole
 * change introduces, so it is the one worth pinning.
 */
describe('panel copy resolves', () => {
  /** Every string the built map puts on screen, with the path that produced it. */
  function copyStrings(): Array<{ path: string; value: string }> {
    const found: Array<{ path: string; value: string }> = [];
    const visit = (fields: Record<string, ConfigField>, path: string[]): void => {
      for (const [key, field] of Object.entries(fields)) {
        const here = [...path, key].join('.');
        found.push({ path: `${here}.label`, value: field.label });
        // `!== undefined`, not truthiness: an empty description is exactly
        // what the blank check below exists to catch, and skipping it hid one.
        if (field.description !== undefined) {
          found.push({ path: `${here}.description`, value: field.description });
        }
        for (const option of field.options ?? []) {
          found.push({ path: `${here}.option`, value: option.label });
        }
        if (field.fields) visit(field.fields, [...path, key]);
      }
    };
    visit(configFieldsMap, []);
    return found;
  }

  it('finds the strings to check', () => {
    // Guards the reader: an empty list would make everything below vacuous.
    expect(copyStrings().length).toBeGreaterThan(100);
  });

  it('shows no raw translation key', () => {
    const unresolved = copyStrings()
      .filter(({ value }) => /^panel_[a-z0-9_]+$/.test(value))
      .map(({ path }) => path);
    expect(unresolved).toEqual([]);
  });

  it('leaves nothing blank', () => {
    const blank = copyStrings()
      .filter(({ value }) => value.trim() === '')
      .map(({ path }) => path);
    expect(blank).toEqual([]);
  });

  /**
   * Which KEYS the panel asks for, recorded by the translator itself.
   *
   * The first version of this compared rendered English values, and that has a
   * blind spot the en table walks straight into: "Enabled" is the value of ten
   * different keys, and "Off", "Post" and "Button Label" repeat too. An
   * orphaned key whose text happens to match a live one would have counted as
   * used. Recording the key at lookup time cannot collide, and it catches the
   * reverse case as well, a key the panel asks for that `en` never declares.
   */
  function requestedKeys(): Set<string> {
    const asked = new Set<string>();
    const fields = buildConfigFields((key) => {
      asked.add(key);
      return translations.en[key] ?? key;
    });

    /*
     * Validators are closures, so building the map does not run them and their
     * keys looked orphaned. Exercising them is not a workaround for the test:
     * an unresolvable key in a validation message is exactly as broken as one
     * in a label, and it only shows once someone types something wrong.
     *
     * Inputs chosen to reach every branch: refused, accepted, empty, and a
     * community document, whose message differs from the blog one.
     */
    const community = {
      configuration: {
        instanceConfiguration: { type: 'community', communityId: 'hive-1' },
      },
    } as unknown as Record<string, never>;

    const runValidators = (map: Record<string, ConfigField>): void => {
      for (const field of Object.values(map)) {
        for (const input of ['', 'not a url', 'https://example.com/x']) {
          field.validate?.(input);
          field.validate?.(input, community);
        }
        if (field.fields) runValidators(field.fields);
      }
    };
    runValidators(fields);

    return asked;
  }

  const declaredPanelKeys = () =>
    Object.keys(translations.en).filter((k) => k.startsWith('panel_'));

  it('declares a key for everything the panel asks for', () => {
    const declared = new Set(declaredPanelKeys());
    const missing = [...requestedKeys()].filter((k) => !declared.has(k));
    expect(missing).toEqual([]);
  });

  it('declares no panel key the panel never asks for', () => {
    const asked = requestedKeys();
    const declared = declaredPanelKeys();
    expect(declared.length).toBeGreaterThan(100);
    expect(declared.filter((k) => !asked.has(k))).toEqual([]);
  });
});

/**
 * What the other locales currently do with the panel, stated rather than
 * implied.
 *
 * `t()` falls back `language -> en -> key`, so a Spanish owner sees the panel
 * in English until someone who speaks Spanish writes these. That is the
 * deliberate state: machine-translating a hundred and forty settings labels
 * would read as translated while being unverified, and a wrong label on a
 * control that changes a live site is worse than an English one.
 *
 * This test is a ratchet, not a rule. When a locale gains panel keys it starts
 * failing, which is the prompt to move it to the translated list rather than a
 * reason to delete the translations.
 */
describe('panel translations, per locale', () => {
  const panelKeys = (locale: string) =>
    Object.keys(translations[locale] ?? {}).filter((k) => k.startsWith('panel_'));

  it('is complete in English', () => {
    expect(panelKeys('en').length).toBeGreaterThan(100);
  });

  // Derived, so a seventh locale added later is covered without anyone
  // remembering to add it here.
  const otherLocales = Object.keys(translations).filter((l) => l !== 'en');

  it('finds the locales to check', () => {
    expect(otherLocales.length).toBeGreaterThan(3);
  });

  it.each(otherLocales)(
    '%s has no panel keys yet, so it falls back to English',
    (locale) => {
      // The locale itself is still shipped and still translated for everything
      // else; this is only about the settings panel.
      expect(Object.keys(translations[locale] ?? {}).length).toBeGreaterThan(50);
      expect(panelKeys(locale)).toEqual([]);
    },
  );
});

describe('isFieldVisible (the visibleWhen capability)', () => {
  type Document = Record<string, import('./types').ConfigValue>;

  function documentWithTemplate(styleTemplate: string): Document {
    return {
      configuration: { general: { styleTemplate } },
    } as unknown as Document;
  }

  function templateOf(document: Document): unknown {
    const configuration = document.configuration as
      | { general?: { styleTemplate?: unknown } }
      | undefined;
    return configuration?.general?.styleTemplate;
  }

  const doc = documentWithTemplate('magazine');

  it('a field with no predicate is always visible', () => {
    const field: ConfigField = { label: 'X', type: 'string' };
    expect(isFieldVisible(field, doc)).toBe(true);
  });

  /**
   * The real field, not a stand-in. A community sidebar shows subscribers and
   * authors and never a following count, so the toggle has nothing to govern
   * there and must hide rather than sit inert (#1480). The other two sidebar
   * toggles DO have counterparts in that tree and stay visible, which is the
   * half that proves the gate is scoped rather than blanket.
   */
  describe('the sidebar Following toggle, per instance type', () => {
    const SIDEBAR = [
      'configuration',
      'instanceConfiguration',
      'layout',
      'sidebar',
    ] as const;

    function documentFor(
      type: string,
      communityId: string,
    ): Record<string, import('./types').ConfigValue> {
      return {
        configuration: {
          general: { styleTemplate: 'medium' },
          instanceConfiguration: { type, communityId },
        },
      } as unknown as Record<string, import('./types').ConfigValue>;
    }

    const blog = documentFor('blog', '');
    const community = documentFor('community', 'hive-125125');

    it('hides on a community instance and shows on a blog', () => {
      const following = fieldAt([...SIDEBAR, 'following']);
      expect(following).toBeDefined();
      expect(isFieldVisible(following!, community)).toBe(false);
      expect(isFieldVisible(following!, blog)).toBe(true);
    });

    it('leaves the toggles a community CAN serve visible', () => {
      for (const key of ['followers', 'hiveInformation']) {
        const field = fieldAt([...SIDEBAR, key]);
        expect(field, key).toBeDefined();
        expect(isFieldVisible(field!, community), key).toBe(true);
      }
    });

    it('treats a community type with no id as a blog, like every other caller', () => {
      // isCommunityInstance requires BOTH, so a half-configured document keeps
      // the toggle rather than hiding a control the instance still honours.
      const halfConfigured = documentFor('community', '');
      const following = fieldAt([...SIDEBAR, 'following']);
      expect(isFieldVisible(following!, halfConfigured)).toBe(true);
    });
  });

  it('the predicate decides against the WHOLE document', () => {
    const onlyMagazine: ConfigField = {
      label: 'X',
      type: 'select',
      visibleWhen: (document) => templateOf(document) === 'magazine',
    };
    expect(isFieldVisible(onlyMagazine, doc)).toBe(true);
    expect(isFieldVisible(onlyMagazine, documentWithTemplate('medium'))).toBe(false);
  });

  it('a throwing predicate hides nothing (no panel lockout)', () => {
    const broken: ConfigField = {
      label: 'X',
      type: 'string',
      visibleWhen: () => {
        throw new Error('boom');
      },
    };
    expect(isFieldVisible(broken, doc)).toBe(true);
  });
});

describe('theme-gated layout options', () => {
  const fields = buildConfigFields((key) => key);
  // Typed walk down the section tree; a missing level fails the suite loudly
  // instead of hiding behind a cast.
  function sectionFields(field: ConfigField | undefined, name: string) {
    if (!field?.fields) throw new Error(`section ${name} has no fields`);
    return field.fields;
  }
  const layout = sectionFields(
    sectionFields(
      sectionFields(fields.configuration, 'configuration').instanceConfiguration,
      'instanceConfiguration',
    ).layout,
    'layout',
  );

  function docWithTemplate(styleTemplate?: string) {
    return {
      configuration: { general: styleTemplate ? { styleTemplate } : {} },
    } as unknown as Record<string, import('./types').ConfigValue>;
  }

  it('hides the sidebar section under every theme that renders no sidebar', () => {
    for (const template of ['journal', 'reader', 'gallery', 'terminal']) {
      expect(isFieldVisible(layout.sidebar, docWithTemplate(template)), template).toBe(false);
    }
  });

  it('shows it for the templates that do render one, and for an unset template', () => {
    for (const template of ['medium', 'minimal', 'magazine', 'developer', 'modern-gradient']) {
      expect(isFieldVisible(layout.sidebar, docWithTemplate(template)), template).toBe(true);
    }
    expect(isFieldVisible(layout.sidebar, docWithTemplate())).toBe(true);
  });

  it('follows the UNSAVED draft, so switching templates in the panel reacts immediately', () => {
    // The predicate reads the edited document, not the applied config.
    expect(isFieldVisible(layout.sidebar, docWithTemplate('journal'))).toBe(false);
    expect(isFieldVisible(layout.sidebar, docWithTemplate('medium'))).toBe(true);
  });
});

describe('pickFields', () => {
  it('prunes to the named subtrees and keeps every ancestor section chrome', () => {
    const picked = pickFields(configFieldsMap, [
      'configuration.general.styles',
      'configuration.instanceConfiguration.meta',
    ]);

    const configuration = picked.configuration;
    expect(configuration?.type).toBe('section');
    expect(configuration?.label).toBe(configFieldsMap.configuration.label);

    const general = configuration?.fields?.general;
    expect(general?.fields?.styles).toBe(
      configFieldsMap.configuration.fields?.general?.fields?.styles,
    );
    // Siblings the pick did not name are gone from the curated view...
    expect(general?.fields?.language).toBeUndefined();
    expect(general?.fields?.styleTemplate).toBeUndefined();

    const instance = configuration?.fields?.instanceConfiguration;
    expect(instance?.fields?.meta).toBeDefined();
    expect(instance?.fields?.features).toBeUndefined();

    // ...and the source tree is untouched, so Advanced still has everything.
    expect(
      configFieldsMap.configuration.fields?.general?.fields?.language,
    ).toBeDefined();
  });

  it('a curation typo contributes nothing rather than throwing', () => {
    expect(pickFields(configFieldsMap, ['configuration.no.such.path'])).toEqual({
      configuration: expect.objectContaining({ type: 'section' }),
    });
    expect(pickFields(configFieldsMap, ['nowhere'])).toEqual({});
  });

  it('the accent field carries its curated swatch row', () => {
    const accent =
      configFieldsMap.configuration.fields?.general?.fields?.styles?.fields
        ?.accent;
    expect(accent?.type).toBe('color');
    expect(accent?.quickPicks?.length).toBeGreaterThan(3);
  });
});
