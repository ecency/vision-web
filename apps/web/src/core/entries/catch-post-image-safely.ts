import { catchPostImage } from "@ecency/render-helper";
import { reportRenderHelperFailureOnce } from "./report-render-helper-failure";

/**
 * `catchPostImage`, degraded to "this post has no thumbnail" when it throws.
 *
 * The call is not optional-extra work: feed cards, the feed thumbnail preload
 * and search rows all make it during the SSR render, outside any Suspense
 * boundary, so a throw is a blank route rather than a missing image. And it
 * can throw on author-controlled input — `sanitizeHtml` decoded numeric
 * character references with a bare `String.fromCodePoint`, so a body carrying
 * `<div title="&#x110000;">` raised a RangeError from inside the extractor.
 * That defect is fixed at its source in @ecency/render-helper, and the web app
 * builds the package from source (apps/web/Dockerfile, and `build:packages`
 * ahead of the tests in CI), so this guard is not what closes it. It is here
 * for the NEXT one: the extractor parses author markdown through a sanitiser
 * and a DOM, on the SSR path of the busiest routes, with nothing above it to
 * contain a throw.
 *
 * Feed rows are normally slimmed to `body: ""`, which starves the markdown
 * tier, but three paths carry a full body to these calls: `slimEntrySafely`
 * handing back the un-slimmed entry when slimming throws, the
 * comments/replies profile sections (BODY_BACKED_SECTIONS, reachable as
 * /feed/comments/@user), and the profile's pinned entry, which is fetched
 * through the post cache and never slimmed.
 *
 * Returning null is exactly what these components already handle: the
 * thumbnail falls back to the noimage placeholder (or hides itself for a
 * comment), the preload emits no <link>, the search row shows its placeholder.
 *
 * The report-once bookkeeping lives in ./report-render-helper-failure, shared
 * with the summary guard next to it.
 */
export function catchPostImageSafely(...args: Parameters<typeof catchPostImage>): string | null {
  try {
    return catchPostImage(...args);
  } catch (e) {
    reportRenderHelperFailureOnce("catchPostImage", args[0], e);
    return null;
  }
}
