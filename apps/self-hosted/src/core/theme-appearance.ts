/**
 * The maths behind the two owner-facing appearance knobs.
 *
 * `general.styles.accent` is one colour and `general.styles.fontPreset` is one
 * key. Everything the page needs beyond those two values is derived here: the
 * hover fill, the text that sits on the accent, and a text colour that stays
 * readable on every surface the five templates declare. A config that stored
 * five colours instead would have four of them go stale the moment the fifth
 * changed.
 *
 * Pure: no DOM, no getComputedStyle, no config reading, so the whole thing is
 * testable and the sweep in theme-appearance.test.ts can prove the contrast
 * claim over every colour rather than over the handful someone thought of.
 *
 * Both mode variants of the corrected text colour are computed and CSS picks
 * between them (`--theme-accent-text-light` / `--theme-accent-text-dark`), so
 * nothing has to re-run when the operating system flips light to dark under
 * `theme: system`, and an active preview is never reverted by a listener.
 */

export type Rgb = readonly [number, number, number];

/** WCAG 1.4.3 AA for body text. */
export const ACCENT_CONTRAST_TARGET = 4.5;

/**
 * How much of the accent a tag chip's background carries, as a percentage.
 * Kept in step with the `color-mix()` in themes/variables.css by
 * theme-appearance-tokens.test.ts: the correction below has to know the surface
 * the corrected text actually lands on, and the chip is the darkest (in light
 * mode) or lightest (in dark mode) of them.
 */
export const ACCENT_TINT_PERCENT = 12;

/**
 * The hardest surface of each mode, out of every `--theme-bg-primary` the
 * templates declare. Dark text is hardest to read on the darkest light surface
 * and light text on the lightest dark one, so correcting against these two
 * covers all of them. theme-appearance.test.ts derives both from the theme
 * files and fails if a new template moves the worst case.
 */
export const LIGHT_WORST_SURFACE = '#eff1f5';
export const DARK_WORST_SURFACE = '#1e1e2e';

/**
 * The candidates for text placed on the accent fill.
 *
 * The softer near-black is preferred, and pure black is the fallback for the
 * band of mid-tone accents where neither white nor #111827 reaches the target:
 * measured over the 4096-colour sweep, 254 of them fall short that way, worst
 * case 4.213:1 on #dd4444. A design that named only the first two would ship
 * sub-AA text on the accent for one accent in sixteen. With pure black in the
 * set the sweep's worst case is 4.500:1, which the guard asserts.
 */
export const CONTRAST_INK_DARK = '#111827';
export const CONTRAST_INK_LIGHT = '#ffffff';
export const CONTRAST_INK_DARKEST = '#000000';

/**
 * Set inline as a constant string rather than as a computed colour, so the
 * declaration re-substitutes on its own if either operand changes.
 *
 * The whole safety of the hovered button lives in --theme-accent-shade. See
 * accentShadeFor.
 */
export const ACCENT_HOVER =
  'color-mix(in oklab, var(--theme-accent) 85%, var(--theme-accent-shade))';

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `#rgb` and `#rrggbb` only, case-insensitive.
 *
 * The validation is load-bearing rather than cosmetic: a custom property
 * accepts any token sequence and only fails at substitution, so writing
 * `--theme-accent: banana` would make every `background-color:
 * var(--theme-accent)` invalid at computed-value time and render those surfaces
 * transparent. A refused value has to fall back to the template's own accent,
 * never to nothing. `#rrggbbaa` is refused too: alpha on a fill is a
 * readability hole that no correction can close.
 */
export function parseHexColor(value: unknown): Rgb | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) return null;

  const digits = trimmed.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  const packed = Number.parseInt(full, 16);
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
}

export function formatHexColor(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** `percent` of `colour` composited over `surface`, both opaque. */
export function tintedSurface(
  colour: Rgb,
  surface: Rgb,
  percent: number = ACCENT_TINT_PERCENT,
): Rgb {
  const alpha = percent / 100;
  return [
    colour[0] * alpha + surface[0] * (1 - alpha),
    colour[1] * alpha + surface[1] * (1 - alpha),
    colour[2] * alpha + surface[2] * (1 - alpha),
  ];
}

function rgbToHsl(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) return [0, 0, lightness * 100];

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue: number;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;

  return [hue * 360, saturation * 100, lightness * 100];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.min(100, Math.max(0, s)) / 100;
  const lightness = Math.min(100, Math.max(0, l)) / 100;

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  const sextant = Math.floor(hue / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sextant];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/**
 * The accent walked in HSL lightness, 1% at a time, until it clears
 * `ACCENT_CONTRAST_TARGET` against every surface given. Toward black when the
 * surfaces are light, toward white when they are dark; black or white if the
 * walk exhausts, which both clear every declared surface by a wide margin.
 *
 * Hue and saturation are kept, so the result still reads as the owner's colour.
 */
function correctedText(accent: Rgb, surfaces: readonly Rgb[]): Rgb {
  const clears = (candidate: Rgb) =>
    surfaces.every(
      (surface) => contrastRatio(candidate, surface) >= ACCENT_CONTRAST_TARGET,
    );
  if (clears(accent)) return accent;

  // Every surface passed in one call is the same mode: the chip tint of a light
  // surface is still light, and of a dark surface still dark.
  const towardBlack = relativeLuminance(surfaces[0]) >= 0.5;
  const [hue, saturation, lightness] = rgbToHsl(accent);

  for (let step = 1; step <= 100; step += 1) {
    const next = towardBlack ? lightness - step : lightness + step;
    if (next < 0 || next > 100) break;
    const candidate = hslToRgb(hue, saturation, next);
    if (clears(candidate)) return candidate;
  }

  return towardBlack ? [0, 0, 0] : [255, 255, 255];
}

/**
 * The accent corrected until it is readable as text on one surface.
 *
 * Exported in the single-surface shape the contrast sweep exercises;
 * `accentTextForMode` is what the knob actually writes.
 */
export function accentTextFor(hex: string, surface: string): string | null {
  const accent = parseHexColor(hex);
  const background = parseHexColor(surface);
  if (!accent || !background) return null;
  return formatHexColor(correctedText(accent, [background]));
}

/**
 * The accent corrected for a whole mode: readable both on the mode's hardest
 * page surface and on the tag chip, which is that surface with
 * `ACCENT_TINT_PERCENT` of the accent mixed in and is therefore harder still.
 */
export function accentTextForMode(
  hex: string,
  mode: 'light' | 'dark',
): string | null {
  const accent = parseHexColor(hex);
  const surface = parseHexColor(
    mode === 'light' ? LIGHT_WORST_SURFACE : DARK_WORST_SURFACE,
  );
  if (!accent || !surface) return null;
  return formatHexColor(
    correctedText(accent, [surface, tintedSurface(accent, surface)]),
  );
}

function requireHexColor(value: string): Rgb {
  const parsed = parseHexColor(value);
  if (!parsed) throw new Error(`Not a hex colour: ${value}`);
  return parsed;
}

const INK_DARK = requireHexColor(CONTRAST_INK_DARK);
const INK_LIGHT = requireHexColor(CONTRAST_INK_LIGHT);
const INK_DARKEST = requireHexColor(CONTRAST_INK_DARKEST);

/** The most readable text colour for the accent fill. */
export function accentContrastColor(hex: string): string | null {
  const accent = parseHexColor(hex);
  if (!accent) return null;

  const onLight = contrastRatio(accent, INK_LIGHT);
  const onDark = contrastRatio(accent, INK_DARK);
  if (Math.max(onLight, onDark) >= ACCENT_CONTRAST_TARGET) {
    return onLight >= onDark ? CONTRAST_INK_LIGHT : CONTRAST_INK_DARK;
  }

  // Neither preferred ink clears the target on this accent, so take the end of
  // the range that does. White is already the light extreme, so the only colour
  // left to try is pure black.
  return contrastRatio(accent, INK_DARKEST) >= onLight
    ? CONTRAST_INK_DARKEST
    : CONTRAST_INK_LIGHT;
}

/**
 * The end of the range the hover moves the fill TOWARDS, which is the end away
 * from the ink that sits on it.
 *
 * --theme-accent-shade used to be declared in CSS as black in light mode and
 * white in dark mode, and its only consumer is ACCENT_HOVER. That picked the
 * direction from the MODE while accentContrastColor picks the ink from the
 * ACCENT's own luminance, and when the two agreed the hover walked the fill
 * towards its own label: over the 4096-colour sweep 39% of accents dropped
 * below 4.5:1 while hovered, worst 3.08, and even #0969da reached 3.86 in dark
 * mode. Re-choosing the ink against the hovered fill does not rescue it either,
 * since 1261 of 4096 still fail that way: the fill has to stop crossing the ink
 * rather than the ink chasing the fill.
 *
 * Taking the direction from the ink instead makes contrast on hover
 * monotonically better than at rest, because moving a fill away from its ink in
 * luminance can only raise the ratio. Since accentContrastColor already clears
 * the target at rest, the hover clears it too, for every colour. The guard
 * measures that over the same sweep rather than trusting the argument.
 */
export function accentShadeFor(contrast: string): string | null {
  const ink = parseHexColor(contrast);
  if (!ink) return null;
  return relativeLuminance(ink) > 0.5
    ? CONTRAST_INK_DARKEST
    : CONTRAST_INK_LIGHT;
}

export interface AccentAppearance {
  /** The owner's colour, normalised to `#rrggbb`. */
  accent: string;
  hover: string;
  contrast: string;
  /** The end the hover walks towards; away from `contrast`, never the mode's. */
  shade: string;
  textLight: string;
  textDark: string;
}

/**
 * Every derived accent value, or null for a value that is absent, empty or not
 * a hex colour. Null means "the template's own accent stands", which is what
 * every instance renders today.
 */
export function resolveAccent(value: unknown): AccentAppearance | null {
  const parsed = parseHexColor(value);
  if (!parsed) return null;

  const accent = formatHexColor(parsed);
  const contrast = accentContrastColor(accent);
  const textLight = accentTextForMode(accent, 'light');
  const textDark = accentTextForMode(accent, 'dark');
  if (!contrast || !textLight || !textDark) return null;
  const shade = accentShadeFor(contrast);
  if (!shade) return null;

  return { accent, hover: ACCENT_HOVER, contrast, shade, textLight, textDark };
}

// =============================================================================
// Font pairings
// =============================================================================

const SYSTEM_SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
const SYSTEM_SERIF = 'Georgia, "Times New Roman", serif';
const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export interface FontPreset {
  body: string;
  heading: string;
  ui: string;
}

/**
 * All four downloaded families are already loaded unconditionally by
 * styles/fonts.css, so no preset adds a network request and `system` removes
 * none. font-presets is asserted against that file by theme-appearance.test.ts:
 * a preset naming a family nobody loads renders a silent fallback, which is the
 * dead-surface pattern this work exists to end.
 *
 * Each preset sets all three faces. `--theme-font-ui` alone has 29 call sites
 * through `font-theme-ui`, so changing body and heading while the UI stayed on
 * the template's face would read as a bug.
 */
export const FONT_PRESETS: Record<string, FontPreset> = {
  classic: {
    body: `"Source Serif 4", ${SYSTEM_SERIF}`,
    heading: `"Playfair Display", ${SYSTEM_SERIF}`,
    ui: SYSTEM_SANS,
  },
  editorial: {
    body: `"Source Serif 4", ${SYSTEM_SERIF}`,
    heading: `"Inter", ${SYSTEM_SANS}`,
    ui: `"Inter", ${SYSTEM_SANS}`,
  },
  modern: {
    body: `"Inter", ${SYSTEM_SANS}`,
    heading: `"Inter", ${SYSTEM_SANS}`,
    ui: `"Inter", ${SYSTEM_SANS}`,
  },
  technical: {
    body: `"Inter", ${SYSTEM_SANS}`,
    heading: `"JetBrains Mono", ${SYSTEM_MONO}`,
    ui: `"Inter", ${SYSTEM_SANS}`,
  },
  system: {
    body: SYSTEM_SANS,
    heading: SYSTEM_SANS,
    ui: SYSTEM_SANS,
  },
};

/**
 * The options for the editor's select, including the empty one.
 *
 * The empty option is required rather than decorative: the select renderer
 * falls back to `''` for an unconfigured field, so without an option carrying
 * that value an instance with no preset would show the first option as
 * selected, and there would be no way back to the template's own faces after
 * the first change.
 */
export const FONT_PRESET_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: '', label: 'Theme default' },
  {
    value: 'classic',
    label: 'Classic (Source Serif 4 body, Playfair Display headings)',
  },
  {
    value: 'editorial',
    label: 'Editorial (Source Serif 4 body, Inter headings)',
  },
  { value: 'modern', label: 'Modern (Inter throughout)' },
  {
    value: 'technical',
    label: 'Technical (Inter body, JetBrains Mono headings)',
  },
  { value: 'system', label: 'System (no downloaded font used)' },
];

/** The named preset, or null for absent, empty and unknown keys alike. */
export function resolveFontPreset(value: unknown): FontPreset | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return FONT_PRESETS[key] ?? null;
}
