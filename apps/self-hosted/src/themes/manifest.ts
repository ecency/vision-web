import type { ComponentType, PropsWithChildren } from 'react';
import type { StyleTemplate } from '../../hosting/api/src/style-templates';
import type { Entry } from '@ecency/sdk';

/**
 * A style template as a MANIFEST: its id, its plan tier and, optionally, its
 * own components for the named layout seams. Until now every template rendered
 * the identical component tree and differed only through CSS custom
 * properties, which caps how different two templates can look; a manifest
 * lets a template own navigation patterns, archive structures and card
 * anatomy while everything absent falls back to the shared defaults.
 *
 * Contracts every theme keeps, whatever its components do:
 * - The full `--theme-*` token contract (the accent correction sweep derives
 *   its guarantees from the theme CSS files).
 * - Route topology is global (routeTree.gen.ts is codegen): layout variants
 *   render INSIDE existing routes, so deep links never fork per theme.
 * - The config toggles that exist today (sidebar placement and visibility,
 *   list type) keep working, or the theme's own options declare them
 *   unsupported explicitly. Never silently inert.
 */

export interface ThemeComponents {
  /** The whole page frame: sidebar, navigation and the content column. */
  Shell: ComponentType<PropsWithChildren>;
  /** The masthead: title, logo, filter tabs, search, user menu. */
  Navigation: ComponentType;
  /** The profile / community rail. */
  Sidebar: ComponentType;
  /** The feed container: fetching, infinite scroll, empty and error states. */
  ArchiveList: ComponentType<{ filter?: string; limit?: number }>;
  /** One entry in the archive. */
  PostCard: ComponentType<{ entry: Entry; index?: number }>;
}

/** Config options a theme can declare it does not consume. */
export type ThemeOptionKey = 'sidebar' | 'listType';

export interface ThemeManifest {
  id: StyleTemplate;
  /**
   * Availability by hosting plan. Enforcement happens server-side at save and
   * activation; this field is what the server and the pickers read.
   */
  tier: 'free' | 'premium';
  /**
   * Config options this theme's components do not consume. The editor hides
   * them while the theme is active (visibleWhen), which is the explicit
   * declaration the manifest contract demands: a toggle must never be
   * silently inert. Stored values are untouched and apply again the moment
   * the owner switches back to a theme that consumes them.
   */
  unsupportedOptions?: readonly ThemeOptionKey[];
  /**
   * Component overrides for the named seams. Absent entirely for a CSS-only
   * template, which is what all five existing templates are: their manifests
   * carry no components key, proving the migration to this architecture
   * changes nothing rendered.
   */
  components?: Partial<ThemeComponents>;
}
