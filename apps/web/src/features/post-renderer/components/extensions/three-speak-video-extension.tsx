"use client";

import React, { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { isAllowedEmbedSrc } from "@ecency/render-helper";
import { injectThreeSpeakThumbnail } from "../utils/threeSpeakThumbnail";
import { unmountRootsLater } from "../utils/unmount-roots-later";
import { setVideoPlaceholderVisible } from "../utils/video-placeholder";

type VideoOrientation = "landscape" | "portrait" | "square";

const THREE_SPEAK_EMBED_ORIGIN = "https://play.3speak.tv";

export function ThreeSpeakVideoRenderer({
  embedSrc,
  container,
}: {
  embedSrc: string;
  container: HTMLElement;
}) {
  const [show, setShow] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [orientation, setOrientation] = useState<VideoOrientation>("landscape");

  useEffect(() => {
    const handler = () => setShow(true);
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [container]);

  useEffect(() => {
    if (show) setVideoPlaceholderVisible(container, false);
  }, [show, container]);

  // Listen for 3speak-player-ready to auto-detect video orientation
  useEffect(() => {
    if (!show) return;

    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin !== THREE_SPEAK_EMBED_ORIGIN ||
        event.data?.type !== "3speak-player-ready" ||
        iframeRef.current?.contentWindow == null ||
        iframeRef.current?.contentWindow !== event.source
      ) {
        return;
      }

      if (event.data.isVertical) {
        setOrientation("portrait");
      } else if (
        event.data.aspectRatio &&
        Math.abs(event.data.aspectRatio - 1) < 0.1
      ) {
        setOrientation("square");
      } else {
        setOrientation("landscape");
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [show]);

  // Apply orientation class to the parent container element
  useEffect(() => {
    if (orientation !== "landscape") {
      container.classList.add(`speak-${orientation}`);
    }
    return () => {
      container.classList.remove("speak-portrait", "speak-square");
    };
  }, [orientation, container]);

  // Belt-and-suspenders: never assign an off-allowlist / non-https value to the
  // iframe src even if a hostile data-embed-src slipped past the sanitizer.
  if (!isAllowedEmbedSrc(embedSrc)) return null;

  return show ? (
    <iframe
      ref={iframeRef}
      className="speak-iframe"
      src={embedSrc}
      title="3Speak video"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  ) : null;
}

/**
 * For waves/thread context: creates an iframe directly via DOM (synchronous).
 * Avoids the async createRoot.render() issue that leaves empty containers.
 * Also listens for orientation messages from the 3Speak player.
 */
function embedThreeSpeakDirect(element: HTMLElement, embedSrc: string): () => void {
  // Refuse to build an iframe for a value that isn't an allowed https embed.
  if (!isAllowedEmbedSrc(embedSrc)) return () => {};

  const playBtn = element.querySelector(".markdown-video-play");
  if (playBtn) (playBtn as HTMLElement).style.display = "none";

  const wrapper = document.createElement("div");
  wrapper.classList.add("er-speak-frame");

  const iframe = document.createElement("iframe");
  iframe.className = "speak-iframe";
  iframe.src = embedSrc;
  iframe.title = "3Speak video";
  iframe.setAttribute(
    "allow",
    "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
  );
  iframe.allowFullscreen = true;

  wrapper.appendChild(iframe);
  element.classList.add("er-speak");
  element.appendChild(wrapper);

  // Listen for orientation from 3Speak player
  const handleMessage = (event: MessageEvent) => {
    if (
      event.origin !== THREE_SPEAK_EMBED_ORIGIN ||
      event.data?.type !== "3speak-player-ready" ||
      iframe.contentWindow == null ||
      iframe.contentWindow !== event.source
    ) {
      return;
    }

    if (event.data.isVertical) {
      element.classList.add("speak-portrait");
    } else if (
      event.data.aspectRatio &&
      Math.abs(event.data.aspectRatio - 1) < 0.1
    ) {
      element.classList.add("speak-square");
    }
  };

  window.addEventListener("message", handleMessage);
  return () => {
    window.removeEventListener("message", handleMessage);
    element.classList.remove("speak-portrait", "speak-square", "er-speak");
    // Undo the DOM changes too, so a re-run (Strict Mode) embeds it again.
    wrapper.remove();
    if (playBtn) (playBtn as HTMLElement).style.display = "";
  };
}

export function ThreeSpeakVideoExtension({
  containerRef,
  images,
  html,
}: {
  containerRef: RefObject<HTMLElement | null>;
  images?: string[];
  /** The rendered body. A change replaces the links, so they are enhanced again. */
  html?: string | null;
}) {
  const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);
  const cleanupFnsRef = useRef<(() => void)[]>([]);
  // The `er-speak` marker and the appended frame are DOM mutations on nodes
  // React does not own, so cleanup undoes them. Left behind, Strict Mode's
  // setup-cleanup-setup cycle skipped every element on the second setup
  // (`:not(.er-speak)`) and the placeholders never played (#1939).
  const enhancedRef = useRef<{ element: HTMLElement; frame: HTMLElement }[]>([]);

  const reset = useCallback(() => {
    unmountRootsLater(rootsRef.current);
    rootsRef.current = [];
    cleanupFnsRef.current.forEach(fn => fn());
    cleanupFnsRef.current = [];
    for (const { element, frame } of enhancedRef.current) {
      element.classList.remove("er-speak");
      frame.remove();
      setVideoPlaceholderVisible(element, true);
    }
    enhancedRef.current = [];
  }, []);

  useEffect(() => {
    reset();

    const elements = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(
        ".markdown-view:not(.markdown-view-pure) .markdown-video-link-speak:not(.er-speak)"
      ) ?? []
    );
    elements.forEach((element) => {
      try {
        if (!element.isConnected || !element.parentNode) return;

        const embedSrc = element.dataset.embedSrc ?? "";
        const isInThread = !!element.closest(".waves-list-item, .thread-render");

        if (isInThread) {
          // Waves: synchronous DOM iframe, no play overlay
          const cleanup = embedThreeSpeakDirect(element, embedSrc);
          cleanupFnsRef.current.push(cleanup);
        } else {
          // Entry pages: click-to-play with thumbnail
          injectThreeSpeakThumbnail(element, images);

          const container = document.createElement("div");
          container.classList.add("er-speak-frame");
          element.classList.add("er-speak");
          enhancedRef.current.push({ element, frame: container });

          const root = createRoot(container);
          rootsRef.current.push(root);
          root.render(
            <ThreeSpeakVideoRenderer
              embedSrc={embedSrc}
              container={element}
            />
          );

          if (element.isConnected && element.parentNode) {
            element.appendChild(container);
          }
        }
      } catch (error) {
        console.warn("Error enhancing 3Speak video element:", error);
      }
    });

    return reset;
  }, [images, reset, html]);

  return <></>;
}
