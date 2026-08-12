'use client';

import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { useMemo } from 'react';
import { UilRss } from '@tooni/iconscout-unicons-react';
import { InstanceConfigManager, t } from '@/core';
import { getRssFeedUrl } from '@/utils/rss-feed-url';
import { UserMenu, CreatePostButton } from '@/features/auth';
import { useInstanceConfig, useCommunityData } from '../hooks/use-instance-config';
import { usePostsFilterState } from '../hooks/use-posts-filter-state';
import { SearchInput } from '../components/search-input';

export function BlogNavigation() {
  const { isCommunityMode } = useInstanceConfig();
  const { data: community } = useCommunityData();

  // Shared with theme shells (use-posts-filter-state) so no shell can drift
  // from this navigation's filter behavior. The hook validates the configured
  // shape, which keeps the scalar-postsFilters crash guard.
  const { availableFilters, currentFilter, filterLabel: getFilterLabel, isAboutActive } =
    usePostsFilterState();

  const blogTitle = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.title,
  );

  const blogLogo = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.logo,
  );

  // Use community title if available and in community mode
  const displayTitle = isCommunityMode && community?.title ? community.title : blogTitle;

  const proxyBase = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.general.imageProxy || 'https://i.ecency.com',
  );

  // Use community avatar from image proxy if no custom logo
  const displayLogo = useMemo(() => {
    if (blogLogo) return blogLogo;
    if (isCommunityMode && community?.name) {
      return `${proxyBase}/u/${community.name}/avatar/medium`;
    }
    return null;
  }, [blogLogo, isCommunityMode, community?.name, proxyBase]);

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
          link underline, which stacked a third line under the labels.

          The active indicator is the accent, not --theme-border-strong, which
          measured 1.38:1 to 1.87:1 against the page across all twelve palettes,
          against the 3:1 WCAG 1.4.11 asks of a state indicator. The accent
          measures 4.34:1 to 15.86:1 over the same set. font-medium is the
          second, non-colour cue. */}
      <nav className="flex gap-4 sm:gap-6 pt-3 sm:pt-4 overflow-x-auto border-b border-theme">
        {availableFilters.map((filter) => {
          // A filter tab only reads active ON the feed: /about shares this
          // row and the default filter must not stay lit next to it.
          const isActive = !isAboutActive && currentFilter === filter;
          return (
            <Link
              key={filter}
              to="/blog"
              search={{ filter }}
              className={clsx(
                'text-sm font-normal transition-theme pb-2 border-b-2 -mb-px no-underline font-theme-ui whitespace-nowrap',
                isActive
                  ? 'border-theme-accent text-theme-primary font-medium'
                  : 'border-transparent text-theme-muted hover:text-theme-primary hover:border-theme',
              )}
            >
              {getFilterLabel(filter)}
            </Link>
          );
        })}
        {/* The About surface generated from profile metadata; a tab like the
            filters, so discovering who writes the blog costs one click. */}
        <Link
          to="/about"
          className={clsx(
            'text-sm font-normal transition-theme pb-2 border-b-2 -mb-px no-underline font-theme-ui whitespace-nowrap',
            isAboutActive
              ? 'border-theme-accent text-theme-primary font-medium'
              : 'border-transparent text-theme-muted hover:text-theme-primary hover:border-theme',
          )}
        >
          {t('about_nav')}
        </Link>
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
