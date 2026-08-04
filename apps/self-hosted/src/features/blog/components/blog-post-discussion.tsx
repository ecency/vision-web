'use client';

import { callRPC, type Entry, QueryKeys } from '@ecency/sdk';
import { useQuery } from '@tanstack/react-query';
import { UilComment } from '@tooni/iconscout-unicons-react';
import { useMemo, useState } from 'react';
import { t } from '@/core';
import { CommentForm } from '@/features/auth';
import { InlineError } from '@/features/shared/inline-error';
import {
  nothingToShow,
  resolveQueryOutcome,
} from '@/features/shared/query-outcome';
import { selectTopLevelComments } from '../utils/top-level-comments';
import { BlogDiscussionList } from './blog-discussion-list';

interface Props {
  entry: Entry;
  isRawContent?: boolean;
}

type SortOrder = 'trending' | 'author_reputation' | 'votes' | 'created';

function sortDiscussions(
  entry: Entry,
  discussions: Entry[],
  order: SortOrder,
): Entry[] {
  const isPinned = (a: Entry) =>
    entry.json_metadata?.pinned_reply === `${a.author}/${a.permlink}`;

  const sortFunctions = {
    trending: (a: Entry, b: Entry) => {
      if (a.net_rshares < 0) return 1;
      if (b.net_rshares < 0) return -1;
      const aPayout =
        typeof a.pending_payout_value === 'string'
          ? parseFloat(a.pending_payout_value) || 0
          : a.pending_payout_value || 0;
      const bPayout =
        typeof b.pending_payout_value === 'string'
          ? parseFloat(b.pending_payout_value) || 0
          : b.pending_payout_value || 0;
      return bPayout - aPayout;
    },
    author_reputation: (a: Entry, b: Entry) => {
      return (b.author_reputation || 0) - (a.author_reputation || 0);
    },
    votes: (a: Entry, b: Entry) => {
      return (b.active_votes?.length || 0) - (a.active_votes?.length || 0);
    },
    created: (a: Entry, b: Entry) => {
      if (a.net_rshares < 0) return 1;
      if (b.net_rshares < 0) return -1;
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    },
  };

  const sorted = [...discussions].sort(sortFunctions[order]);
  const pinnedIndex = sorted.findIndex((i) => isPinned(i));
  if (pinnedIndex >= 0) {
    const pinned = sorted[pinnedIndex];
    sorted.splice(pinnedIndex, 1);
    sorted.unshift(pinned);
  }
  return sorted;
}

export function BlogPostDiscussion({ entry, isRawContent }: Props) {
  const [order, setOrder] = useState<SortOrder>('created');
  const entryData = entry.original_entry || entry;

  const {
    data: allComments = [],
    isEnabled,
    isError,
    isSuccess,
    refetch,
  } = useQuery({
    // Use the SDK's canonical discussions key so useComment's post-broadcast invalidation
    // (which matches ["posts","discussions",author,permlink,...]) actually refetches this
    // list; a bespoke ["discussions",...] key never matched, so new comments only appeared
    // after a full reload.
    queryKey: QueryKeys.posts.discussions(
      entryData.author,
      entryData.permlink,
      order,
      entryData.author,
    ),
    queryFn: async () => {
      const response = await callRPC('bridge.get_discussion', {
        author: entryData.author,
        permlink: entryData.permlink,
        observer: entryData.author,
      });

      if (response && typeof response === 'object') {
        const comments = Object.values(response) as Entry[];
        return sortDiscussions(entryData, comments, order);
      }
      return [];
    },
    enabled: !!entryData.author && !!entryData.permlink,
  });

  const topLevelComments = useMemo(
    () => selectTopLevelComments(entryData, allComments),
    [allComments, entryData],
  );

  // Counted on the replies, not on the response: bridge.get_discussion carries
  // the root post itself, so the response is never empty on a success and
  // measuring it would make every outcome look like content.
  const hasComments = topLevelComments.length > 0;

  // Was: destructuring only `{ data = [], isLoading }`, so once the retries
  // were spent a failed fetch fell straight through to "No comments yet. Be
  // the first to comment!" on a post that has a discussion.
  const outcome = resolveQueryOutcome({
    isEnabled,
    isError,
    isSuccess,
    hasContent: hasComments,
  });

  return (
    <div className="mb-6 sm:mb-8">
      <CommentForm
        parentAuthor={entryData.author}
        parentPermlink={entryData.permlink}
        className="mb-6"
      />

      {hasComments && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-theme">
            <div className="flex items-center gap-2">
              <UilComment className="size-4 sm:size-5 text-theme-muted" />
              <h2 className="text-lg sm:text-xl font-semibold heading-theme">
                {topLevelComments.length}{' '}
                {topLevelComments.length === 1 ? 'Comment' : 'Comments'}
              </h2>
            </div>
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value as SortOrder)}
              className="px-3 py-2 border border-theme rounded-theme-sm text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-theme-accent focus:border-transparent transition-theme hover:opacity-70 w-full sm:w-auto bg-theme-primary text-theme-primary font-theme-ui"
            >
              <option value="trending">Trending</option>
              <option value="author_reputation">Reputation</option>
              <option value="votes">Votes</option>
              <option value="created">Newest</option>
            </select>
          </div>

          <BlogDiscussionList
            discussionList={allComments}
            parent={entryData}
            root={entryData}
            isRawContent={isRawContent}
          />
        </>
      )}

      {nothingToShow(outcome) && (
        <div className="text-center py-8 text-theme-muted">
          {t('comments_empty')}
        </div>
      )}

      {outcome === 'pending' && (
        <div className="text-center py-8 text-theme-muted">
          {t('comments_loading')}
        </div>
      )}

      {(outcome === 'failed' || outcome === 'stale') && (
        <InlineError
          className="mt-4"
          message={
            outcome === 'stale'
              ? t('comments_incomplete')
              : t('comments_load_failed')
          }
          onRetry={() => refetch()}
        />
      )}
    </div>
  );
}
