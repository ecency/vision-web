/**
 * The style template roster: the single source of truth for which template ids
 * exist. Everything that names a template derives from this file: the two
 * request schemas in routes/tenants.ts, the BlogConfig type, the tenant seed
 * default, the blog SPA's `data-style-template` fallback and the SPA's
 * Configuration Editor options (imported relatively from
 * src/features/floating-menu/config-fields.ts, which works because hosting/
 * lives inside the app directory and the SPA builds from the repo root, while
 * this API builds from hosting/api and so could not import in the other
 * direction).
 *
 * Keep this file dependency-free: the SPA imports it into browser bundles.
 *
 * Adding a template, all four steps enforced:
 *   1. add its id here
 *   2. create its CSS file under src/styles/themes/ and import it from
 *      index.css, or src/styles/style-template-roster.test.ts fails
 *   3. add its card (name, tagline, swatches, heading style) to
 *      style-template-display.ts, which is `satisfies Record<StyleTemplate,
 *      StyleTemplateDisplay>` and so fails typecheck while the id is missing
 *   4. add the editor's label string to i18n, or its label map fails typecheck
 *
 * A template that also changes page STRUCTURE needs a manifest in
 * src/themes/registry.ts naming the seams it overrides. Without one it renders
 * the shared component tree, which is what the four CSS-only templates do.
 */
export const STYLE_TEMPLATES = Object.freeze([
  'medium',
  'minimal',
  'magazine',
  'developer',
  'modern-gradient',
  'journal',
  'reader',
  'gallery',
  'terminal',
] as const);

export type StyleTemplate = (typeof STYLE_TEMPLATES)[number];

/**
 * What a tenant runs when no template was ever chosen. Also the seed value for
 * new tenants; hosting/default-config.json (the shared unclaimed-host
 * document) deliberately differs and is data, not code.
 */
export const DEFAULT_STYLE_TEMPLATE: StyleTemplate = 'medium';
