import React, { useEffect, useMemo, useState } from "react";
import { Entry } from "@/entities";
import { useGlobalStore } from "@/core/global-store";
import { EntryLink } from "@/features/shared";
import { buildSrcSet, catchPostImage, proxifyImageSrc } from "@ecency/render-helper";
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
  const src = useMemo(() => catchPostImage(entry, 600, 500, "match") || null, [entry]);
  const srcSet = useMemo(() => (src ? buildSrcSet(src) : ""), [src]);

  const blurUrl = useMemo(() => {
    const url = catchPostImage(entry, 0, 0);
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
