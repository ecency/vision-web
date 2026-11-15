"use client";

import type { Zoom } from "medium-zoom";
import React, { RefObject, useEffect, useRef } from "react";
import { zoomReplaceTarget, zoomEffectiveParent } from "../utils/picture-zoom";

export function ImageZoomExtension({
 containerRef,
 html,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** The rendered body. A change replaces the images, so they are wrapped again (#2083). */
  html?: string | null;
}) {
  const zoomRef = useRef<Zoom>(undefined);

  useEffect(() => {
    let isMounted = true; // Track mount state to prevent post-unmount zoom attachment
    let rafId = 0;

    const elements = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
            ".markdown-view:not(.markdown-view-pure) img"
        ) ?? []
    ).filter((x) => {
        try {
            // Verify element is still connected to the DOM
            if (!x.isConnected) {
                return false;
            }

            // Safe parentNode access with null checking for iOS Safari
            const parentNode = x.parentNode;
            if (!parentNode) {
                return false;
            }

            // When the <img> is inside a <picture> (responsive content
            // negotiation), the element we wrap/replace is the <picture>, so the
            // "linked image" check must look at the <picture>'s parent.
            const effectiveParent = zoomEffectiveParent(parentNode);
            if (!effectiveParent) {
                return false;
            }

            return (
                effectiveParent.nodeName !== "A" &&
                !x.classList.contains("medium-zoom-image") &&
                !x.closest(".markdown-image-container")
            );
        } catch (error) {
            // Handle iOS Safari security errors or other DOM access issues
            console.warn("Error accessing image element properties:", error);
            return false;
        }
    });

    elements.forEach((el) => {
      try {
        // Re-verify element is still connected before manipulation
        if (!el.isConnected) {
            console.warn("Image element is no longer connected to DOM, skipping");
            return;
        }

        // When the <img> sits inside a <picture>, wrap/replace the whole
        // <picture> so the <img> stays a DIRECT child of it — otherwise the
        // <source> elements are ignored and the format=match URL loads.
        const zoomTarget = zoomReplaceTarget(el);

        // Verify parentElement exists before attempting manipulation
        const parentElement = zoomTarget.parentElement;
        if (!parentElement) {
            console.warn("Image element has no parent, skipping");
            return;
        }

        const container = document.createElement("div");
        container.classList.add("markdown-image-container");

        const clonedImage = zoomTarget.cloneNode(true) as HTMLElement;

        // Caption logic (read from the <img>, which carries title/alt/caption)
        const title = el.getAttribute("title")?.trim();
        const dataCaption = el.getAttribute("data-caption")?.trim();
        const alt = el.getAttribute("alt")?.trim();

        const isAltFilename = alt
            ? /^[\w,\s-]+\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(alt)
            : false;

        const captionText = title || dataCaption || (!isAltFilename ? alt : "");

        if (captionText) {
          const caption = document.createElement("div");
          caption.classList.add("markdown-img-caption");
          caption.innerText = captionText;
          container.appendChild(clonedImage);
          container.appendChild(caption);
        } else {
          container.appendChild(clonedImage);
        }

        // Final check before replacing - ensure element is still in DOM
        if (zoomTarget.isConnected && zoomTarget.parentElement) {
            zoomTarget.parentElement.replaceChild(container, zoomTarget);
        }
      } catch (error) {
        // Handle any errors during DOM manipulation gracefully
        console.warn("Error enhancing image element:", error);
      }
    });

    // Apply zoom after modifications with final safety check
    try {
      // Filter elements one more time to ensure they're still connected before passing to medium-zoom
      // This prevents "Cannot read property 'parentNode' of null" errors during hydration
      const zoomableImages = Array.from(
        containerRef.current?.querySelectorAll<HTMLImageElement>(
          ".markdown-view:not(.markdown-view-pure) img"
        ) ?? []
      ).filter((img) => {
        try {
          return img.isConnected && img.parentNode !== null;
        } catch {
          return false;
        }
      });

      if (zoomableImages.length > 0) {
        // Wait for all images to load before initializing zoom to ensure correct positioning
        // This fixes the issue where images appear at the bottom of the screen on first click
        const imageLoadPromises = zoomableImages.map((img) => {
          return new Promise<void>((resolve) => {
            if (img.complete && img.naturalHeight !== 0) {
              // Image already loaded
              resolve();
            } else {
              // Wait for image to load
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });

              // Fallback timeout in case load event never fires
              setTimeout(() => resolve(), 3000);
            }
          });
        });

        Promise.all(imageLoadPromises).then(async () => {
          // Bail if component unmounted while waiting for images
          if (!isMounted) {
            return;
          }

          // Double-check images are still in DOM after loading
          const connectedImages = zoomableImages.filter((img) => {
            try {
              return img.isConnected && img.parentNode !== null;
            } catch {
              return false;
            }
          });

          if (connectedImages.length === 0) {
            return;
          }

          // Dynamic-import medium-zoom so its bundle is split out of any
          // SSR-critical client chunk that pulls EcencyRenderer in.
          let mediumZoom: typeof import("medium-zoom").default;
          try {
            ({ default: mediumZoom } = await import("medium-zoom"));
          } catch (error) {
            console.warn("Failed to load medium-zoom:", error);
            return;
          }

          if (!isMounted) {
            return;
          }

          // Small delay to ensure layout is stable after image load
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            // Final check before creating zoom instance
            if (!isMounted) {
              return;
            }

            // Re-filter after the dynamic-import gap — the parent can re-render
            // (EcencyRenderer uses dangerouslySetInnerHTML) and disconnect these
            // nodes while isMounted stays true. medium-zoom walks parentNode on
            // every input, so a stale snapshot would throw or attach partially.
            const stillConnected = connectedImages.filter((img) => {
              try {
                return img.isConnected && img.parentNode !== null;
              } catch {
                return false;
              }
            });

            if (stillConnected.length === 0) {
              return;
            }

            try {
              // One instance per mount: medium-zoom adds document and window
              // listeners per instance that detach() does not remove, so a
              // re-run (html change, Strict Mode) re-attaches the images to
              // the existing instance instead of creating another (#2083).
              if (zoomRef.current) {
                zoomRef.current.attach(...stillConnected);
              } else {
                zoomRef.current = mediumZoom(stillConnected, {
                  background: "#131111",
                  margin: 24, // Add margin for better centering
                });
              }
            } catch (error) {
              console.warn("Failed to initialize medium-zoom:", error);
            }
          });
        }).catch((error) => {
          console.warn("Failed to wait for images to load:", error);
        });
      }
    } catch (error) {
      // Gracefully handle any medium-zoom initialization errors
      console.warn("Failed to initialize medium-zoom:", error);
    }

    return () => {
      isMounted = false; // Mark as unmounted to prevent async operations
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      zoomRef.current?.detach();
    };
  }, [containerRef, html]);

  return <></>;
}
