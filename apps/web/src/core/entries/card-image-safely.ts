import { getEntryCardImage, getEntryCardImageRawUrl } from "@ecency/render-helper";
import { reportRenderHelperFailureOnce } from "./report-render-helper-failure";

// The card guards live apart from catchPostImageSafely so a card module that
// imports them never imports catchPostImage, whose full tier brings the
// markdown renderer into the browser bundle (#2113).

/**
 * The image a card shows (metadata, the regex tiers and a video poster),
 * without the markdown renderer, so card bundles leave it out (#2113).
 */
export function getEntryCardImageSafely(...args: Parameters<typeof getEntryCardImage>): string | null {
  try {
    return getEntryCardImage(...args);
  } catch (e) {
    reportRenderHelperFailureOnce("getEntryCardImage", args[0], e);
    return null;
  }
}

/**
 * `getEntryCardImageRawUrl`, degraded to "no raw URL" when it throws.
 *
 * The feed card calls it next to `catchPostImageSafely`, on the same entry and
 * during the same SSR render, to tell an animated cover apart. It runs the same
 * metadata and body scan as the extractor's first tier, so a body that breaks
 * that scan would be caught by the guard above and then rethrown from here,
 * which makes the guard above worth nothing on that card. Null is already what
 * the card handles: the cover is treated as not animated and keeps its srcset.
 */
export function getEntryCardImageRawUrlSafely(
  ...args: Parameters<typeof getEntryCardImageRawUrl>
): string | null {
  try {
    return getEntryCardImageRawUrl(...args);
  } catch (e) {
    reportRenderHelperFailureOnce("getEntryCardImageRawUrl", args[0], e);
    return null;
  }
}
