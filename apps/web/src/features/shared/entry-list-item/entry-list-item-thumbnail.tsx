import React, { useEffect, useMemo, useState } from "react";
import { Entry } from "@/entities";
import { useGlobalStore } from "@/core/global-store";
import { EntryLink } from "@/features/shared";
import { buildSrcSet, proxifyImageSrc } from "@ecency/render-helper";
import {
  catchPostImageSafely,
  getEntryCardImageRawUrlSafely
} from "@/core/entries/catch-post-image-safely";
import Image from "next/image";
import { THUMB_SIZES } from "./thumb-lcp";

interface Props {
  entry: Entry;
  noImage: string;
  isCrossPost: boolean;
  entryProp: Entry;
  // First above-the-fold item(s): render the thumbnail eagerly with high fetch
  // priority so it can be the LCP without waiting behind lazy images.
  isThumbLcp?: boolean;
}

export function EntryListItemThumbnail({
  entry,
  noImage,
  isCrossPost,
  entryProp,
  isThumbLcp = false
}: Props) {
  const listStyle = useGlobalStore((state) => state.listStyle);
  const isGrid = listStyle === "grid";

  // Proxied thumbnail URL computed SYNCHRONOUSLY (no client blob fetch), so the
  // <img src>/<srcset> lands in the server HTML and the browser can discover and
  // start the LCP image at parse time. catchPostImage already returns a fully
  // proxified i.ecency.com URL — the same path post-body/cover images use — so
  // the old useImageDownloader blob→base64 round-trip (which gated this behind
  // JS download + hydration) is not needed.
  // catchPostImageSafely, not catchPostImage: this runs during the SSR render
  // of every feed row, with no boundary above it, and the extractor can throw on
  // an author-crafted body. A throw degrades to "no thumbnail" (the noImage
  // placeholder) instead of taking the page down.
  const src = useMemo(() => catchPostImageSafely(entry, 600, 500, "match") || null, [entry]);

  // The gif carve-out that used to live here moves rather than disappearing, and
  // the two halves point in OPPOSITE directions, so read both before touching it.
  //
  // It was BLUR that needed guarding: the host handed animated gifs back
  // untransformed at every size, so `?blur=1` returned the original file and the
  // LQIP layer became a second download of it (1.5 MB for a 150px slot,
  // #1802/#1803). ecency/imagehoster#47 renders the blur from the FIRST FRAME,
  // which is what this layer always wanted, so that guard is gone. Verified on
  // production against 16 real animated sources: every `?blur=1` came back as
  // 279-899 bytes of image/jpeg, at the source's own single-frame aspect (a
  // 1080x1350 x150 gif gives 20x25, a 720x540 x408 gives 20x15).
  //
  // It is SRCSET that needs guarding now, which is the reverse of what #1803
  // assumed when it kept srcset on the grounds that "for a static gif those
  // candidates are real". For an ANIMATED one they are not, at any width worth
  // picking. buildSrcSet emits width-ONLY URLs, and an animated render costs
  // frames x width x height, so a width with no height cap is unbounded in the
  // axis that matters: on a 1080x1350 x150 source, ?width=600 is 67 MP and
  // ?width=800 is 120 MP, both over the host's output budget, so both come back
  // as the untouched 1.5 MB original. `sizes` here is 100vw on mobile, so the
  // browser picks exactly those. Measured live on the two /trending cards that
  // have a gif cover:
  //
  //   srcset ?width=600/800/1024/1280  ->  1,572,008 B  image/gif  (passthrough)
  //   src    ?width=600&height=500     ->    196,832 B  image/webp
  //
  // The src box is capped on BOTH axes, so its output is bounded (30 MP here) and
  // the host renders it. Dropping srcset therefore makes the browser fetch the
  // one variant that is real. A static gif loses its responsive variants and
  // fetches the 600x500 src into a 150px desktop slot, which is a few KB more on
  // a rare card; an animated one stops pulling the full file, which is 1.4 MB.
  const isAnimationCandidate = useMemo(() => {
    // Card precedence, NOT getEntryImageRawUrl: that one skips
    // json_metadata.thumbnails on purpose, so it can name a different file than
    // the one this card renders.
    // Guarded for the same reason as the two catchPostImageSafely calls.
    const raw = getEntryCardImageRawUrlSafely(entry);
    return !!raw && /\.gif(?:[?#]|$)/i.test(raw);
  }, [entry]);

  const srcSet = useMemo(
    () => (src && !isAnimationCandidate ? buildSrcSet(src) : ""),
    [src, isAnimationCandidate]
  );

  const blurUrl = useMemo(() => {
    const url = catchPostImageSafely(entry, 0, 0);
    if (!url) return null;
    // Route the LQIP placeholder through the /p/ proxy so `blur=1` is honored.
    // Appending `?blur=1` to a bare upload URL hits the direct-serve route,
    // which ignores the param and returns the full-resolution image.
    return proxifyImageSrc(url, 0, 0, "match", { blur: true }) || null;
  }, [entry]);

  // Loop-safe one-shot fallback to the noImage placeholder. This preserves what
  // the old query's try/catch did (swap to noImage on a failed load) without the
  // request loop a naive onError can cause: once we've fallen back we never
  // re-assign src. Reset when the row is reused for a different entry.
  const [errored, setErrored] = useState(false);
  useEffect(() => setErrored(false), [entry.author, entry.permlink]);

  const hasFullImage = !!src && !errored;
  const displaySrc = hasFullImage ? (src as string) : noImage;

  const showImage = useMemo(() => {
    const isComment = !!entry.parent_permlink && entry.parent_permlink !== entry.permlink;
    return !isComment || !!src;
  }, [entry.parent_permlink, entry.permlink, src]);

  return (
    showImage && (
      <div className={"item-image " + (!hasFullImage ? "noImage" : "")}>
        <EntryLink className="h-full" entry={isCrossPost ? entryProp : entry}>
          <div className="h-full w-full relative overflow-hidden">
            {/* LQIP placeholder behind the real image; the real image (opaque on
                load) covers it. Kept fully visible so it never gates the LCP
                paint on JS. */}
            {blurUrl && hasFullImage && (
              <img
                src={blurUrl}
                alt=""
                aria-hidden="true"
                // Lazy for every card the reader has not scrolled to, and the
                // attribute is load-bearing rather than cosmetic: React hoists a
                // <link rel=preload as=image> into <head> for each EAGER <img> it
                // renders in the shell, and this layer has one per card. While the
                // feed sat behind a loading.tsx boundary those links were held back
                // with it; #1786 put the cards in the shell, which released ~21 blur
                // preloads into <head> on a 20-card feed, all of them competing with
                // the real LCP image on a throttled link. The two eager cards keep
                // an eager placeholder so their paint is still instant.
                loading={isThumbLcp ? "eager" : "lazy"}
                decoding={isThumbLcp ? undefined : "async"}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {isGrid ? (
              <Image
                width={1000}
                height={1000}
                className="w-full h-full object-cover mx-auto relative"
                src={displaySrc}
                alt={entry.title}
                priority={isThumbLcp}
                onError={() => setErrored(true)}
              />
            ) : (
              <img
                className="w-full relative"
                src={displaySrc}
                srcSet={hasFullImage && srcSet ? srcSet : undefined}
                sizes={hasFullImage && srcSet ? THUMB_SIZES : undefined}
                alt={entry.title}
                loading={isThumbLcp ? "eager" : "lazy"}
                fetchPriority={isThumbLcp ? "high" : undefined}
                decoding={isThumbLcp ? undefined : "async"}
                onError={() => setErrored(true)}
              />
            )}
          </div>
        </EntryLink>
      </div>
    )
  );
}
