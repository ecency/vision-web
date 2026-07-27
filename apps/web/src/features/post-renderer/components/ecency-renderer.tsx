"use client";

import React, { HTMLProps, useEffect, useRef } from "react";
import { renderPostBody } from "@ecency/render-helper";
import type { RenderOptions, SeoContext } from "@ecency/render-helper";
import { clsx } from "clsx";
import "../ecency-renderer.scss";
import {
  EmbedVideoExtension,
  HiveOperationExtension,
  HivePostLinkExtension,
  ImageZoomExtension,
  WaveLikePostExtension,
  YoutubeVideoExtension,
} from "./extensions";
import { ThreeSpeakVideoExtension } from "./extensions/three-speak-video-extension";
import { TwitterExtension } from "./extensions/twitter-extension";

interface Props {
  value: string;
  pure?: boolean;
  seoContext?: SeoContext;
  onHiveOperationClick?: (op: string) => void;
  TwitterComponent?: any;
  images?: string[];
  renderOptions?: RenderOptions;
  /**
   * Nesting depth of embedded wave quotes (0 = top level). Threaded to
   * WaveLikePostExtension so quoted waves stop embedding past MAX_EMBED_DEPTH
   * (showing a compact stub instead of recursively rendering).
   */
  embedDepth?: number;
}

export function EcencyRenderer({
  value,
  pure = false,
  seoContext,
  onHiveOperationClick,
  TwitterComponent = () => <div>No twitter component</div>,
  images,
  renderOptions,
  embedDepth = 0,
  ...other
}: HTMLProps<HTMLDivElement> & Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Lightweight postMessage listener for 3Speak orientation when videos are embedded directly
  useEffect(() => {
    if (!renderOptions?.embedVideosDirectly) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://play.3speak.tv" || event.data?.type !== "3speak-player-ready") return;

      const iframes = ref.current?.querySelectorAll<HTMLIFrameElement>(".speak-iframe");
      iframes?.forEach((iframe) => {
        if (iframe.contentWindow == null || iframe.contentWindow !== event.source) return;
        const container = iframe.closest(".markdown-video-link-speak");
        if (!container) return;

        if (event.data.isVertical) {
          container.classList.add("speak-portrait");
        } else if (event.data.aspectRatio && Math.abs(event.data.aspectRatio - 1) < 0.1) {
          container.classList.add("speak-square");
        }
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [renderOptions?.embedVideosDirectly]);

  return (
    <>
      <div
        {...other}
        ref={ref}
        itemProp="articleBody"
        className={clsx(
          "entry-body markdown-view user-selectable",
          pure ? "markdown-view-pure" : "",
          other.className
        )}
        dangerouslySetInnerHTML={{ __html: renderPostBody(value, false, false, 'ecency.com', seoContext, renderOptions) }}
      />
      {!pure && (
        <>
          <ImageZoomExtension containerRef={ref} />
          <HivePostLinkExtension containerRef={ref} />
          {!renderOptions?.embedVideosDirectly && (
            <>
              <YoutubeVideoExtension containerRef={ref} />
              <ThreeSpeakVideoExtension containerRef={ref} images={images} />
              <EmbedVideoExtension containerRef={ref} />
            </>
          )}
          <WaveLikePostExtension containerRef={ref} embedDepth={embedDepth} />
          <TwitterExtension
            containerRef={ref}
            ComponentInstance={TwitterComponent}
          />
          <HiveOperationExtension
            containerRef={ref}
            onClick={onHiveOperationClick}
          />
        </>
      )}
    </>
  );
}
