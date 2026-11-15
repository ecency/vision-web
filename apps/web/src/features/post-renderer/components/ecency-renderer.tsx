"use client";

import React, { HTMLProps, useEffect, useMemo, useRef } from "react";
import { renderPostBody } from "@ecency/render-helper";
import * as Sentry from "@sentry/nextjs";
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

// A body that breaks the markdown pipeline breaks it every time, and this
// renderer runs on the server AND again on hydration, and once more for every
// re-render of the feed row it sits in. Report the first failure per body and
// stay quiet after that, so one broken wave is one issue rather than a stream
// of identical events. Only bodies that already failed ever land here, and the
// set is cleared once it grows past a sane cap.
const reportedFailures = new Set<string>();

function reportRenderFailure(e: unknown, value: string) {
  const key = `${value.length}:${value.slice(0, 200)}`;

  if (reportedFailures.has(key)) {
    return;
  }

  if (reportedFailures.size >= 100) {
    reportedFailures.clear();
  }

  reportedFailures.add(key);
  Sentry.captureException(e, { extra: { where: "EcencyRenderer" } });
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

  // Lightweight postMessage listener for 3Speak orientation. ThreeSpeakVideoExtension
  // owns this for the players it builds, but it only enhances
  // .markdown-video-link-speak anchors - an <iframe> the author pasted is normalized
  // to a bare iframe.speak-iframe with no wrapper, so nothing ever sized it by
  // orientation and a 9:16 clip stayed in a 16:9 box. Those are handled here, along
  // with every player when embedVideosDirectly skips the extensions entirely.
  useEffect(() => {
    const embedsDirectly = renderOptions?.embedVideosDirectly ?? false;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://play.3speak.tv" || event.data?.type !== "3speak-player-ready") return;

      const iframes = ref.current?.querySelectorAll<HTMLIFrameElement>(".speak-iframe");
      iframes?.forEach((iframe) => {
        if (iframe.contentWindow == null || iframe.contentWindow !== event.source) return;

        const container = iframe.closest(".markdown-video-link-speak");
        // A wrapped player belongs to the extension whenever one is running.
        if (container && !embedsDirectly) return;

        // The player re-reports when the source changes, so drop any earlier
        // verdict instead of stacking classes.
        const target = container ?? iframe;
        target.classList.remove("speak-portrait", "speak-square");

        if (event.data.isVertical) {
          target.classList.add("speak-portrait");
        } else if (event.data.aspectRatio && Math.abs(event.data.aspectRatio - 1) < 0.1) {
          target.classList.add("speak-square");
        }
      });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [renderOptions?.embedVideosDirectly]);

  // Routes that ship their body inside the SSR shell (the entry page, the wave
  // page) have no Suspense boundary above this renderer, so a throw here is a
  // full-page error rather than one broken body. renderPostBody recovers from
  // malformed HTML internally, but its last-resort path runs sanitizeHtml over
  // the same output that just failed, so an input that breaks the sanitizer
  // throws all the way out: one out-of-range entity (`<div title="&#1114112;">`)
  // does it. Degrade to the escaped source text and report once, the same way
  // EntryPageStaticBody does for the entry route.
  let html: string | null;
  try {
    html = renderPostBody(value, false, false, 'ecency.com', seoContext, renderOptions);
  } catch (e) {
    html = null;
    reportRenderFailure(e, value);
  }

  // React rewrites innerHTML whenever it gets a new __html object, even for
  // the same string, which throws away every link the extensions enhanced.
  // Keep the object while the html is unchanged (#2082).
  const innerHtml = useMemo(() => (html === null ? null : { __html: html }), [html]);

  const className = clsx(
    "entry-body markdown-view user-selectable",
    pure ? "markdown-view-pure" : "",
    // Mounts the YouTube extension, which adds the video URL caption: the
    // placeholders reserve its room (#235).
    !pure && !renderOptions?.embedVideosDirectly ? "er-youtube-source-host" : "",
    other.className
  );

  return (
    <>
      {innerHtml === null ? (
        <div {...other} ref={ref} itemProp="articleBody" className={className}>
          <pre className="font-mono text-sm whitespace-pre-wrap break-words">{value}</pre>
        </div>
      ) : (
        <div
          {...other}
          ref={ref}
          itemProp="articleBody"
          className={className}
          dangerouslySetInnerHTML={innerHtml}
        />
      )}
      {!pure && (
        <>
          <ImageZoomExtension containerRef={ref} html={html} />
          <HivePostLinkExtension containerRef={ref} html={html} />
          {!renderOptions?.embedVideosDirectly && (
            <>
              <YoutubeVideoExtension containerRef={ref} html={html} />
              <ThreeSpeakVideoExtension containerRef={ref} images={images} html={html} />
              <EmbedVideoExtension containerRef={ref} body={html} />
            </>
          )}
          <WaveLikePostExtension containerRef={ref} embedDepth={embedDepth} html={html} />
          <TwitterExtension
            containerRef={ref}
            ComponentInstance={TwitterComponent}
            html={html}
          />
          <HiveOperationExtension
            containerRef={ref}
            onClick={onHiveOperationClick}
            html={html}
          />
        </>
      )}
    </>
  );
}
