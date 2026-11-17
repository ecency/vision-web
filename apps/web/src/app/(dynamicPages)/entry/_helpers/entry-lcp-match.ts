import { getEntryLcpImage, proxifyImageSrc } from "@ecency/render-helper";
import type { Entry } from "@/entities";

/**
 * The format=match preload URL for a cover the entry page cannot preload as a
 * <picture> (gif, svg, extensionless, already-proxified). It is derived from
 * the SAME raw cover the page renders (getEntryImageRawUrl: metadata image,
 * then the first body image), never from catchPostImage, which prefers an
 * explicit json_metadata.thumbnails entry. A thumbnail is a card concern; the
 * post body does not render it, so preloading it would be a wasted request
 * and would cost the real cover its head start.
 *
 * Sizing follows what the body renders for that cover: a gif stays unsized so
 * the proxy does not flatten the animation, everything else is requested at
 * the thumbnail size the body's <img> uses.
 */
export function entryLcpMatch(rawCover: string | null | undefined): string | null {
  if (!rawCover) {
    return null;
  }
  const proxied = /\.gif$/i.test(rawCover)
    ? proxifyImageSrc(rawCover, 0, 0, "match")
    : proxifyImageSrc(rawCover, 600, 500, "match");
  return proxied || null;
}

/**
 * What the entry page preloads for its first image (#2119). `rawCover` feeds
 * the <picture> / format=match preload as before. A YouTube link before the
 * first image makes its poster the page's first image, rendered as a plain
 * format=match <img>, so it gets that one URL as `posterHref` instead (and no
 * cover preload, which would download an image the page does not show first).
 */
export function entryLcpPreload(entry: Entry): { rawCover: string | null; posterHref: string | null } {
  let lcp: ReturnType<typeof getEntryLcpImage> = null;
  try {
    lcp = getEntryLcpImage(entry);
  } catch {
    // A body the scan cannot read gets no preload; the page still renders.
    return { rawCover: null, posterHref: null };
  }
  if (lcp?.poster) {
    return { rawCover: null, posterHref: proxifyImageSrc(lcp.url, 0, 0, "match") || null };
  }
  return { rawCover: lcp?.url ?? null, posterHref: null };
}
