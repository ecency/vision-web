import { Entry } from "@/entities";
import { buildSrcSet, catchPostImage, setProxyBase } from "@ecency/render-helper";
import { DEFAULT_IMAGE_SERVER } from "@/defaults";
import { THUMB_SIZES } from "./thumb-lcp";

// Server components live in their own module graph, so the setProxyBase() calls
// made by client modules do not apply here. Pin the base to
// DEFAULT_IMAGE_SERVER (a build-time constant) rather than the
// `defaults.imageServer` getter, which reads the per-user image_proxy override
// from localStorage: SSR cannot see that override, so the <img> it renders
// always uses the default host and a preload built from anything else would be
// a second, unused download.
setProxyBase(DEFAULT_IMAGE_SERVER);

interface Props {
  /**
   * Topmost cards, in render order, already narrowed to the eager window
   * (EAGER_THUMB_CARD_COUNT) and to what the list will actually show.
   */
  entries?: (Entry | undefined)[];
}

/**
 * The thumbnail EntryListItemThumbnail would render for this entry, or null
 * when it renders none — mirroring that component's gating so the preload can
 * never name an image the markup does not request.
 */
function resolveThumb(entryProp: Entry | undefined) {
  if (!entryProp) {
    return null;
  }

  // Mirror EntryListItemMutedContent: a cross-post renders the original.
  const entry = entryProp.original_entry ?? entryProp;

  // NSFW posts render no thumbnail server-side (the global nsfw flag and the
  // per-list override both default to false).
  const tags = entry.json_metadata?.tags;
  if (Array.isArray(tags) && tags.includes("nsfw")) {
    return null;
  }

  // Same call EntryListItemThumbnail makes. A null result means the card falls
  // back to the local /assets/noimage.png placeholder, which needs no preload.
  const src = catchPostImage(entry, 600, 500, "match");
  if (!src) {
    return null;
  }

  const srcSet = buildSrcSet(src);
  if (!srcSet) {
    return null;
  }

  return { src, srcSet };
}

/**
 * Emits a `<link rel="preload">` for the first eagerly-rendered feed thumbnail,
 * which React hoists into the document `<head>`.
 *
 * The entry list renders inside a Suspense boundary, so React flushes the
 * thumbnail's own preload together with that boundary's content — measured at
 * byte ~380,000 of a ~497,000-byte /hot response. The browser therefore cannot
 * discover the LCP image until roughly three quarters of the document has
 * streamed, which is what CF RUM reports as 2.6s p75 resource-load-delay on
 * feed pages (56% of those samples are "poor" LCP, the worst of any real
 * element on the site). Rendering the link from a layout, outside the boundary,
 * puts it in the stream ~374KB earlier.
 *
 * Takes the whole eager window rather than just the topmost card: the first
 * entry may be NSFW or image-less, in which case it renders no thumbnail and
 * the LCP candidate is the next card up. Only the first entry that actually
 * yields a thumbnail is preloaded — preloading more than one would spend the
 * head start on an image that is not the LCP.
 */
export function EntryListThumbPreload({ entries }: Props) {
  const thumb = (entries ?? []).reduce<ReturnType<typeof resolveThumb>>(
    (found, entry) => found ?? resolveThumb(entry),
    null
  );

  if (!thumb) {
    return null;
  }

  return (
    // `href` is required: React keys preload resources by href and drops a
    // <link rel="preload"> that lacks one (verified against a real render —
    // the link reached neither the head nor the body without it). Browsers
    // that honour imageSrcSet ignore href for selection and use it only as the
    // fallback candidate, which mirrors the <img src>+srcSet the thumbnail
    // renders.
    <link
      rel="preload"
      as="image"
      href={thumb.src}
      imageSrcSet={thumb.srcSet}
      imageSizes={THUMB_SIZES}
      fetchPriority="high"
    />
  );
}
