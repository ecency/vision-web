/**
 * The single config -> DOM contract for the instance.
 *
 * Every visual knob the configuration drives is declared once in
 * CONFIG_DOM_DECLARATION. Boot (src/index.tsx) and the Configuration Editor's
 * preview both apply it through applyConfigDom, and the editor's
 * snapshot/restore is generated from the same declaration, so preview cannot
 * drift from what a save actually produces and adding a knob (accent color,
 * font preset, theme gallery) is a one-file change here.
 *
 * The config document is read by path rather than by type because the two call
 * sites hold it differently: boot has the typed InstanceConfig, the editor
 * holds the raw JSON document it is editing.
 */

import {
  DEFAULT_STYLE_TEMPLATE,
  STYLE_TEMPLATES,
} from '../../hosting/api/src/style-templates';
import {
  type AccentAppearance,
  type FontPreset,
  resolveAccent,
  resolveFontPreset,
} from './theme-appearance';

export type ConfigReader = (path: string) => unknown;

export interface ConfigDomAttribute {
  /** Attribute name set on the <html> element. */
  attribute: string;
  /** Resolved value, or null to remove the attribute entirely. */
  resolve: (read: ConfigReader) => string | null;
}

export interface ConfigDomCssVariable {
  /** Custom property name, e.g. '--instance-accent'. */
  variable: string;
  /** Resolved value, or null to leave the property unset. */
  resolve: (read: ConfigReader) => string | null;
}

export interface ConfigDomBodyClasses {
  /**
   * Class prefixes owned by the configuration. Every matching class is cleared
   * from <body> before the configured ones are added, so re-applying a config
   * replaces the previous background instead of stacking on top of it.
   */
  prefixes: readonly string[];
  resolve: (read: ConfigReader) => readonly string[];
}

export interface ConfigDomDeclaration {
  attributes: readonly ConfigDomAttribute[];
  cssVariables: readonly ConfigDomCssVariable[];
  bodyClasses: ConfigDomBodyClasses;
  /** Document title, or null to keep whatever title the document already has. */
  documentTitle: (read: ConfigReader) => string | null;
}

export interface ConfigDomSnapshot {
  /** null means the attribute was absent and must be removed on restore. */
  attributes: Record<string, string | null>;
  /** null means the property was not set inline and must be removed on restore. */
  cssVariables: Record<string, string | null>;
  bodyClasses: string[];
  /**
   * The subset of bodyClasses this module applied from config at capture time.
   * Restoring it keeps a later apply able to replace a configured class that
   * carries none of the declared prefixes.
   */
  ownedBodyClasses: string[];
  documentTitle: string;
}

export interface ApplyConfigDomOptions {
  declaration?: ConfigDomDeclaration;
  /**
   * Keep data-theme in step with the operating system while the configured
   * theme is 'system'. Boot, a successful save and both directions of the
   * editor's preview (config-preview.ts) ask for this, each keyed to the
   * document being applied, so the listener always answers for what is on
   * screen. Safe to request on every apply: syncSystemTheme holds a single
   * module-level listener slot and removes the previous listener before
   * registering, so repeated applies cannot accumulate listeners.
   */
  syncSystemTheme?: boolean;
}

// =============================================================================
// Config reading helpers
// =============================================================================

export function readConfigPath(config: unknown, path: string): unknown {
  let current: unknown = config;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function createConfigReader(config: unknown): ConfigReader {
  return (path: string) => readConfigPath(config, path);
}

/**
 * A blank or non-string value means "not configured". An empty string must not
 * reach the DOM: `data-style-template=""` matches no stylesheet, which is how
 * the boot path used to render an unstyled page where preview showed the
 * default template.
 */
function text(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Sidebar sections are opt-out: anything but an explicit false is enabled. */
function flag(value: unknown): string {
  return value === false ? 'false' : 'true';
}

function prefersDarkColorScheme(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// =============================================================================
// The declaration
// =============================================================================

const PATHS = {
  theme: 'configuration.general.theme',
  styleTemplate: 'configuration.general.styleTemplate',
  language: 'configuration.general.language',
  background: 'configuration.general.styles.background',
  accent: 'configuration.general.styles.accent',
  fontPreset: 'configuration.general.styles.fontPreset',
  instanceType: 'configuration.instanceConfiguration.type',
  title: 'configuration.instanceConfiguration.meta.title',
  listType: 'configuration.instanceConfiguration.layout.listType',
  sidebarPlacement:
    'configuration.instanceConfiguration.layout.sidebar.placement',
  followers:
    'configuration.instanceConfiguration.layout.sidebar.followers.enabled',
  following:
    'configuration.instanceConfiguration.layout.sidebar.following.enabled',
  hiveInformation:
    'configuration.instanceConfiguration.layout.sidebar.hiveInformation.enabled',
} as const;

export const DEFAULT_THEME = 'light';

/** Everything `data-theme` is allowed to be, plus the one that resolves. */
const THEMES = new Set(['system', 'light', 'dark']);

/**
 * The configured theme, lowercased and held to the closed set.
 *
 * `text()` neither lowercases nor validates, so `theme: "Dark"` used to reach
 * the document as `data-theme="Dark"`, which matches no block in any stylesheet:
 * the tenant asked for dark and got the light palette, silently. Anything
 * outside the set resolves to the same default an absent value does, so the
 * attribute this function feeds is always `light` or `dark` and always matches
 * the blocks the templates declare. Normalising to a value that matched nothing
 * would be the failure this replaces.
 */
function configuredTheme(read: ConfigReader): string {
  const configured = text(read(PATHS.theme), DEFAULT_THEME).toLowerCase();
  return THEMES.has(configured) ? configured : DEFAULT_THEME;
}

function resolveTheme(read: ConfigReader): string {
  const configured = configuredTheme(read);
  if (configured === 'system') {
    return prefersDarkColorScheme() ? 'dark' : 'light';
  }
  return configured;
}

/**
 * The accent knob is one colour and the font knob is one key; the properties
 * below are derived from them. Resolving the whole set once per property keeps
 * every entry a pure function of the config, which is what lets preview,
 * snapshot and restore stay generic over the declaration.
 */
function accentOf(read: ConfigReader): AccentAppearance | null {
  return resolveAccent(read(PATHS.accent));
}

function fontsOf(read: ConfigReader): FontPreset | null {
  return resolveFontPreset(read(PATHS.fontPreset));
}

export const CONFIG_DOM_DECLARATION: ConfigDomDeclaration = {
  attributes: [
    { attribute: 'data-theme', resolve: resolveTheme },
    {
      attribute: 'data-style-template',
      // Clamped to the roster, matching the component registry's fallback:
      // an id this build does not know (a newer config meeting an older
      // image, or plain junk) must render the default template, not an
      // unstyled page. The two fallbacks disagreeing was exactly the
      // rollback failure mode.
      resolve: (read) => {
        const configured = text(read(PATHS.styleTemplate), DEFAULT_STYLE_TEMPLATE);
        return (STYLE_TEMPLATES as readonly string[]).includes(configured)
          ? configured
          : DEFAULT_STYLE_TEMPLATE;
      },
    },
    { attribute: 'lang', resolve: (read) => text(read(PATHS.language), 'en') },
    {
      attribute: 'data-language',
      resolve: (read) => text(read(PATHS.language), 'en'),
    },
    {
      attribute: 'data-sidebar-placement',
      resolve: (read) => text(read(PATHS.sidebarPlacement), 'right'),
    },
    {
      attribute: 'data-list-type',
      resolve: (read) => text(read(PATHS.listType), 'grid'),
    },
    {
      attribute: 'data-instance-type',
      resolve: (read) => text(read(PATHS.instanceType), 'blog'),
    },
    {
      attribute: 'data-show-followers',
      resolve: (read) => flag(read(PATHS.followers)),
    },
    {
      attribute: 'data-show-following',
      resolve: (read) => flag(read(PATHS.following)),
    },
    {
      attribute: 'data-show-hive-info',
      resolve: (read) => flag(read(PATHS.hiveInformation)),
    },
  ],
  /**
   * The owner-facing appearance knobs, as inline custom properties on <html>.
   *
   * An inline property beats every stylesheet block, so one accent applies in
   * both modes and under every style template. A resolver returning null makes
   * applyConfigDom remove the property, which is how "not configured" and "not
   * a colour" both land on the template's own value rather than on nothing.
   *
   * Two knobs, eight properties: an owner picks one colour and one pairing, and
   * a config that stored the derived values instead would have them go stale
   * the moment the source changed.
   */
  cssVariables: [
    {
      variable: '--theme-accent',
      resolve: (read) => accentOf(read)?.accent ?? null,
    },
    {
      variable: '--theme-accent-hover',
      resolve: (read) => accentOf(read)?.hover ?? null,
    },
    {
      variable: '--theme-accent-contrast',
      resolve: (read) => accentOf(read)?.contrast ?? null,
    },
    // The direction the hover walks the fill, which has to come from the ink
    // rather than from the mode or the hovered button loses its own label. The
    // CSS declaration is the no-accent-configured fallback; see accentShadeFor.
    {
      variable: '--theme-accent-shade',
      resolve: (read) => accentOf(read)?.shade ?? null,
    },
    // Both mode variants are written and CSS picks between them, so an OS flip
    // under `theme: system` re-resolves with no JS and cannot revert a preview.
    {
      variable: '--theme-accent-text-light',
      resolve: (read) => accentOf(read)?.textLight ?? null,
    },
    {
      variable: '--theme-accent-text-dark',
      resolve: (read) => accentOf(read)?.textDark ?? null,
    },
    {
      variable: '--theme-font-body',
      resolve: (read) => fontsOf(read)?.body ?? null,
    },
    {
      variable: '--theme-font-heading',
      resolve: (read) => fontsOf(read)?.heading ?? null,
    },
    {
      variable: '--theme-font-ui',
      resolve: (read) => fontsOf(read)?.ui ?? null,
    },
  ],
  bodyClasses: {
    prefixes: ['bg-', 'from-', 'via-', 'to-'],
    resolve: (read) =>
      text(read(PATHS.background), '')
        .split(/\s+/)
        .filter((className) => className.length > 0),
  },
  documentTitle: (read) => {
    const title = text(read(PATHS.title), '');
    return title.length > 0 ? title : null;
  },
};

// =============================================================================
// Apply
// =============================================================================

/**
 * The document title before configuration first touched it, which is what an
 * instance with no configured title falls back to. Captured lazily on the first
 * apply, which is boot, so preview cannot capture a configured title as if it
 * were the baseline.
 */
let originalDocumentTitle: string | null = null;

function baselineDocumentTitle(): string {
  if (originalDocumentTitle === null) {
    originalDocumentTitle = document.title;
  }
  return originalDocumentTitle;
}

/** Test seam: the baseline otherwise leaks between cases. */
export function resetConfigDomBaseline(): void {
  originalDocumentTitle = null;
}

/**
 * Classes this module added on the previous apply. Cleared alongside the
 * declared prefixes so a background class that carries no declared prefix is
 * still replaced rather than accumulated.
 */
let appliedBodyClasses: string[] = [];

let systemThemeQuery: MediaQueryList | null = null;
let systemThemeListener: ((event: MediaQueryListEvent) => void) | null = null;

function syncSystemTheme(enabled: boolean): void {
  if (systemThemeQuery && systemThemeListener) {
    systemThemeQuery.removeEventListener('change', systemThemeListener);
  }
  systemThemeQuery = null;
  systemThemeListener = null;

  if (
    !enabled ||
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return;
  }

  systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemThemeListener = (event) => {
    document.documentElement.setAttribute(
      'data-theme',
      event.matches ? 'dark' : 'light',
    );
  };
  systemThemeQuery.addEventListener('change', systemThemeListener);
}

function applyBodyClasses(
  read: ConfigReader,
  declaration: ConfigDomBodyClasses,
): void {
  const body = document.body;
  if (!body) return;

  for (const className of Array.from(body.classList)) {
    const owned =
      appliedBodyClasses.includes(className) ||
      declaration.prefixes.some((prefix) => className.startsWith(prefix));
    if (owned) body.classList.remove(className);
  }

  const next: string[] = [];
  for (const className of declaration.resolve(read)) {
    // classList.add throws on a token containing whitespace or an empty
    // string, and the value is owner-typed, so a stray tab pasted into the
    // field must not abort the rest of the apply.
    try {
      body.classList.add(className);
      next.push(className);
    } catch {
      console.warn('[Config] Ignoring invalid background class:', className);
    }
  }
  appliedBodyClasses = next;
}

export function applyConfigDom(
  config: unknown,
  options: ApplyConfigDomOptions = {},
): void {
  const declaration = options.declaration ?? CONFIG_DOM_DECLARATION;
  const read = createConfigReader(config);
  const root = document.documentElement;

  for (const { attribute, resolve } of declaration.attributes) {
    const value = resolve(read);
    if (value === null) {
      root.removeAttribute(attribute);
    } else {
      root.setAttribute(attribute, value);
    }
  }

  for (const { variable, resolve } of declaration.cssVariables) {
    const value = resolve(read);
    if (value === null) {
      root.style.removeProperty(variable);
    } else {
      root.style.setProperty(variable, value);
    }
  }

  applyBodyClasses(read, declaration.bodyClasses);

  // null means the config carries no title, which is not the same as "leave
  // whatever is on the document". Clearing the title in the editor produced
  // null, so the old title stayed on screen: the change could not be previewed
  // and looked like the save had failed. Falling back to the title the document
  // booted with makes clearing round-trip and stay deterministic.
  // Captured before the assignment, and unconditionally: reading it only in the
  // fallback branch would mean the first apply with a configured title never
  // captures, and a later clear would then adopt that configured title as the
  // baseline.
  const baseline = baselineDocumentTitle();
  const title = declaration.documentTitle(read);
  document.title = title ?? baseline;

  if (options.syncSystemTheme) {
    syncSystemTheme(configuredTheme(read) === 'system');
  }
}

// =============================================================================
// Snapshot / restore
// =============================================================================

/**
 * Capture everything the declaration is allowed to touch, so leaving preview
 * puts the document back exactly as it was, including attributes and custom
 * properties that were ABSENT before preview started.
 */
export function snapshotConfigDom(
  declaration: ConfigDomDeclaration = CONFIG_DOM_DECLARATION,
): ConfigDomSnapshot {
  const root = document.documentElement;

  const attributes: Record<string, string | null> = {};
  for (const { attribute } of declaration.attributes) {
    attributes[attribute] = root.getAttribute(attribute);
  }

  const cssVariables: Record<string, string | null> = {};
  for (const { variable } of declaration.cssVariables) {
    // getPropertyValue returns '' both for "unset" and for an empty value; an
    // empty inline value is not a state the declaration can produce, so '' is
    // recorded as "was not set".
    const value = root.style.getPropertyValue(variable);
    cssVariables[variable] = value === '' ? null : value;
  }

  return {
    attributes,
    cssVariables,
    bodyClasses: document.body ? Array.from(document.body.classList) : [],
    ownedBodyClasses: [...appliedBodyClasses],
    documentTitle: document.title,
  };
}

export function restoreConfigDom(snapshot: ConfigDomSnapshot): void {
  const root = document.documentElement;

  for (const [attribute, value] of Object.entries(snapshot.attributes)) {
    if (value === null) {
      root.removeAttribute(attribute);
    } else {
      root.setAttribute(attribute, value);
    }
  }

  for (const [variable, value] of Object.entries(snapshot.cssVariables)) {
    if (value === null) {
      root.style.removeProperty(variable);
    } else {
      root.style.setProperty(variable, value);
    }
  }

  if (document.body) {
    document.body.className = '';
    for (const className of snapshot.bodyClasses) {
      document.body.classList.add(className);
    }
  }
  appliedBodyClasses = [...snapshot.ownedBodyClasses];

  document.title = snapshot.documentTitle;
}
