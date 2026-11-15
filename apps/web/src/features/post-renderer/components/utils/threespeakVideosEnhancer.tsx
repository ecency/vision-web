import { createRoot, Root } from "react-dom/client";
import { ThreeSpeakVideoRenderer } from "../extensions";
import { injectThreeSpeakThumbnail } from "./threeSpeakThumbnail";
import { setVideoPlaceholderVisible } from "./video-placeholder";

/**
 * DOM utility enhancer
 */
export function applyThreeSpeakVideos(container: HTMLElement, images?: string[]): Root[] {
    const roots: Root[] = [];
    const elements = Array.from(
        container.querySelectorAll<HTMLElement>(
            ".markdown-view:not(.markdown-view-pure) .markdown-video-link-speak:not(.er-speak)"
        )
    );

    elements.forEach((el) => {
        if (el.dataset.enhanced === "true") return;
        el.dataset.enhanced = "true";
        el.classList.add("er-speak");

        injectThreeSpeakThumbnail(el, images);

        const embedSrc = el.dataset.embedSrc ?? "";
        const wrapper = document.createElement("div");
        wrapper.classList.add("er-speak-frame");

        const root = createRoot(wrapper);
        root.render(<ThreeSpeakVideoRenderer embedSrc={embedSrc} container={el} />);
        roots.push(root);

        el.appendChild(wrapper);
    });

    return roots;
}

/**
 * Undoes applyThreeSpeakVideos on the same DOM so a later run enhances the
 * links again (the `er-speak` class and `data-enhanced` flag made it skip
 * them, #2082). The caller unmounts the roots.
 */
export function resetThreeSpeakVideos(container: HTMLElement): void {
    container
        .querySelectorAll<HTMLElement>('.markdown-video-link-speak[data-enhanced="true"]')
        .forEach((el) => {
            el.querySelectorAll(":scope > .er-speak-frame").forEach((frame) => frame.remove());
            delete el.dataset.enhanced;
            el.classList.remove("er-speak", "speak-portrait", "speak-square");
            setVideoPlaceholderVisible(el, true);
        });
}
