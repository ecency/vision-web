import type { PropsWithChildren } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import clsx from 'clsx';
import { useMemo } from 'react';
import { InstanceConfigManager, t } from '@/core';
import { UserMenu } from '@/features/auth';
import { SearchInput } from '@/features/blog/components/search-input';
import {
  useCommunityData,
  useInstanceConfig,
} from '@/features/blog/hooks/use-instance-config';
import { getConfiguredPostsFilters } from '@/features/blog/utils/post-filters';

/**
 * The Journal page frame: one measure-width column, no sidebar at all, an
 * author block as the masthead. The sidebar simply is not rendered (its
 * config options are declared unsupported through the manifest, so the
 * editor hides them under this theme instead of leaving them silently inert).
 */
export function JournalShell(props: PropsWithChildren) {
  const location = useLocation();
  const { username, isCommunityMode } = useInstanceConfig();
  const { data: community } = useCommunityData();

  const blogTitle = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.title,
  );
  const blogDescription = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.description,
  );
  const proxyBase = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.general.imageProxy || 'https://i.ecency.com',
  );

  const displayTitle =
    isCommunityMode && community?.title ? community.title : blogTitle || username;
  const avatarAccount = isCommunityMode ? community?.name : username;
  const avatarUrl = avatarAccount
    ? `${proxyBase}/u/${avatarAccount}/avatar/medium`
    : null;

  const availableFilters = getConfiguredPostsFilters();
  const currentFilter = useMemo(() => {
    const defaultFilter = availableFilters[0] || 'posts';
    if (typeof location.search === 'string') {
      return new URLSearchParams(location.search).get('filter') || defaultFilter;
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

  // Mirrors blog-navigation's label resolution: an i18n key when one exists,
  // a capitalized filter name otherwise.
  const filterLabel = (filter: string): string => {
    const key = `blog.navigation.${filter}`;
    const translated = t(key as Parameters<typeof t>[0]);
    return translated === key
      ? filter.charAt(0).toUpperCase() + filter.slice(1)
      : translated;
  };

  return (
    <div className="min-h-screen bg-theme-primary">
      <div className="mx-auto w-full max-w-[680px] container-padding-theme">
        <header className="pt-10 sm:pt-14 pb-6 text-center">
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt=""
              aria-hidden="true"
              className="size-14 rounded-full mx-auto mb-4 object-cover"
            />
          )}
          <h1 className="heading-theme text-3xl sm:text-4xl mb-2">
            <Link
              to="/blog"
              search={{ filter: availableFilters[0] || 'posts' }}
              className="no-underline text-theme-primary hover:opacity-80 transition-theme"
            >
              {displayTitle}
            </Link>
          </h1>
          {blogDescription && (
            <p className="text-theme-muted italic max-w-md mx-auto">
              {blogDescription}
            </p>
          )}

          <div className="mt-8 flex items-center justify-center gap-4 border-y border-theme py-2">
            <nav className="flex items-center gap-5 overflow-x-auto">
              {availableFilters.map((filter) => (
                <Link
                  key={filter}
                  to="/blog"
                  search={{ filter }}
                  className={clsx(
                    'text-sm no-underline font-theme-ui whitespace-nowrap transition-theme',
                    currentFilter === filter
                      ? 'text-theme-primary font-medium'
                      : 'text-theme-muted hover:text-theme-primary',
                  )}
                >
                  {filterLabel(filter)}
                </Link>
              ))}
            </nav>
            <span className="ml-auto flex items-center gap-3">
              <SearchInput />
              <UserMenu />
            </span>
          </div>
        </header>

        <main id="main-content" className="pb-16">
          {props.children}
        </main>
      </div>
    </div>
  );
}
