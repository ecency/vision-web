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
      {({ posts }) => {
        /*
         * The date column is measured, not assumed. `general.dateFormat` is
         * free-form, so a site can be running `MMMM d, yyyy` ("August 13,
         * 2026") where the default renders `2026-08-13`. A fixed width made
         * the long one wrap into the title column and destroy the alignment
         * that is the whole point of a listing.
         *
         * `ch` is exact here because the theme is monospace throughout: one
         * character is one advance width, so the widest formatted date in
         * the batch gives a column that fits every row in it.
         */
        const dated = posts.map((post) => ({
          post,
          dateText: formatDate((post.original_entry || post).created),
        }));
        const dateColumn = dated.reduce((w, d) => Math.max(w, d.dateText.length), 0);

        return dated.map(({ post, dateText }) => (
          <TerminalRow
            key={`${post.author}/${post.permlink}`}
            entry={post}
            dateText={dateText}
            dateColumn={dateColumn}
          />
        ));
      }}
    </ArchiveFrame>
  );
}

interface RowProps {
  entry: Entry;
  dateText: string;
  /** Width of the date column in characters, the widest in the batch. */
  dateColumn: number;
}

function TerminalRow({ entry, dateText, dateColumn }: RowProps) {
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
          tabular-nums so digits share an advance width even if a font
          substitutes, and nowrap so an unusually long format pushes the
          column rather than folding onto a second line.
        */}
        <time
          dateTime={entryData.created}
          style={{ width: `${dateColumn}ch` }}
          className="shrink-0 whitespace-nowrap text-xs text-theme-muted tabular-nums"
        >
          {dateText}
        </time>

        {/* The prompt mark, purely decorative: a listing reads as a listing
            because every line starts the same way. */}
        <span
          aria-hidden="true"
          className="shrink-0 text-theme-muted group-hover:text-theme-accent transition-theme"
        >
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
