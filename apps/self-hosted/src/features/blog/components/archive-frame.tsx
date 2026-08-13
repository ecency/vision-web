'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import type { Entry } from '@ecency/sdk';
import { t } from '@/core';
import { DetectBottom } from './detect-bottom';
import { useArchiveFeed } from '../hooks/use-archive-feed';
import { chooseFeedRetry } from '../utils/feed-retry';
import { ErrorMessage } from '@/features/shared/error-message';
import { InlineError } from '@/features/shared/inline-error';
import {
  nothingToShow,
  resolveQueryOutcome,
} from '@/features/shared/query-outcome';

interface RenderArgs {
  posts: Entry[];
  /**
   * Index of a post WITHIN the page it arrived in, which is what the cards
   * use to stagger their entrance. Whole-list index would restart the
   * animation for everything already on screen each time a page lands.
   */
  batchIndexOf: (index: number) => number;
}

interface Props {
  filter?: string;
  limit?: number;
  children: (args: RenderArgs) => ReactNode;
}

/**
 * Everything an archive needs that is not layout: the feed query, paging on
 * scroll, and the four states a feed can be in (nothing yet, nothing at all,
 * failed with nothing to show, failed with pages already read).
 *
 * Extracted so a theme can lay entries out differently without owning any of
 * it. Magazine renders the newest entry as a hero and the rest as rows;
 * without this frame that theme would have had to copy the retry and
 * outcome handling, which is exactly the kind of copy that drifts and then
 * loses somebody's place in the feed on a failed page.
 *
 * The `.blog-posts-list` wrapper stays here: components.css styles it and
 * Gallery's grid targets it, so every archive keeps the same hook.
 */
export function ArchiveFrame({ filter = 'posts', limit = 20, children }: Props) {
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
  } = useArchiveFeed(filter, limit);

  // Was: `if (isError) return <ErrorMessage />` above the map. query-core keeps
  // `data` through an error, so that discarded every page already rendered and
  // the reader's place in them because one later page failed.
  const outcome = resolveQueryOutcome({
    isEnabled,
    isError,
    isSuccess,
    hasContent: data.length > 0,
  });

  const previousLengthRef = useRef(0);

  useEffect(() => {
    // If data length decreased (e.g., filter changed), reset the ref
    if (data.length < previousLengthRef.current) {
      previousLengthRef.current = 0;
    } else {
      previousLengthRef.current = data.length;
    }
  }, [data.length]);

  const batchIndexOf = (index: number) =>
    index >= previousLengthRef.current ? index - previousLengthRef.current : 0;

  // Nothing loaded and the request failed: there is no content to protect, so
  // the full panel is still right. It is the only branch that may take over.
  if (outcome === 'failed') {
    return <ErrorMessage onRetry={() => refetch()} />;
  }

  return (
    <div className="blog-posts-list">
      {nothingToShow(outcome) && !isFetching && (
        <div className="text-center py-12 text-theme-muted">{t('noPosts')}</div>
      )}

      {children({ posts: data, batchIndexOf })}

      {/* Unmounted while the last page is failing. The reader is sitting at the
          bottom of the feed, so leaving it mounted would refire the same fetch
          the moment the retries stop, in a loop. The strip below carries the
          retry instead, as a deliberate one. */}
      {hasNextPage && outcome !== 'stale' && (
        <DetectBottom onBottom={() => fetchNextPage()} />
      )}

      {isFetching && (
        <div className="text-center py-8 text-theme-muted">
          {t('loadingMore')}
        </div>
      )}

      {/* Asked, no answer, not fetching: a fetch paused while offline looks
          exactly like this. It is not evidence that the author has no posts. */}
      {outcome === 'pending' && !isFetching && (
        <div className="text-center py-12 text-theme-muted">{t('loading')}</div>
      )}

      {outcome === 'stale' && !isFetching && (
        <InlineError
          className="my-6"
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
