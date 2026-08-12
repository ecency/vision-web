import type { PropsWithChildren } from 'react';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { InstanceConfigManager } from '@/core';
import { CreatePostButton, UserMenu } from '@/features/auth';
import { SearchInput } from '@/features/blog/components/search-input';
import {
  useCommunityData,
  useInstanceConfig,
} from '@/features/blog/hooks/use-instance-config';
import { usePostsFilterState } from '@/features/blog/hooks/use-posts-filter-state';

/**
 * The Journal page frame: one measure-width column, no sidebar at all, an
 * author block as the masthead. The sidebar simply is not rendered (its
 * config options are declared unsupported through the manifest, so the
 * editor hides them under this theme instead of leaving them silently inert).
 */
export function JournalShell(props: PropsWithChildren) {
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

  // Shared with BlogNavigation, so the shell cannot drift from it.
  const { availableFilters, currentFilter, filterLabel } = usePostsFilterState();

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

          {/* flex-wrap: at narrow viewports the search and menu drop to their
              own line instead of overflowing the measure-width column. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-y border-theme py-2">
            <nav className="flex items-center gap-5 overflow-x-auto min-w-0">
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
      {/* The floating composer entry point the default navigation mounts; a
          theme shell must never cost owners and community members the way in. */}
      <CreatePostButton />
    </div>
  );
}
