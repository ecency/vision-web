import { Link } from '@tanstack/react-router';
import type { Entry } from '@ecency/sdk';
import { buildSrcSet, catchPostImage, postBodySummary } from '@ecency/render-helper';
import { useMemo } from 'react';
import { formatDate, t } from '@/core';
import { estimateReadMinutes } from '@/features/blog/utils/read-time';
import { useThemeComponents, useThemeShowsReadTime } from '@/themes/use-theme-components';
import { ArchiveFrame } from '@/features/blog/components/archive-frame';

/**
 * The Magazine archive: the newest entry as a hero, everything after it as
 * ordinary rows. Magazine was a colour and type treatment sitting on the
 * shared list, so the name promised a structure it did not have; this is
 * that structure, and the tokens are untouched.
 *
 * Only the archive is overridden. Cards stay the shared default so search
 * results keep their look, the same split Reader uses.
 */
export function MagazineArchive({ filter, limit }: { filter?: string; limit?: number }) {
  const { PostCard } = useThemeComponents();

  return (
    <ArchiveFrame filter={filter} limit={limit}>
      {({ posts, batchIndexOf }) => {
        if (posts.length === 0) return null;
        const [lead, ...rest] = posts;
        return (
          <>
            <MagazineHero entry={lead} />
            {rest.map((post, index) => (
              <PostCard
                key={`${post.author}/${post.permlink}`}
                entry={post}
                // +1: the hero took the first post, so the rows carry the
                // rest of the batch's positions rather than restarting at 0.
                index={batchIndexOf(index + 1)}
              />
            ))}
          </>
        );
      }}
    </ArchiveFrame>
  );
}

/**
 * The lead entry, set larger than the rows beneath it: full-width image,
 * headline at display size, excerpt with room to breathe.
 *
 * A lead post with no image is NOT given an empty frame. It keeps the hero's
 * type scale and drops the picture, so a text-led blog on this theme reads
 * as a front page rather than a broken one. And a blog with exactly one post
 * is all hero and no rows, which is correct: one post IS the front page.
 */
function MagazineHero({ entry }: { entry: Entry }) {
  const entryData = entry.original_entry || entry;

  const imageUrl = useMemo(
    () => catchPostImage(entryData, 1000, 560) || null,
    [entryData],
  );
  const summary = useMemo(
    () =>
      entryData.json_metadata?.description ||
      postBodySummary(entryData.body, 280),
    [entryData],
  );

  const showsReadTime = useThemeShowsReadTime();
  const readTime = useMemo(
    () => (showsReadTime ? estimateReadMinutes(entryData.body) : null),
    [showsReadTime, entryData.body],
  );

  const postParams = useMemo(
    () => ({ author: `@${entryData.author}`, permlink: entryData.permlink }),
    [entryData.author, entryData.permlink],
  );
  const postSearch = { raw: undefined };

  return (
    <article className="magazine-hero pb-8 mb-2 border-b border-theme">
      {imageUrl && (
        <Link
          to="/$author/$permlink"
          params={postParams}
          search={postSearch}
          className="block mb-5 overflow-hidden rounded-[var(--theme-post-card-image-radius)]"
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={imageUrl}
            srcSet={buildSrcSet(imageUrl) || undefined}
            /* The hero spans the whole measure at every width. */
            sizes="(max-width: 768px) 100vw, 768px"
            alt=""
            loading="eager"
            className="w-full aspect-[16/9] object-cover"
          />
        </Link>
      )}

      <p className="text-sm text-theme-muted font-theme-ui mb-2">
        <time dateTime={entryData.created}>{formatDate(entryData.created)}</time>
        {entryData.community && entryData.community_title && (
          <span> · {entryData.community_title}</span>
        )}
        {readTime !== null && (
          <span>
            {' '}
            · {readTime} {t('minRead')}
          </span>
        )}
      </p>

      <h2 className="heading-theme text-3xl sm:text-4xl leading-[1.1] mb-3">
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
        <p className="text-theme-secondary text-lg leading-relaxed">{summary}</p>
      )}
    </article>
  );
}
