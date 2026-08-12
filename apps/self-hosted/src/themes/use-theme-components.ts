import { useMemo } from 'react';
import { InstanceConfigManager } from '@/core';
import { BlogPostsList } from '@/features/blog/components/blog-posts-list';
import { BlogPostItem } from '@/features/blog/components/blog-post-item';
import { DefaultShell } from '@/features/blog/layout/default-shell';
import { BlogNavigation } from '@/features/blog/layout/blog-navigation';
import { BlogSidebar } from '@/features/blog/layout/blog-sidebar';
import type { ThemeComponents } from './manifest';
import { getThemeManifest } from './registry';

/**
 * The shared defaults behind every seam: exactly the components every
 * template rendered before manifests existed. A theme overrides seams through
 * its manifest; everything absent falls back here, so a CSS-only theme
 * renders the identical tree it always has.
 */
export const DEFAULT_THEME_COMPONENTS: ThemeComponents = {
  Shell: DefaultShell,
  Navigation: BlogNavigation,
  Sidebar: BlogSidebar,
  ArchiveList: BlogPostsList,
  PostCard: BlogPostItem,
};

/**
 * Resolve the active template's components, reactively: a subscriber, so the
 * Configuration Editor's preview (which serves a draft config through the
 * store) restyles AND restructures live, and exiting preview restores the
 * baseline components.
 */
/** The pure half of the hook, separated so the resolution is testable. */
export function resolveThemeComponents(styleTemplate: unknown): ThemeComponents {
  return {
    ...DEFAULT_THEME_COMPONENTS,
    ...getThemeManifest(styleTemplate).components,
  };
}

export function useThemeComponents(): ThemeComponents {
  const styleTemplate = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.general.styleTemplate,
  );
  return useMemo(() => resolveThemeComponents(styleTemplate), [styleTemplate]);
}
