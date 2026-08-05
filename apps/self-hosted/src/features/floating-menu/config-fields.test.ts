import { describe, expect, it } from 'vitest';
import {
  HIVE_LAYER_CONFIG_DEFAULTS,
  PAYOUT_LABEL_MAX_LENGTH,
  resolveHiveLayer,
} from '@/core/hive-layer';
import { FONT_PRESET_OPTIONS } from '@/core/theme-appearance';
import { AUTH_METHODS } from '@/features/auth/utils/auth-methods';
import type { ConfigField } from './config-fields';
import { configFieldsMap } from './config-fields';

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
  it('takes the accent as text', () => {
    expect(fieldAt(ACCENT_PATH)?.type).toBe('string');
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
