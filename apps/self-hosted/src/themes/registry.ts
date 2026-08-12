import {
  DEFAULT_STYLE_TEMPLATE,
  STYLE_TEMPLATES,
  type StyleTemplate,
} from '../../hosting/api/src/style-templates';
import type { ThemeManifest } from './manifest';

/**
 * Every template id from the roster gets a manifest here; the roster guard
 * suite keeps ids in lockstep with the CSS registry, and the registry test in
 * this directory keeps this map total over the roster. All five existing
 * templates are CSS-only, so none carries a components key: rendering is
 * byte-identical to the pre-manifest architecture, which is the point of the
 * migration.
 */
const MANIFESTS: Record<StyleTemplate, ThemeManifest> = {
  medium: { id: 'medium', tier: 'free' },
  minimal: { id: 'minimal', tier: 'free' },
  magazine: { id: 'magazine', tier: 'free' },
  developer: { id: 'developer', tier: 'free' },
  'modern-gradient': { id: 'modern-gradient', tier: 'free' },
};

function isStyleTemplate(value: unknown): value is StyleTemplate {
  return (
    typeof value === 'string' &&
    (STYLE_TEMPLATES as readonly string[]).includes(value)
  );
}

/**
 * The manifest for a configured template id, falling back to the default
 * template's manifest for absent or unknown ids, mirroring how
 * apply-config-dom resolves data-style-template.
 */
export function getThemeManifest(configured: unknown): ThemeManifest {
  return MANIFESTS[isStyleTemplate(configured) ? configured : DEFAULT_STYLE_TEMPLATE];
}

export function allThemeManifests(): readonly ThemeManifest[] {
  return STYLE_TEMPLATES.map((id) => MANIFESTS[id]);
}
