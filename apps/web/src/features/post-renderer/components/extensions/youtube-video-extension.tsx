"use client";

import React, { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { clsx } from "clsx";
import { isAllowedEmbedSrc } from "@ecency/render-helper";
import { getYoutubeEmbedUrl } from "../utils/getYoutubeEmbedUrl";
import { unmountRootsLater } from "../utils/unmount-roots-later";

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
    if (show) {
      const thumb = container.querySelector(".video-thumbnail");
      const playBtn = container.querySelector(".markdown-video-play");
      if (thumb) (thumb as HTMLElement).style.display = "none";
      if (playBtn) (playBtn as HTMLElement).style.display = "none";
    }
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
}: {
  containerRef: RefObject<HTMLElement | null>;
}) {
  const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);
  // The `er-youtube` marker and the appended frame are DOM mutations on nodes
  // React does not own, so cleanup undoes them. Left behind, Strict Mode's
  // setup-cleanup-setup cycle skipped every element on the second setup
  // (`:not(.er-youtube)`) and the placeholders never played (#1939).
  const enhancedRef = useRef<{ element: HTMLElement; frame: HTMLElement }[]>([]);

  const reset = useCallback(() => {
    unmountRootsLater(rootsRef.current);
    rootsRef.current = [];
    for (const { element, frame } of enhancedRef.current) {
      element.classList.remove("er-youtube");
      frame.remove();
    }
    enhancedRef.current = [];
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
        enhancedRef.current.push({ element, frame: container });

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

    return reset;
  }, [containerRef, reset]);

  return null;
}
