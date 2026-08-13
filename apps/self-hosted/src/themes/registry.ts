import {
  DEFAULT_STYLE_TEMPLATE,
  STYLE_TEMPLATES,
  type StyleTemplate,
} from '../../hosting/api/src/style-templates';
import { JournalPostCard } from './journal/journal-post-card';
import { JournalShell } from './journal/journal-shell';
import { ReaderHome } from './reader/reader-home';
import { MagazineArchive } from './magazine/magazine-archive';
import { ReaderShell } from './reader/reader-shell';
import type { ThemeManifest, ThemeOptionKey } from './manifest';

/**
 * Every template id from the roster gets a manifest here; the roster guard
 * suite keeps ids in lockstep with the CSS registry, and the registry test in
 * this directory keeps this map total over the roster. All five existing
 * templates are CSS-only, so none carries a components key: rendering is
 * byte-identical to the pre-manifest architecture, which is the point of the
 * migration.
 */
const MANIFESTS: Record<StyleTemplate, ThemeManifest> = {
  medium: { id: 'medium', tier: 'free', showsReadTime: true },
  minimal: { id: 'minimal', tier: 'free' },
  // Magazine was tokens on the shared list, so its name promised a structure
  // it did not have. It now owns the archive: newest entry as a hero, the
  // rest as rows. Cards stay the shared default, so search results keep
  // their look; the same split Reader uses.
  magazine: {
    id: 'magazine',
    tier: 'free',
    showsReadTime: true,
    components: { ArchiveList: MagazineArchive },
  },
  developer: { id: 'developer', tier: 'free' },
  'modern-gradient': { id: 'modern-gradient', tier: 'free' },
  // The first layout-level design: its own shell (single column, author
  // block, no sidebar) and entry (no card chrome). Everything else falls back
  // to the shared defaults, and the options its components do not consume are
  // declared so the editor hides them under this theme.
  journal: {
    id: 'journal',
    tier: 'free',
    showsReadTime: true,
    components: { Shell: JournalShell, PostCard: JournalPostCard },
    unsupportedOptions: ['sidebar', 'listType'],
  },
  // The second layout-level design: a split frame with the archive as a
  // persistent rail beside the open post. The home pane replaces the
  // ArchiveList seam (the rail owns the archive), while cards stay the shared
  // default so search results keep their look inside the reading pane.
  reader: {
    id: 'reader',
    tier: 'free',
    showsReadTime: true,
    components: { Shell: ReaderShell, ArchiveList: ReaderHome },
    unsupportedOptions: ['sidebar', 'listType'],
  },
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

/**
 * Whether the configured template's components consume a config option. The
 * editor's visibleWhen predicates read this, so hiding an option is always a
 * manifest declaration rather than a hardcoded template name.
 */
export function isThemeOptionSupported(
  configured: unknown,
  option: ThemeOptionKey,
): boolean {
  return !getThemeManifest(configured).unsupportedOptions?.includes(option);
}
