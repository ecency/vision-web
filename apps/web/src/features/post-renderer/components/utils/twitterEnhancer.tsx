import { createRoot, Root } from "react-dom/client";
import React from "react";
import { fillWith } from "./dom-swap";

/**
 * Utility to enhance Twitter links with embedded tweets
 */
export function applyTwitterEmbeds(
    container: HTMLElement,
    ComponentInstance: React.FC<{ id: string }>,
    undos: (() => void)[] = []
): Root[] {
    const roots: Root[] = [];
    const elements = Array.from(
        container.querySelectorAll<HTMLElement>(
            ".markdown-view:not(.markdown-view-pure) .markdown-external-link"
        )
    ).filter((el) => {
        const href = el.getAttribute("href") || "";
        try {
            const url = new URL(href);
            // Hostname-based check, not substring — startsWith("https://twitter.com")
            // also matches https://twitter.com.evil.com.
            if (url.protocol !== "https:") return false;
            if (
              url.hostname !== "x.com" &&
              url.hostname !== "twitter.com" &&
              url.hostname !== "www.x.com" &&
              url.hostname !== "www.twitter.com"
            ) return false;
            const parts = url.pathname.split("/").filter(Boolean);
            // Must look like /{username}/status/{tweetId}[/*]
            return (
                parts.length >= 3 &&
                parts[1] === "status" &&
                /^\d+$/.test(parts[2])
            );
        } catch {
            return false;
        }
    });

    elements.forEach((el) => {
        try {
            if (el.dataset.enhanced === "true") return;
            el.dataset.enhanced = "true";

            const href = el.getAttribute("href");
            if (!href) return;

            const url = new URL(href);
            const parts = url.pathname.split("/").filter(Boolean);
            const tweetId = parts[2]; // safe because of filter check
            if (!tweetId) return;

            const wrapper = document.createElement("div");
            wrapper.classList.add("er-twitter-frame");

            undos.push(fillWith(el, wrapper)); // replaces the link text

            const root = createRoot(wrapper);
            root.render(<ComponentInstance id={tweetId} />);
            roots.push(root);
        } catch (e) {
            console.warn("applyTwitterEmbeds failed to render tweet:", e);
        }
    });

    return roots;
}
