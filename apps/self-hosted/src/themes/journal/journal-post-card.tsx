import { Link } from '@tanstack/react-router';
import type { Entry } from '@ecency/sdk';
import { catchPostImage, postBodySummary } from '@ecency/render-helper';
import { useMemo } from 'react';
import { formatDate } from '@/core';

interface Props {
  entry: Entry;
  index?: number;
}

/**
 * A Journal entry: date, large serif title, excerpt and a small side
 * thumbnail when the post carries one, separated by hairline rules. No card
 * chrome and no counters; the entry is the page surface, the way a personal
 * publication reads. Stats and actions live on the post page.
 */
export function JournalPostCard({ entry }: Props) {
  const entryData = entry.original_entry || entry;

  const summary = useMemo(
    () =>
      entryData.json_metadata?.description ||
      postBodySummary(entryData.body, 220),
    [entryData],
  );

  // Resolved and proxied by render-helper exactly like the default card:
  // json_metadata is authored on-chain, so the raw value is untrusted and
  // only a proxy URL (or null) ever reaches the src.
  const imageUrl = useMemo(
    () => catchPostImage(entryData, 400, 300) || null,
    [entryData],
  );

  // Same canonical link shape the default card uses: the '@' is part of the
  // post URL and the router leaves it unencoded.
  const postParams = useMemo(
    () => ({ author: `@${entryData.author}`, permlink: entryData.permlink }),
    [entryData.author, entryData.permlink],
  );
  const postSearch = { raw: undefined };

  return (
    <article className="py-8 border-b border-theme last:border-b-0">
      <div className="flex gap-5 items-start">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-theme-muted font-theme-ui mb-2">
            <time dateTime={entryData.created}>
              {formatDate(entryData.created)}
            </time>
            {entryData.community && entryData.community_title && (
              <span> · {entryData.community_title}</span>
            )}
          </p>
          <h2 className="heading-theme text-2xl sm:text-3xl leading-[1.2] mb-3">
            <Link
              to="/$author/$permlink"
              params={postParams}
              search={postSearch}
              className="no-underline text-theme-primary hover:opacity-80 transition-theme"
            >
              {entryData.title}
            </Link>
          </h2>
          {summary && (
            <p className="text-theme-secondary leading-relaxed">{summary}</p>
          )}
        </div>
        {imageUrl && (
          <Link
            to="/$author/$permlink"
            params={postParams}
            search={postSearch}
            className="shrink-0 mt-1"
            tabIndex={-1}
            aria-hidden="true"
          >
            {/* A quiet side thumbnail, sized like marginalia rather than a
                hero: hidden on the narrowest screens where it would crowd
                the measure-width column. */}
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              className="hidden sm:block size-28 object-cover post-card-image-theme"
            />
          </Link>
        )}
      </div>
    </article>
  );
}
