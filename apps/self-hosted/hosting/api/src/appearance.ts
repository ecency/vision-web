/**
 * Appearance constants shared with the blog SPA, next to the style template
 * roster (style-templates.ts) and under the same rules: dependency-free,
 * because the SPA bundles these, and living here because the API image builds
 * from hosting/api alone and could not import in the other direction.
 *
 * The SPA's font preset definitions (src/core/theme-appearance.ts) carry the
 * actual font stacks; the API needs only the closed key set for validating
 * signup overrides. A lockstep test on the SPA side
 * (src/styles/style-template-roster.test.ts) keeps the two agreeing.
 */
export const FONT_PRESET_KEYS = Object.freeze([
  'classic',
  'editorial',
  'modern',
  'technical',
  'system',
] as const);

export type FontPresetKey = (typeof FONT_PRESET_KEYS)[number];

/**
 * `#rgb` or `#rrggbb`, the same shapes the SPA's parseHexColor accepts. The
 * signup path validates and rejects; the Configuration Editor's full-document
 * path stays lenient on purpose, because the SPA already treats an
 * unparseable accent as "the template's own accent stands".
 */
export const ACCENT_HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
