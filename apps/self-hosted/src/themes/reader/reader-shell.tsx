import type { PropsWithChildren } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import clsx from 'clsx';
import { InstanceConfigManager, t } from '@/core';
import { CreatePostButton, UserMenu } from '@/features/auth';
import { SearchInput } from '@/features/blog/components/search-input';
import {
  useCommunityData,
  useInstanceConfig,
} from '@/features/blog/hooks/use-instance-config';
import { usePostsFilterState } from '@/features/blog/hooks/use-posts-filter-state';
import { ReaderRail } from './reader-rail';

/**
 * The Reader page frame: the archive as a persistent rail beside whatever is
 * open, the way a feed reader lays out. Both panes scroll independently, so
 * moving between posts never loses the reader's place in the archive. On
 * small screens the split collapses to one pane at a time: the feed route IS
 * the rail, and every other route (post, search, publish) shows the content
 * pane. The sidebar seam is not rendered at all; its config options are
 * declared unsupported through the manifest, so the editor hides them under
 * this theme instead of leaving them silently inert.
 */
export function ReaderShell(props: PropsWithChildren) {
  const { username, isCommunityMode } = useInstanceConfig();
  const { data: community } = useCommunityData();
  const location = useLocation();

  const blogTitle = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.title,
  );
  const proxyBase = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.general.imageProxy || 'https://i.ecency.com',
  );

  const displayTitle =
    isCommunityMode && community?.title ? community.title : blogTitle || username;
  const avatarAccount = isCommunityMode ? community?.name : username;
  const avatarUrl = avatarAccount
    ? `${proxyBase}/u/${avatarAccount}/avatar/small`
    : null;

  // Shared with BlogNavigation, so the shell cannot drift from it.
  const { availableFilters, currentFilter, filterLabel, isAboutActive } =
    usePostsFilterState();

  // The one route where the rail is the whole story on small screens.
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const isFeedRoute = pathname === '/' || pathname === '/blog';

  return (
    <div className="h-dvh flex flex-col bg-theme-primary">
      <header className="shrink-0 border-b border-theme">
        {/* flex-wrap: at narrow viewports the search and menu drop to their
            own line instead of overflowing the strip. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2">
          <Link
            to="/blog"
            search={{ filter: availableFilters[0] || 'posts' }}
            className="flex items-center gap-2 no-underline text-theme-primary hover:opacity-80 transition-theme min-w-0"
          >
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt=""
                aria-hidden="true"
                className="size-7 rounded-full object-cover"
              />
            )}
            <span className="font-theme-ui font-semibold truncate">
              {displayTitle}
            </span>
          </Link>
          <nav className="flex items-center gap-4 overflow-x-auto min-w-0">
            {availableFilters.map((filter) => (
              <Link
                key={filter}
                to="/blog"
                search={{ filter }}
                className={clsx(
                  'text-sm no-underline font-theme-ui whitespace-nowrap transition-theme',
                  !isAboutActive && currentFilter === filter
                    ? 'text-theme-primary font-medium'
                    : 'text-theme-muted hover:text-theme-primary',
                )}
              >
                {filterLabel(filter)}
              </Link>
            ))}
            {/* Reader places About in the header strip; the pane shows it
                beside the rail like any open page. */}
            <Link
              to="/about"
              className={clsx(
                'text-sm no-underline font-theme-ui whitespace-nowrap transition-theme',
                isAboutActive
                  ? 'text-theme-primary font-medium'
                  : 'text-theme-muted hover:text-theme-primary',
              )}
            >
              {t('about_nav')}
            </Link>
          </nav>
          <span className="ml-auto flex items-center gap-3">
            <SearchInput />
            <UserMenu />
          </span>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside
          className={clsx(
            'w-full lg:w-[var(--theme-sidebar-width)] lg:shrink-0 lg:border-r border-theme overflow-y-auto bg-theme-secondary',
            !isFeedRoute && 'hidden lg:block',
          )}
        >
          <ReaderRail />
        </aside>
        <main
          id="main-content"
          className={clsx(
            'flex-1 min-w-0 overflow-y-auto',
            isFeedRoute && 'hidden lg:block',
          )}
        >
          <div className="mx-auto w-full max-w-[var(--theme-content-width)] container-padding-theme py-6">
            {props.children}
          </div>
        </main>
      </div>

      {/* The floating composer entry point the default navigation mounts; a
          theme shell must never cost owners and community members the way in. */}
      <CreatePostButton />
    </div>
  );
}
