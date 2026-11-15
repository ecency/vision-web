"use client";

import React, { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { clsx } from "clsx";
import { isAllowedEmbedSrc } from "@ecency/render-helper";
import { getYoutubeEmbedUrl } from "../utils/getYoutubeEmbedUrl";
import { unmountRootsLater } from "../utils/unmount-roots-later";
import { setVideoPlaceholderVisible } from "../utils/video-placeholder";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const YOUTUBE_EMBED_SRC = /^(?:https?:)?\/\/(?:www\.|m\.)?youtube\.com\/embed\/([^?#/]+)/i;
// A pasted player's id: exactly a video id. embed/videoseries (a playlist) and
// embed/live_stream (a channel's stream) are 11 characters too, so they are
// named: neither gets a watch link.
const YOUTUBE_VIDEO_ID = /^(?!videoseries$|live_stream$)[A-Za-z0-9_-]{11}$/;

/**
 * YouTube players the author pasted as an <iframe>: render-helper keeps them
 * with no placeholder, so they get the caption directly. Players inside a
 * placeholder (click-to-play, waves' direct embeds) are not these.
 */
const PASTED_YOUTUBE_IFRAMES =
  '.markdown-view:not(.markdown-view-pure) iframe[src*="youtube.com/embed/"]:not([data-enhanced])';

/**
 * Captions the pasted YouTube players in `container`. Each is marked
 * (`data-enhanced`, which drops its reserved room) in the same step its caption
 * is added; an id that is not a YouTube id is marked with no caption. Returns
 * the marked players for {@link detachYoutubeIframeSources}.
 */
export function attachYoutubeIframeSources(container: ParentNode): HTMLIFrameElement[] {
  const iframes = Array.from(container.querySelectorAll<HTMLIFrameElement>(PASTED_YOUTUBE_IFRAMES)).filter(
    // The parent's ancestors, not the iframe itself: an author-written
    // class="markdown-video-link" on the iframe does not make it a placeholder's.
    (iframe) => !iframe.parentElement?.closest(".markdown-video-link")
  );
  for (const iframe of iframes) {
    iframe.dataset.enhanced = "true";
    const source = attachYoutubeSource(iframe);
    // A landscape player sits at the left edge (a Short's is centred).
    if (source && !iframe.classList.contains("portrait-embed")) {
      source.classList.add("er-youtube-source-start");
    }
  }
  return iframes;
}

/** Undoes {@link attachYoutubeIframeSources} for these players. */
export function detachYoutubeIframeSources(iframes: Iterable<HTMLIFrameElement>): void {
  for (const iframe of iframes) {
    const next = iframe.nextElementSibling;
    if (next?.classList.contains("er-youtube-source")) next.remove();
    delete iframe.dataset.enhanced;
  }
}

/**
 * The posted video's own URL, rebuilt from the placeholder (render-helper drops
 * the href): a Short links to its Shorts page, a start time is kept. Null when
 * the id is not a YouTube video id.
 */
export function youtubeSourceUrl(element: HTMLElement): { href: string; label: string } | null {
  let id: string;
  let portrait: boolean;
  let start: string;
  if (element instanceof HTMLIFrameElement) {
    // A pasted player: render-helper keeps it as /embed/<id> (query stripped, so
    // there is no start time to keep) and marks a Short's with portrait-embed.
    const src = element.getAttribute("src") ?? "";
    id = YOUTUBE_EMBED_SRC.exec(src)?.[1] ?? "";
    if (!YOUTUBE_VIDEO_ID.test(id)) return null;
    portrait = element.classList.contains("portrait-embed");
    start = "";
  } else {
    id = (element.dataset.youtube ?? "").split("?")[0];
    portrait = element.classList.contains("markdown-video-link-youtube-portrait");
    start = element.dataset.startTime ?? "";
  }
  if (!YOUTUBE_ID.test(id)) return null;
  const path = portrait ? `shorts/${id}` : `watch?v=${id}`;
  const time = /^[1-9][0-9]{0,6}$/.test(start) ? `${path.includes("?") ? "&" : "?"}t=${start}s` : "";
  const label = `youtube.com/${path}${time}`;
  return { href: `https://www.${label}`, label };
}

/**
 * Puts the video's URL right after the placeholder, outside it so a click opens
 * the link instead of starting the video (#235). Returns the link to remove on
 * cleanup, or null when there is no valid id.
 */
export function attachYoutubeSource(element: HTMLElement): HTMLAnchorElement | null {
  const url = youtubeSourceUrl(element);
  if (!url) return null;
  const source = document.createElement("a");
  source.className = "er-youtube-source";
  source.href = url.href;
  source.target = "_blank";
  source.rel = "noopener noreferrer nofollow";
  source.textContent = url.label;
  element.after(source);
  return source;
}

export function YoutubeVideoRenderer({
   embedSrc,
   container,
 }: {
  embedSrc: string;
  container: HTMLElement;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [container]);

  useEffect(() => {
    if (show) setVideoPlaceholderVisible(container, false);
  }, [show, container]);

  // Belt-and-suspenders: never assign an off-allowlist / non-https value to the
  // iframe src even if a hostile data-embed-src slipped past the sanitizer.
  if (!isAllowedEmbedSrc(embedSrc)) return null;

  return show ? (
    <iframe
      className="youtube-shorts-iframe"
      src={embedSrc}
      title="Video player"
      frameBorder="0"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  ) : null;
}

export function YoutubeVideoExtension({
  containerRef,
  html,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** The rendered body. A change replaces the links, so they are enhanced again. */
  html?: string | null;
}) {
  const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);
  // The `er-youtube` marker and the appended frame are DOM mutations on nodes
  // React does not own, so cleanup undoes them. Left behind, Strict Mode's
  // setup-cleanup-setup cycle skipped every element on the second setup
  // (`:not(.er-youtube)`) and the placeholders never played (#1939).
  const enhancedRef = useRef<
    { element: HTMLElement; frame: HTMLElement; source: HTMLElement | null }[]
  >([]);
  const iframesRef = useRef<HTMLIFrameElement[]>([]);

  const reset = useCallback(() => {
    unmountRootsLater(rootsRef.current);
    rootsRef.current = [];
    for (const { element, frame, source } of enhancedRef.current) {
      element.classList.remove("er-youtube");
      frame.remove();
      source?.remove();
      setVideoPlaceholderVisible(element, true);
    }
    enhancedRef.current = [];
    detachYoutubeIframeSources(iframesRef.current);
    iframesRef.current = [];
  }, []);

  useEffect(() => {
    reset();

    const elements = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(
        ".markdown-view:not(.markdown-view-pure) .markdown-video-link-youtube:not(.er-youtube)",
      ) ?? [],
    );
    elements.forEach((element) => {
      try {
        // Verify element is still connected to the DOM before manipulation
        if (!element.isConnected || !element.parentNode) {
          console.warn("YouTube video element is not connected to DOM, skipping");
          return;
        }

        const embedSrc =
          element.dataset.embedSrc ||
          getYoutubeEmbedUrl(element.getAttribute("href") ?? "");
        element.dataset.embedSrc = embedSrc;
        const container = document.createElement("div");

        container.classList.add("er-youtube-frame");
        element.classList.add("er-youtube");

        const source = attachYoutubeSource(element);
        enhancedRef.current.push({ element, frame: container, source });

        // Use createRoot instead of hydrateRoot (no server-rendered content to hydrate)
        const root = createRoot(container);
        rootsRef.current.push(root);
        root.render(<YoutubeVideoRenderer embedSrc={embedSrc} container={element} />);

        // Final safety check before appending
        if (element.isConnected && element.parentNode) {
          element.appendChild(container);
        }
      } catch (error) {
        console.warn("Error enhancing YouTube video element:", error);
      }
    });

    if (containerRef.current) {
      iframesRef.current = attachYoutubeIframeSources(containerRef.current);
    }

    return reset;
  }, [containerRef, reset, html]);

  return null;
}
