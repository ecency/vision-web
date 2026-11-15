import { createRoot, Root } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { WaveLikePostRenderer } from "../extensions";
import { findPostLinkElements, isWaveLikePost } from "../functions";
import { getQueryClient } from "@/core/react-query";
import { swapIn } from "./dom-swap";

/**
 * Progressive DOM enhancer for wave-like post links
 */
export function applyWaveLikePosts(
    container: HTMLElement,
    postLinkElements: HTMLAnchorElement[] = findPostLinkElements(container),
    undos: (() => void)[] = [],
): Root[] {
    const roots: Root[] = [];
    const queryClient = getQueryClient();

    postLinkElements
        .filter((el) => isWaveLikePost(el.getAttribute("href") ?? ""))
        .forEach((el) => {
            try {
                if (el.dataset.enhanced === "true") return;

                // Verify element is still connected to the DOM
                if (!el.isConnected || !el.parentElement) {
                    console.warn("Wave-like post link element is not connected to DOM, skipping");
                    return;
                }

                el.dataset.enhanced = "true";

                const link = el.getAttribute("href") ?? "";

                const wrapper = document.createElement("div");
                wrapper.classList.add("er-wave");

                const root = createRoot(wrapper);
                root.render(
                    <QueryClientProvider client={queryClient}>
                        <WaveLikePostRenderer link={link} />
                    </QueryClientProvider>
                );
                roots.push(root);

                // Final safety check before replacing
                if (el.isConnected && el.parentElement) {
                    undos.push(swapIn(el, wrapper));
                }
            } catch (error) {
                console.warn("Error enhancing wave-like post link element:", error);
            }
        });

    return roots;
}
