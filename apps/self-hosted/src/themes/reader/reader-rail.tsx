'use client';

import type { Entry } from '@ecency/sdk';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { formatDate, t } from '@/core';
import { DetectBottom } from '@/features/blog/components/detect-bottom';
import { useArchiveFeed } from '@/features/blog/hooks/use-archive-feed';
import { usePostsFilterState } from '@/features/blog/hooks/use-posts-filter-state';
import { chooseFeedRetry } from '@/features/blog/utils/feed-retry';
import { ErrorMessage } from '@/features/shared/error-message';
import { InlineError } from '@/features/shared/inline-error';
import {
  nothingToShow,
  resolveQueryOutcome,
} from '@/features/shared/query-outcome';

/** Keystrokes typed into a field are never navigation. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * The Reader archive rail: every entry in the feed as a compact row, the open
 * one highlighted, paged by the same shared hook the seam default uses. j and
 * k move to the next and previous entry without leaving the page (the arrow
 * keys are left alone: they scroll the article). Deep links need nothing
 * special, since the rail only marks whatever author and permlink the route
 * already carries.
 *
 * The filter comes from the shared filter state, and every post link carries
 * a non-default filter along (the post routes retain it): the rail must keep
 * showing the feed the reader was browsing after a post opens, or "the
 * archive never leaves the page" quietly turns into "opening a post resets
 * the archive to the default feed".
 */
export function ReaderRail() {
  const params = useParams({ strict: false }) as {
    author?: string;
    permlink?: string;
  };
  // The route's author param keeps its '@'; entries do not.
  const activeAuthor = (params.author ?? '').replace(/^@/, '');
  const activePermlink = params.permlink;
  const navigate = useNavigate();

  const { availableFilters, currentFilter } = usePostsFilterState();
  const defaultFilter = availableFilters[0] || 'posts';
  // Canonical post URLs stay clean: only a non-default feed travels along.
  const carriedFilter =
    currentFilter === defaultFilter ? undefined : currentFilter;

  const {
    data = [],
    fetchNextPage,
    isFetching,
    hasNextPage,
    isEnabled,
    isError,
    isFetchNextPageError,
    isRefetchError,
    isSuccess,
    refetch,
  } = useArchiveFeed(currentFilter);

  const entries = data as Entry[];
  const outcome = resolveQueryOutcome({
    isEnabled,
    isError,
    isSuccess,
    hasContent: entries.length > 0,
  });

  // The row a link opens is the EFFECTIVE entry (a reblog navigates to its
  // original), so active detection and the keyboard lookup must compare that
  // same identity, author included: a community feed can hold the same
  // permlink from two authors, and a cross-post's wrapper permlink never
  // matches the route.
  const isOpen = (entry: Entry) => {
    const effective = entry.original_entry || entry;
    return (
      effective.permlink === activePermlink &&
      effective.author === activeAuthor
    );
  };

  // Refs, not deps: the key handler reads the CURRENT list, selection and
  // filter without re-subscribing on every feed page or route change.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const carriedFilterRef = useRef(carriedFilter);
  carriedFilterRef.current = carriedFilter;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const forward = event.key === 'j';
      const back = event.key === 'k';
      if (!forward && !back) return;

      const list = entriesRef.current;
      if (!list.length) return;
      const current = list.findIndex((entry) => isOpenRef.current(entry));
      // Nothing open yet: either key starts at the top.
      const next =
        current === -1
          ? 0
          : Math.min(Math.max(current + (forward ? 1 : -1), 0), list.length - 1);
      if (next === current) return;

      const target = list[next].original_entry || list[next];
      event.preventDefault();
      navigate({
        to: '/$author/$permlink',
        params: { author: `@${target.author}`, permlink: target.permlink },
        search: { raw: undefined, filter: carriedFilterRef.current },
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  // Keyboard moves must keep the selection in sight; 'nearest' leaves mouse
  // scrolling alone when the entry is already visible.
  const activeItemRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeAuthor, activePermlink]);

  if (outcome === 'failed') {
    return (
      <div className="p-4">
        <ErrorMessage onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      {nothingToShow(outcome) && !isFetching && (
        <div className="text-center py-10 text-theme-muted text-sm">
          {t('noPosts')}
        </div>
      )}

      {entries.map((entry) => {
        const entryData = entry.original_entry || entry;
        const active = isOpen(entry);
        return (
          <Link
            key={`${entry.author}/${entry.permlink}`}
            ref={active ? activeItemRef : undefined}
            to="/$author/$permlink"
            params={{
              author: `@${entryData.author}`,
              permlink: entryData.permlink,
            }}
            search={{ raw: undefined, filter: carriedFilter }}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'block px-4 py-3 no-underline border-b border-theme transition-theme',
              'border-l-2',
              active
                ? 'bg-theme-tertiary border-l-[var(--theme-accent)]'
                : 'border-l-transparent hover:bg-theme-hover',
            )}
          >
            <p className="text-xs text-theme-muted font-theme-ui mb-1">
              <time dateTime={entryData.created}>
                {formatDate(entryData.created)}
              </time>
              {entryData.community && entryData.community_title && (
                <span> · {entryData.community_title}</span>
              )}
            </p>
            <h3
              className={clsx(
                'text-[15px] leading-snug text-theme-primary',
                active ? 'font-semibold' : 'font-medium',
              )}
            >
              {entryData.title}
            </h3>
          </Link>
        );
      })}

      {/* Unmounted while the last page is failing, same reasoning as the seam
          default: leaving it mounted would refire the failed fetch in a loop. */}
      {hasNextPage && outcome !== 'stale' && (
        <DetectBottom onBottom={() => fetchNextPage()} />
      )}

      {isFetching && (
        <div className="text-center py-4 text-theme-muted text-sm">
          {t('loadingMore')}
        </div>
      )}

      {outcome === 'pending' && !isFetching && (
        <div className="text-center py-10 text-theme-muted text-sm">
          {t('loading')}
        </div>
      )}

      {outcome === 'stale' && !isFetching && (
        <InlineError
          className="m-3"
          message={t('posts_load_failed')}
          onRetry={() =>
            chooseFeedRetry({ isFetchNextPageError, isRefetchError }) ===
            'next-page'
              ? fetchNextPage()
              : refetch()
          }
        />
      )}
    </div>
  );
}
