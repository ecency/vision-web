import { createRoot, Root } from "react-dom/client";
import { YoutubeVideoRenderer } from "../extensions";
import {
    attachYoutubeIframeSources,
    attachYoutubeSource,
    detachYoutubeIframeSources
} from "../extensions/youtube-video-extension";
import { getYoutubeEmbedUrl } from "./getYoutubeEmbedUrl";
import { setVideoPlaceholderVisible } from "./video-placeholder";

/**
 * DOM utility enhancer
 */
export function applyYoutubeVideos(container: HTMLElement): Root[] {
    const roots: Root[] = [];
    const elements = Array.from(
        container.querySelectorAll<HTMLElement>(
            ".markdown-view:not(.markdown-view-pure) .markdown-video-link-youtube:not(.er-youtube):not(iframe)"
        )
    );

    elements.forEach((el) => {
        if (el.dataset.enhanced === "true") return;
        el.dataset.enhanced = "true";

        const embedSrc =
            el.dataset.embedSrc ||
            getYoutubeEmbedUrl(el.getAttribute("href") ?? "");
        el.dataset.embedSrc = embedSrc;
        const wrapper = document.createElement("div");
        wrapper.classList.add("er-youtube-frame");

        const root = createRoot(wrapper);
        root.render(<YoutubeVideoRenderer embedSrc={embedSrc} container={el} />);
        roots.push(root);

        el.appendChild(wrapper);
        attachYoutubeSource(el);
    });

    // A YouTube <iframe> the author pasted has no placeholder: caption it too.
    attachYoutubeIframeSources(container);

    return roots;
}

/**
 * Undoes applyYoutubeVideos on the same DOM so a later run enhances the links
 * again: without it the `data-enhanced` flag made the re-run skip every link
 * whose renderer had just been unmounted, and the play button did nothing
 * (#2082). The caller unmounts the roots.
 */
export function resetYoutubeVideos(container: HTMLElement): void {
    container
        .querySelectorAll<HTMLElement>('.markdown-video-link-youtube[data-enhanced="true"]')
        .forEach((el) => {
            el.querySelectorAll(":scope > .er-youtube-frame").forEach((frame) => frame.remove());
            const next = el.nextElementSibling;
            if (next?.classList.contains("er-youtube-source")) next.remove();
            delete el.dataset.enhanced;
            setVideoPlaceholderVisible(el, true);
        });
    detachYoutubeIframeSources(
        container.querySelectorAll<HTMLIFrameElement>(
            'iframe[src*="youtube.com/embed/"][data-enhanced="true"]'
        )
    );
}
