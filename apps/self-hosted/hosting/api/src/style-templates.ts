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
 * Adding a template: add its id here, create its CSS file under
 * src/styles/themes/ and import it from index.css, and add the editor's label
 * string to i18n. The SPA guard test (src/styles/style-template-roster.test.ts)
 * fails until the CSS side agrees, and the editor's label map fails typecheck
 * until the label exists.
 */
export const STYLE_TEMPLATES = Object.freeze([
  'medium',
  'minimal',
  'magazine',
  'developer',
  'modern-gradient',
  'journal',
] as const);

export type StyleTemplate = (typeof STYLE_TEMPLATES)[number];

/**
 * What a tenant runs when no template was ever chosen. Also the seed value for
 * new tenants; hosting/default-config.json (the shared unclaimed-host
 * document) deliberately differs and is data, not code.
 */
export const DEFAULT_STYLE_TEMPLATE: StyleTemplate = 'medium';
