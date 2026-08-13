import { Link } from '@tanstack/react-router';
import type { Entry } from '@ecency/sdk';
import { useMemo } from 'react';
import { formatDate, t } from '@/core';
import { estimateReadMinutes } from '@/features/blog/utils/read-time';
import { useThemeShowsReadTime } from '@/themes/use-theme-components';
import { ArchiveFrame } from '@/features/blog/components/archive-frame';

/**
 * The Terminal archive: a listing, not a feed. One row per post, aligned in
 * columns the way `ls -l` aligns, with the date first because that is the
 * column a listing sorts by.
 *
 * No images, no excerpts, no counters. The whole point of the idiom is
 * density: a reader sees thirty titles at once instead of five cards.
 */
export function TerminalArchive({ filter, limit }: { filter?: string; limit?: number }) {
  return (
    <ArchiveFrame filter={filter} limit={limit}>
      {({ posts }) => posts.map((post) => <TerminalRow key={`${post.author}/${post.permlink}`} entry={post} />)}
    </ArchiveFrame>
  );
}

function TerminalRow({ entry }: { entry: Entry }) {
  const entryData = entry.original_entry || entry;

  const showsReadTime = useThemeShowsReadTime();
  const readTime = useMemo(
    () => (showsReadTime ? estimateReadMinutes(entryData.body) : null),
    [showsReadTime, entryData.body],
  );

  // Same canonical link shape every other card uses: the '@' is part of the
  // post URL and the router leaves it unencoded.
  const postParams = useMemo(
    () => ({ author: `@${entryData.author}`, permlink: entryData.permlink }),
    [entryData.author, entryData.permlink],
  );
  const postSearch = { raw: undefined };

  return (
    <article className="border-b border-theme last:border-b-0">
      <Link
        to="/$author/$permlink"
        params={postParams}
        search={postSearch}
        className="group flex items-baseline gap-3 py-2 no-underline text-theme-primary hover:bg-theme-tertiary transition-theme"
      >
        {/*
          tabular-nums so the dates form a real column: proportional digits
          make a monospace listing ragged, which is the one thing a listing
          cannot be. Fixed width for the same reason.
        */}
        <time
          dateTime={entryData.created}
          className="shrink-0 w-[6.5rem] text-xs text-theme-muted tabular-nums"
        >
          {formatDate(entryData.created)}
        </time>

        {/* The prompt mark, purely decorative: a listing reads as a listing
            because every line starts the same way. */}
        <span aria-hidden="true" className="shrink-0 text-theme-muted group-hover:text-theme-accent transition-theme">
          &gt;
        </span>

        <span className="min-w-0 flex-1 truncate group-hover:underline">
          {entryData.title}
        </span>

        {readTime !== null && (
          <span className="shrink-0 text-xs text-theme-muted tabular-nums hidden sm:inline">
            {readTime} {t('minRead')}
          </span>
        )}
      </Link>
    </article>
  );
}
