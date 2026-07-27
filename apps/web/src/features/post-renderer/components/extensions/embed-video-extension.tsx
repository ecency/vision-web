"use client";

import React, { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { isAllowedEmbedSrc } from "@ecency/render-helper";

/**
 * Click-to-play for the video providers that have no thumbnail we can derive
 * without a network call (Odysee, BitChute, Rumble, Brighteon).
 *
 * YouTube and 3Speak each get a dedicated extension because both carry
 * provider-specific work (start-time parsing, portrait detection, thumbnail
 * resolution from post metadata). These four need none of that: the renderer
 * already put the final embed URL in `data-embed-src`, so the only behaviour
 * required is "swap the placeholder for an iframe when the reader clicks it".
 *
 * Without this the renderer's `data-embed-src` had no consumer at all for these
 * providers, so their links rendered as an inert placeholder that did nothing on
 * click.
 */
const SELECTOR = [
  "markdown-video-link-odysee",
  "markdown-video-link-bitchute",
  "markdown-video-link-rumble",
  "markdown-video-link-brighteon"
]
  .map((cls) => `.markdown-view:not(.markdown-view-pure) .${cls}:not(.er-embed)`)
  .join(", ");

export function EmbedVideoRenderer({
  embedSrc,
  container
}: {
  embedSrc: string;
  container: HTMLElement;
}) {
  const [show, setShow] = useState(false);

  const handler = useCallback(() => setShow(true), []);

  useEffect(() => {
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [container, handler]);

  useEffect(() => {
    if (!show) {
      return;
    }
    const playBtn = container.querySelector(".markdown-video-play");
    if (playBtn) {
      (playBtn as HTMLElement).style.display = "none";
    }
  }, [show, container]);

  // Belt-and-suspenders: never assign an off-allowlist / non-https value to the
  // iframe src even if a hostile data-embed-src slipped past the sanitizer.
  if (!isAllowedEmbedSrc(embedSrc)) {
    return null;
  }

  return show ? (
    <iframe
      src={embedSrc}
      title="Video player"
      frameBorder="0"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  ) : null;
}

export function EmbedVideoExtension({
  containerRef
}: {
  containerRef: RefObject<HTMLElement | null>;
}) {
  const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);
  // The `er-embed` marker and the appended frame are DOM mutations on nodes
  // React does not own (the body is set via dangerouslySetInnerHTML), so
  // cleanup has to undo them explicitly. Leaving them behind meant Strict
  // Mode's setup-cleanup-setup cycle skipped every element on the second
  // setup — `:not(.er-embed)` already excluded them — leaving placeholders
  // with no click listener for the rest of the mount.
  const enhancedRef = useRef<{ element: HTMLElement; frame: HTMLElement }[]>([]);

  const reset = useCallback(() => {
    for (const r of rootsRef.current) {
      r.unmount();
    }
    rootsRef.current = [];
    for (const { element, frame } of enhancedRef.current) {
      element.classList.remove("er-embed");
      frame.remove();
    }
    enhancedRef.current = [];
  }, []);

  useEffect(() => {
    reset();

    const elements = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(SELECTOR) ?? []
    );

    elements.forEach((element) => {
      try {
        // Verify element is still connected to the DOM before manipulation
        if (!element.isConnected || !element.parentNode) {
          return;
        }

        const embedSrc = element.dataset.embedSrc;
        // Unlike the YouTube extension there is no href to fall back to — the
        // renderer strips it — so a missing/rejected src means there is nothing
        // to play and the placeholder is left alone rather than made clickable.
        if (!embedSrc || !isAllowedEmbedSrc(embedSrc)) {
          return;
        }

        const container = document.createElement("div");
        container.classList.add("er-embed-frame");
        element.classList.add("er-embed");
        // Tracked as soon as the marker goes on, not after the append below:
        // if that final check fails the marker still needs undoing, and
        // remove() on a never-appended node is a no-op.
        enhancedRef.current.push({ element, frame: container });

        const root = createRoot(container);
        rootsRef.current.push(root);
        root.render(<EmbedVideoRenderer embedSrc={embedSrc} container={element} />);

        // Final safety check before appending
        if (element.isConnected && element.parentNode) {
          element.appendChild(container);
        }
      } catch (error) {
        console.warn("Error enhancing embedded video element:", error);
      }
    });

    return reset;
  }, [containerRef, reset]);

  return null;
}
