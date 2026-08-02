import { InstanceConfigManager } from '@/core';

/**
 * The instance's configured post filters, e.g. ['trending', 'hot'] for a
 * community or ['posts', 'blog'] for a personal blog.
 */
export function getConfiguredPostsFilters(): string[] {
  const filters = InstanceConfigManager.getConfigValue(
    ({ configuration }) =>
      configuration.instanceConfiguration?.features?.postsFilters,
  );
  // Self-hosted config.json is hand-edited: a scalar like "trending" would
  // otherwise pass a truthy length check and index to its first CHARACTER.
  const validFilters = Array.isArray(filters)
    ? filters.filter(
        (filter): filter is string =>
          typeof filter === 'string' && filter.length > 0,
      )
    : [];
  return validFilters.length > 0 ? validFilters : ['posts'];
}

/**
 * Clamp a requested filter to the configured list. Landing pages and stale
 * bookmarks may carry a filter the owner removed (or the hardcoded historic
 * default); those must resolve to the instance's FIRST configured filter, not
 * to a feed the owner disabled.
 */
export function resolvePostsFilter(requested: unknown): string {
  const configured = getConfiguredPostsFilters();
  return typeof requested === 'string' && configured.includes(requested)
    ? requested
    : configured[0];
}
