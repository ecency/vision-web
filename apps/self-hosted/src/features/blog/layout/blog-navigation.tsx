'use client';

import { Link, useLocation } from '@tanstack/react-router';
import clsx from 'clsx';
import { useMemo } from 'react';
import { UilRss } from '@tooni/iconscout-unicons-react';
import { InstanceConfigManager, t } from '@/core';
import { getRssFeedUrl } from '@/utils/rss-feed-url';
import { UserMenu, CreatePostButton } from '@/features/auth';
import { useInstanceConfig, useCommunityData } from '../hooks/use-instance-config';
import { getConfiguredPostsFilters } from '../utils/post-filters';
import { SearchInput } from '../components/search-input';

export function BlogNavigation() {
  const location = useLocation();
  const { isCommunityMode } = useInstanceConfig();
  const { data: community } = useCommunityData();

  // getConfiguredPostsFilters validates the shape. Reading the raw value here
  // would re-open the crash it exists to prevent: a scalar is truthy, so
  // availableFilters.map below would throw and take the whole layout with it.
  const availableFilters = getConfiguredPostsFilters();

  const currentFilter = useMemo(() => {
    // Default to the first configured filter
    const defaultFilter = availableFilters[0] || 'posts';

    if (typeof location.search === 'string') {
      const searchParams = new URLSearchParams(location.search);
      return searchParams.get('filter') || defaultFilter;
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

  const blogTitle = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.instanceConfiguration.meta.title,
  );

  const blogLogo = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.instanceConfiguration.meta.logo,
  );

  // Use community title if available and in community mode
  const displayTitle = isCommunityMode && community?.title ? community.title : blogTitle;

  // Use community avatar from image proxy if no custom logo
  const displayLogo = useMemo(() => {
    if (blogLogo) return blogLogo;
    if (isCommunityMode && community?.name) {
      const proxyBase = InstanceConfigManager.getConfigValue(
        ({ configuration }) => configuration.general.imageProxy || 'https://i.ecency.com',
      );
      return `${proxyBase}/u/${community.name}/avatar/medium`;
    }
    return null;
  }, [blogLogo, isCommunityMode, community?.name]);

  // Get localized filter label
  const getFilterLabel = (filter: string): string => {
    // Try i18n key first (e.g., blog.navigation.blog, blog.navigation.trending)
    const i18nKey = `blog.navigation.${filter}`;
    const translated = t(i18nKey as Parameters<typeof t>[0]);
    // If translation returns the key itself, use capitalized filter name
    if (translated === i18nKey) {
      return filter.charAt(0).toUpperCase() + filter.slice(1);
    }
    return translated;
  };

  return (
    <div className="max-w-3xl mx-auto mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-3 sm:gap-4">
          {displayLogo && (
            <img
              src={displayLogo}
              alt={displayTitle}
              className="size-8 sm:size-10 object-contain rounded-full"
            />
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold heading-theme">
              {displayTitle}
            </h1>
            {isCommunityMode && community?.about && (
              <p className="text-xs sm:text-sm text-theme-muted mt-0.5 line-clamp-1">
                {community.about}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SearchInput />
          <RssFeedLink />
          <CreatePostButton />
          <UserMenu />
        </div>
      </div>

      {/* Single rule under the tabs: the nav carries the divider and the active tab's
          2px indicator overlaps it (-mb-px). no-underline kills the template's global
          link underline, which stacked a third line under the labels. */}
      <nav className="flex gap-4 sm:gap-6 pt-3 sm:pt-4 overflow-x-auto border-b border-theme">
        {availableFilters.map((filter) => {
          const isActive = currentFilter === filter;
          return (
            <Link
              key={filter}
              to="/blog"
              search={{ filter }}
              className={clsx(
                'text-sm font-normal transition-theme pb-2 border-b-2 -mb-px no-underline font-theme-ui whitespace-nowrap',
                isActive
                  ? 'border-theme-strong text-theme-primary'
                  : 'border-transparent text-theme-muted hover:text-theme-primary hover:border-theme',
              )}
            >
              {getFilterLabel(filter)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function RssFeedLink() {
  const { username, communityId, type } = useInstanceConfig();
  const rssUrl = getRssFeedUrl(type, username, communityId);

  if (!rssUrl) return null;

  return (
    <a
      href={rssUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="p-2 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-secondary transition-colors"
      title="RSS Feed"
      aria-label="RSS Feed"
    >
      <UilRss className="size-5" />
    </a>
  );
}
