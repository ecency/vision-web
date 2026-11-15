import type { Zoom } from "medium-zoom";
import { zoomReplaceTarget, zoomEffectiveParent } from "./picture-zoom";

/** Releases the images one applyImageZoom run attached. */
export interface ImageZoomHandle {
    detach: () => void;
}

// One medium-zoom instance for the page. Each instance adds document click and
// keyup and window scroll and resize listeners that detach() does not remove,
// and the entry page runs the enhancements again on every Edit History or raw
// toggle, so every run attaches its images to this one instance (#2083).
let sharedZoom: Zoom | null = null;
// The run that last attached each image. Two runs can cover the same <img>
// (a re-run before the previous cleanup landed), and attach() de-dupes, so a
// late detach from the earlier run would strip the zoom the later run just
// set up. A run's handle releases only the images it still owns.
const owners = new WeakMap<HTMLElement, object>();

/**
 * Apply medium-zoom to images in a container.
 * Resolves to a handle for cleanup (caller should call .detach() when done).
 */
export function applyImageZoom(container: HTMLElement): Promise<ImageZoomHandle | null> {
    const elements = Array.from(
        container.querySelectorAll<HTMLElement>(
            ".markdown-view:not(.markdown-view-pure) img"
        )
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

            // <img> inside a <picture>: the element we wrap/replace is the
            // <picture>, so the "linked image" check looks at its parent.
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
            // <picture> so the <img> stays a DIRECT child of it (otherwise the
            // <source>s are ignored and the format=match URL loads).
            const zoomTarget = zoomReplaceTarget(el);

            // Verify parentElement exists before attempting manipulation
            const parentElement = zoomTarget.parentElement;
            if (!parentElement) {
                console.warn("Image element has no parent, skipping");
                return;
            }

            const wrapper = document.createElement("div");
            wrapper.classList.add("markdown-image-container");

            // Preserve alignment from the wrapped element's parent, default center
            const parent = zoomTarget.parentElement;
            const validAligns = ["left", "center", "right", "justify"];
            const rawAlign = parent
                ? (parent.tagName === "CENTER"
                    ? "center"
                    : parent.getAttribute("dir")
                    || parent.getAttribute("data-align")
                    || (parent as HTMLElement).style?.textAlign
                    || "")
                : "";
            const parentAlign = validAligns.includes(rawAlign) ? rawAlign : "";
            wrapper.style.textAlign = parentAlign === "left" ? "" : (parentAlign || "center");

            const clonedImage = zoomTarget.cloneNode(true) as HTMLElement;

            // Set explicit width/height to reduce CLS if not already present. The
            // cloned node may be a <picture>; target the inner <img>.
            const clonedImg = (clonedImage.nodeName === "PICTURE"
                ? clonedImage.querySelector("img")
                : clonedImage) as HTMLImageElement | null;
            if (el instanceof HTMLImageElement && clonedImg && !clonedImg.getAttribute("width") && el.naturalWidth > 0) {
                clonedImg.setAttribute("width", String(el.naturalWidth));
                clonedImg.setAttribute("height", String(el.naturalHeight));
            }

            const title = el.getAttribute("title")?.trim();
            const dataCaption = el.getAttribute("data-caption")?.trim();
            const alt = el.getAttribute("alt")?.trim();

            const isAltFilename = alt
                ? /^[\w,\s-]+\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(alt)
                : false;
            const isAltPlaceholder = alt
                ? /^(alt|image|img|photo|picture|screenshot)$/i.test(alt)
                : false;

            const captionText = title || dataCaption || (!isAltFilename && !isAltPlaceholder ? alt : "");

            if (captionText) {
                const caption = document.createElement("div");
                caption.classList.add("markdown-img-caption");
                caption.innerText = captionText;
                wrapper.appendChild(clonedImage);
                wrapper.appendChild(caption);
            } else {
                wrapper.appendChild(clonedImage);
            }

            // Final check before replacing - ensure element is still in DOM
            if (zoomTarget.isConnected && zoomTarget.parentElement) {
                zoomTarget.parentElement.replaceChild(wrapper, zoomTarget);
            }
        } catch (error) {
            // Handle any errors during DOM manipulation gracefully
            console.warn("Error enhancing image element:", error);
        }
    });

    // apply medium zoom with final safety check
    return new Promise<ImageZoomHandle | null>((resolveZoom) => {
        try {
            // Filter elements one more time to ensure they're still connected before passing to medium-zoom
            // This prevents "Cannot read property 'parentNode' of null" errors during hydration
            const zoomableImages = Array.from(
                container.querySelectorAll<HTMLImageElement>(
                    ".markdown-view:not(.markdown-view-pure) img"
                )
            ).filter((img) => {
                try {
                    return img.isConnected && img.parentNode !== null;
                } catch {
                    return false;
                }
            });

            if (zoomableImages.length === 0) {
                resolveZoom(null);
                return;
            }

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
                // Double-check images are still in DOM after loading
                const connectedImages = zoomableImages.filter((img) => {
                    try {
                        return img.isConnected && img.parentNode !== null;
                    } catch {
                        return false;
                    }
                });

                if (connectedImages.length === 0) {
                    resolveZoom(null);
                    return;
                }

                // Dynamic-import medium-zoom so its bundle is not part of any
                // SSR-critical chunk that reaches this enhancer transitively.
                let mediumZoom: typeof import("medium-zoom").default;
                try {
                    ({ default: mediumZoom } = await import("medium-zoom"));
                } catch (error) {
                    console.warn("Failed to load medium-zoom:", error);
                    resolveZoom(null);
                    return;
                }

                // Small delay to ensure layout is stable after image load
                requestAnimationFrame(() => {
                    // Re-filter after the dynamic-import gap — nodes can be
                    // disconnected during the async chunk fetch. medium-zoom
                    // walks parentNode on every input, so a stale snapshot
                    // would throw or attach partially.
                    const stillConnected = connectedImages.filter((img) => {
                        try {
                            return img.isConnected && img.parentNode !== null;
                        } catch {
                            return false;
                        }
                    });

                    if (stillConnected.length === 0) {
                        resolveZoom(null);
                        return;
                    }

                    try {
                        if (sharedZoom) {
                            sharedZoom.attach(...stillConnected);
                        } else {
                            sharedZoom = mediumZoom(stillConnected, {
                                background: "#131111",
                                margin: 24, // Add margin for better centering
                            });
                        }
                        const zoom = sharedZoom;
                        const run = {};
                        stillConnected.forEach((img) => owners.set(img, run));
                        resolveZoom({
                            detach: () => {
                                const mine = stillConnected.filter((img) => owners.get(img) === run);
                                mine.forEach((img) => owners.delete(img));
                                if (mine.length > 0) zoom.detach(...mine);
                            }
                        });
                    } catch (error) {
                        console.warn("Failed to initialize medium-zoom:", error);
                        resolveZoom(null);
                    }
                });
            }).catch((error) => {
                console.warn("Failed to wait for images to load:", error);
                resolveZoom(null);
            });
        } catch (error) {
            // Gracefully handle any medium-zoom initialization errors
            console.warn("Failed to initialize medium-zoom:", error);
            resolveZoom(null);
        }
    });
}
