import type { ConfigField } from './config-fields';
import type { ConfigValue } from './types';

/**
 * What the Configuration Editor puts on screen for a field and a section.
 *
 * Pure, and in a `.ts` module rather than inside `config-editor.tsx`, because
 * this app's test runner is `environment: 'node'` with
 * `include: ['src/**\/*.test.ts']`: nothing in a `.tsx` file is testable at all.
 * The one thing worth testing about the panel is exactly this, what it shows
 * for a config that has no value at a path, which is every config written
 * before a field existed.
 *
 * Nothing here writes. A value reaches the document only through a field's
 * `onChange`, so an owner who opens the panel, reads a default and saves
 * without touching the control stores nothing new.
 */

/**
 * Section glyphs, keyed by the section LABEL and not by its config key.
 *
 * `getSectionIcon` receives `field.label`, so a key that matches the config key
 * instead of the label silently yields the fallback box. The lookup is
 * case-insensitive and ignores spaces, which is why 'Hive Information' finds
 * `hiveInformation`.
 */
const sectionIcons: Record<string, string> = {
  configuration: '⚙️',
  general: '🌐',
  styles: '🎨',
  instanceConfiguration: '🔧',
  meta: '📝',
  layout: '📐',
  search: '🔍',
  sidebar: '📋',
  followers: '👥',
  following: '👤',
  hiveInformation: '🐝',
  hiveLayer: '🐝',
  features: '✨',
  communities: '🏘️',
  likes: '❤️',
  wallet: '💳',
  comments: '💬',
  post: '📄',
  text2Speech: '🔊',
  hivesigner: '🔑',
} as const;

/** Shown for a section with no entry above. */
export const FALLBACK_SECTION_ICON = '📦';

export function getSectionIcon(label: string): string {
  const normalized = label.toLowerCase().replace(/\s+/g, '');
  const entry = Object.entries(sectionIcons).find(
    ([key]) => key.toLowerCase() === normalized,
  );
  return entry?.[1] ?? FALLBACK_SECTION_ICON;
}

/**
 * The toggle position for a boolean field.
 *
 * An absent key falls through to the declared default, so a flag that is on
 * when unset cannot render as "Disabled" over a site that behaves as enabled.
 * A stored `false` is still `false`: only absence takes the default.
 */
export function displayedBooleanValue(
  field: ConfigField,
  value: ConfigValue | undefined,
): boolean {
  return (value ?? field.default) === true;
}

/**
 * The selected option for a select field.
 *
 * Two reasons the stored value is not simply handed to the select. A config
 * that predates the field has nothing at that path, and a select whose value
 * matches no option renders blank, which reads as "not configured" while the
 * site is applying a value. Both resolve to the declared default, which is the
 * same value the app resolves for an absent or unrecognised key, so the panel
 * and the site agree.
 *
 * With no declared default this is what the editor did before, an empty
 * string, so every field that predates `default` is unaffected.
 */
export function displayedSelectValue(
  field: ConfigField,
  value: ConfigValue | undefined,
): string {
  const fallback = typeof field.default === 'string' ? field.default : '';
  if (typeof value !== 'string') return fallback;

  const options = field.options;
  if (options && options.length > 0) {
    const match = options.find((option) => option.value === value);
    if (match) return match.value;

    // Only for fields whose resolver normalizes, and it has to be opt-in rather
    // than the rule for every select. `oneOf` in core/hive-layer matches with a
    // bare `includes`, no trim and no case folding, so being lenient everywhere
    // would show a Hive layer value as set while the site rejected it and used
    // the default: the same disagreement this fixes, pointing the other way.
    if (field.normalizesCase) {
      const wanted = value.trim().toLowerCase();
      const loose = options.find(
        (option) => option.value.trim().toLowerCase() === wanted,
      );
      // The option's own value, not what was stored, so the control shows the
      // canonical spelling the engine resolved to.
      if (loose) return loose.value;
    }

    return fallback;
  }
  return value;
}

/** The text in a string input, falling back to the declared default. */
export function displayedStringValue(
  field: ConfigField,
  value: ConfigValue | undefined,
): string {
  if (typeof value === 'string') return value;
  return typeof field.default === 'string' ? field.default : '';
}
