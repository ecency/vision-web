"use client";

import React, { RefObject, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { unmountRootsLater } from "../utils/unmount-roots-later";
import { fillWith, runUndos } from "../utils/dom-swap";

export function TwitterExtension({
  containerRef,
  ComponentInstance,
  html,
}: {
  containerRef: RefObject<HTMLElement | null>;
  ComponentInstance: React.FC<{ id: string }>;
  /** The rendered body. A change replaces the links, so they are enhanced again (#2083). */
  html?: string | null;
}) {
  const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);
  const undosRef = useRef<(() => void)[]>([]);

  useEffect(() => {

    const elements = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
            ".markdown-view:not(.markdown-view-pure) .markdown-external-link"
        ) ?? []
    );

    elements
        .filter((el) => {
          const href = el.getAttribute("href") || "";
          // Hostname-based check; startsWith would accept https://twitter.com.evil.com.
          try {
            const u = new URL(href);
            return (
              u.protocol === "https:" &&
              (u.hostname === "x.com" ||
                u.hostname === "twitter.com" ||
                u.hostname === "www.x.com" ||
                u.hostname === "www.twitter.com")
            );
          } catch {
            return false;
          }
        })
        .forEach((element) => {
          try {
            // Verify element is still connected to the DOM before manipulation
            if (!element.isConnected || !element.parentNode) {
              console.warn("Twitter link element is not connected to DOM, skipping");
              return;
            }

            const href = element.getAttribute("href");
            if (!href) return;

            let url;
            try {
              url = new URL(href);
            } catch {
              return;
            }
            const tweetId = url.pathname.split("/").pop();
            if (!tweetId) return;

            const container = document.createElement("div");
            container.classList.add("er-twitter-frame");

            // Final safety check before appending
            if (element.isConnected && element.parentNode) {
              element.classList.add("ecency-renderer-twitter-extension");
              const restore = fillWith(element, container);
              undosRef.current.push(() => {
                restore();
                element.classList.remove("ecency-renderer-twitter-extension");
              });

              const root = createRoot(container);
              rootsRef.current.push(root);
              root.render(<ComponentInstance id={tweetId} />);
            }
          } catch (e) {
            console.warn("TwitterExtension failed to render tweet:", e);
          }
        });

    return () => {
      unmountRootsLater(rootsRef.current);
      rootsRef.current = [];
      runUndos(undosRef.current);
    };
  }, [containerRef, html]);

  return null;
}
