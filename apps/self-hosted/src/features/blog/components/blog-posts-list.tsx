'use client';

import { useEffect, useRef } from 'react';
import { t } from '@/core';
import { useThemeComponents } from '@/themes/use-theme-components';
import { DetectBottom } from './detect-bottom';
import { useArchiveFeed } from '../hooks/use-archive-feed';
import { chooseFeedRetry } from '../utils/feed-retry';
import { ErrorMessage } from '@/features/shared/error-message';
import { InlineError } from '@/features/shared/inline-error';
import {
  nothingToShow,
  resolveQueryOutcome,
} from '@/features/shared/query-outcome';

interface Props {
  filter?: string;
  limit?: number;
}

export function BlogPostsList({ filter = 'posts', limit = 20 }: Props) {
  // The card resolves through the theme registry: a theme can restyle every
  // entry without owning the whole feed (fetching, paging, error states).
  const { PostCard } = useThemeComponents();

  // Fetching lives in the shared hook, so a theme's own archive surface (the
  // Reader rail) pages through exactly the same queries as this seam default.
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

      {data.map((post, index) => {
        const isNewItem = index >= previousLengthRef.current;
        const batchIndex = isNewItem ? index - previousLengthRef.current : 0;
        return (
          <PostCard
            key={`${post.author}/${post.permlink}`}
            entry={post}
            index={batchIndex}
          />
        );
      })}

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
