import {
    applyImageZoom,
    applyHivePostLinks,
    applyHiveOperations,
    applyYoutubeVideos,
    applyThreeSpeakVideos,
    resetYoutubeVideos,
    resetThreeSpeakVideos,
    applyWaveLikePosts,
    applyTwitterEmbeds
} from "../utils";
import { findPostLinkElements } from "../functions";
import { unmountRootsLater } from "./unmount-roots-later";
import { runUndos } from "./dom-swap";
import { Root } from "react-dom/client";
import React from "react";

// Proper React fallback component for Twitter embeds when Tweet component fails to load
const TwitterFallback: React.FC<{ id: string }> = ({ id }) => {
    return React.createElement('div', {
        style: {
            padding: '16px',
            border: '1px solid #e1e8ed',
            borderRadius: '8px',
            backgroundColor: '#f7f9fa',
            color: '#657786',
            textAlign: 'center' as const,
        }
    }, `Failed to load tweet. View on Twitter: https://twitter.com/i/status/${id}`);
};

/**
 * Setup post enhancements (image zoom, links, embeds, etc.)
 * Returns a cleanup function that should be called when the container is removed.
 */
export function setupPostEnhancements(container: HTMLElement, options?: {
    onHiveOperationClick?: (op: string) => void,
    TwitterComponent?: any,
    images?: string[]
}): () => void {
    const postLinkElements = findPostLinkElements(container);
    // How to put back the links the enhancers swapped out (#2083).
    const undos: (() => void)[] = [];

    const allRoots: Root[] = [
        ...applyHivePostLinks(container, postLinkElements, undos),
        ...applyHiveOperations(container, options?.onHiveOperationClick, undos),
        ...applyYoutubeVideos(container),
        ...applyThreeSpeakVideos(container, options?.images),
        ...applyWaveLikePosts(container, postLinkElements, undos),
        ...applyTwitterEmbeds(container, options?.TwitterComponent ?? TwitterFallback, undos)
    ];

    // Apply image zoom and store the promise for cleanup
    const zoomPromise = applyImageZoom(container);

    // Return cleanup function
    return () => {
        // Called from an effect cleanup, where a synchronous root.unmount()
        // logs "Attempted to synchronously unmount a root while React was
        // already rendering". The video links are restored right away so a
        // re-run on the same DOM enhances them again (#2082).
        unmountRootsLater(allRoots);
        resetYoutubeVideos(container);
        resetThreeSpeakVideos(container);
        runUndos(undos);
        zoomPromise.then((zoom) => {
            zoom?.detach();
        }).catch(() => {
            // Ignore cleanup errors
        });
    };
}
