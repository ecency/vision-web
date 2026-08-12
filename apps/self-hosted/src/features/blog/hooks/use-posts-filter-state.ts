import { useLocation } from '@tanstack/react-router';
import { useMemo } from 'react';
import { t } from '@/core';
import { getConfiguredPostsFilters } from '../utils/post-filters';

/**
 * The archive filter state every shell needs: the configured filters, which
 * one is active (from the route search, defaulting to the first configured)
 * and a label resolver. Extracted from BlogNavigation so a theme shell cannot
 * drift from the navigation's behavior by re-implementing it.
 */
export function usePostsFilterState() {
  const location = useLocation();
  const availableFilters = getConfiguredPostsFilters();

  const currentFilter = useMemo(() => {
    const defaultFilter = availableFilters[0] || 'posts';
    if (typeof location.search === 'string') {
      return (
        new URLSearchParams(location.search).get('filter') || defaultFilter
      );
    }
    if (
      location.search &&
      typeof location.search === 'object' &&
      'filter' in location.search
    ) {
      return (location.search.filter as string) || defaultFilter;
    }
    return defaultFilter;
  }, [location.search, availableFilters]);

  // An i18n key when one exists, a capitalized filter name otherwise.
  const filterLabel = (filter: string): string => {
    const key = `blog.navigation.${filter}`;
    const translated = t(key as Parameters<typeof t>[0]);
    return translated === key
      ? filter.charAt(0).toUpperCase() + filter.slice(1)
      : translated;
  };

  return { availableFilters, currentFilter, filterLabel };
}
