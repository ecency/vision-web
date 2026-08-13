import type { PropsWithChildren } from 'react';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { InstanceConfigManager, t } from '@/core';
import { CreatePostButton, UserMenu } from '@/features/auth';
import { SearchInput } from '@/features/blog/components/search-input';
import { useInstanceConfig } from '@/features/blog/hooks/use-instance-config';
import { usePostsFilterState } from '@/features/blog/hooks/use-posts-filter-state';
import { BlogPage } from '@/features/blog/layout/blog-page';

/**
 * The Terminal page frame: a prompt line instead of a masthead, filters as
 * flags after it, and no sidebar. Wide-ish column because a listing is
 * columns of text rather than a measure of prose.
 *
 * It mounts CreatePostButton itself. That is the standing contract for every
 * theme shell here: the default navigation is what mounts the composer
 * entry, so a shell that replaces the navigation and forgets it silently
 * removes the only way an owner writes a post.
 */
export function TerminalShell(props: PropsWithChildren) {
  const { username, isCommunityMode } = useInstanceConfig();

  const blogTitle = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.title,
  );
  const blogDescription = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.meta.description,
  );

  // Shared with BlogNavigation, so the shell cannot drift from it.
  const { availableFilters, currentFilter, filterLabel, isAboutActive } =
    usePostsFilterState();

  // The prompt reads as a path: a community is a directory of many authors,
  // a blog is one person's home.
  const prompt = isCommunityMode ? `~/${username}` : `~/${username}`;

  return (
    <div className="min-h-screen bg-theme-primary">
      <div className="mx-auto w-full max-w-[900px] container-padding-theme">
        <header className="pt-8 pb-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1 className="heading-theme text-lg sm:text-xl">
              <Link
                to="/blog"
                search={{ filter: availableFilters[0] || 'posts' }}
                className="no-underline text-theme-primary hover:opacity-80 transition-theme"
              >
                <span aria-hidden="true" className="text-theme-muted">
                  {prompt}
                </span>{' '}
                {blogTitle || username}
              </Link>
            </h1>
            <span className="ml-auto flex items-center gap-3">
              <SearchInput />
              <CreatePostButton />
              <UserMenu />
            </span>
          </div>

          {blogDescription && (
            <p className="mt-2 text-sm text-theme-muted">
              <span aria-hidden="true"># </span>
              {blogDescription}
            </p>
          )}

          {/* Filters as flags on the prompt line. Wrapping rather than
              scrolling: a listing that scrolls sideways is not a listing. */}
          <nav className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-theme py-2 text-sm">
            {availableFilters.map((filter) => (
              <Link
                key={filter}
                to="/blog"
                search={{ filter }}
                className={clsx(
                  'no-underline transition-theme',
                  !isAboutActive && currentFilter === filter
                    ? 'text-theme-accent'
                    : 'text-theme-muted hover:text-theme-primary',
                )}
              >
                <span aria-hidden="true">--</span>
                {filterLabel(filter)}
              </Link>
            ))}
            <Link
              to="/about"
              className={clsx(
                'no-underline transition-theme',
                isAboutActive
                  ? 'text-theme-accent'
                  : 'text-theme-muted hover:text-theme-primary',
              )}
            >
              <span aria-hidden="true">--</span>
              {t('about_nav')}
            </Link>
          </nav>
        </header>

        <main id="main-content" className="pb-16">
          <BlogPage>{props.children}</BlogPage>
        </main>
      </div>
    </div>
  );
}
