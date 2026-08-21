import { proxifyImageSrc } from "@ecency/render-helper";

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
