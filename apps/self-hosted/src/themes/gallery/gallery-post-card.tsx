import { Link } from '@tanstack/react-router';
import type { Entry } from '@ecency/sdk';
import { buildSrcSet, catchPostImage, postBodySummary } from '@ecency/render-helper';
import { useMemo } from 'react';
import { formatDate } from '@/core';

interface Props {
  entry: Entry;
  index?: number;
}

/**
 * A Gallery tile: the cover at full card width with the title and date as a
 * quiet label underneath, the way a picture is captioned rather than
 * headlined. No excerpt, no counters, no card chrome; the wall is the page
 * and the image is the content.
 *
 * A post with no usable image is NOT dropped and NOT given an empty box.
 * Some posts in an image-led blog are text (a note, an update), and a hole
 * in a grid reads as a bug. Those tiles fall back to a typeset panel: the
 * title set larger over the theme's own surface, with the first line of the
 * post as the picture's stand-in. It keeps the grid rhythm and stays
 * legible next to real covers.
 */
export function GalleryPostCard({ entry }: Props) {
  const entryData = entry.original_entry || entry;

  // Resolved and proxied by render-helper exactly like the default card:
  // json_metadata is authored on-chain, so the raw value is untrusted and
  // only a proxy URL (or null) ever reaches the src.
  const imageUrl = useMemo(
    () => catchPostImage(entryData, 600, 600) || null,
    [entryData],
  );

  // Only ever rendered in the no-image fallback, so it is computed for the
  // handful of text posts rather than for every tile on the wall.
  const summary = useMemo(
    () =>
      imageUrl
        ? null
        : entryData.json_metadata?.description ||
          postBodySummary(entryData.body, 160),
    [imageUrl, entryData],
  );

  // Same canonical link shape the default card uses: the '@' is part of the
  // post URL and the router leaves it unencoded.
  const postParams = useMemo(
    () => ({ author: `@${entryData.author}`, permlink: entryData.permlink }),
    [entryData.author, entryData.permlink],
  );
  const postSearch = { raw: undefined };

  return (
    <article className="group">
      <Link
        to="/$author/$permlink"
        params={postParams}
        search={postSearch}
        className="block no-underline text-theme-primary"
      >
        {imageUrl ? (
          <div className="overflow-hidden rounded-[var(--theme-post-card-image-radius)] bg-theme-secondary">
            <img
              src={imageUrl}
              srcSet={buildSrcSet(imageUrl) || undefined}
              /*
               * Measured from the rendered grid, not modelled from the
               * viewport. The container does not grow smoothly: Tailwind's
               * `container` snaps to breakpoint max-widths, so the tile
               * width steps rather than sliding, and the steps are what a
               * `vw` fraction cannot express. Measured at 1x:
               *
               *   <580  1 col, container 100vw-40   tile up to 535
               *   <768  2 col, container 100vw-40   tile 260 to 354
               *   <1024 2 col, container 728        tile 354
               *   <1280 3 col, container 984        tile 315
               *   else  4 col, container 1200 (cap) tile 285
               */
              sizes="(max-width: 579px) calc(100vw - 40px), (max-width: 767px) calc((100vw - 60px) / 2), (max-width: 1023px) 354px, (max-width: 1279px) 315px, 285px"
              alt={entryData.title}
              loading="lazy"
              className="w-full h-[var(--theme-post-card-image-height)] object-cover transition-theme group-hover:opacity-90"
            />
          </div>
        ) : (
          <div className="flex h-[var(--theme-post-card-image-height)] flex-col justify-center gap-2 rounded-[var(--theme-post-card-image-radius)] bg-theme-secondary p-5 border border-theme">
            <h2 className="heading-theme text-xl leading-snug line-clamp-3">
              {entryData.title}
            </h2>
            {summary && (
              <p className="text-sm text-theme-secondary line-clamp-3">
                {summary}
              </p>
            )}
          </div>
        )}

        {/* The wall label. When the tile already carries the title (the
            no-image case) this is date only, so it is never repeated. */}
        <div className="mt-2.5">
          {imageUrl && (
            <h2 className="heading-theme text-base leading-snug line-clamp-2">
              {entryData.title}
            </h2>
          )}
          <p className="text-xs text-theme-muted font-theme-ui mt-1">
            <time dateTime={entryData.created}>
              {formatDate(entryData.created)}
            </time>
            {entryData.community && entryData.community_title && (
              <span> · {entryData.community_title}</span>
            )}
          </p>
        </div>
      </Link>
    </article>
  );
}
