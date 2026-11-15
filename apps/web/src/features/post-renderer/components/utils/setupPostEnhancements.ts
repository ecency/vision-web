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

    const allRoots: Root[] = [
        ...applyHivePostLinks(container, postLinkElements),
        ...applyHiveOperations(container, options?.onHiveOperationClick),
        ...applyYoutubeVideos(container),
        ...applyThreeSpeakVideos(container, options?.images),
        ...applyWaveLikePosts(container, postLinkElements),
        ...applyTwitterEmbeds(container, options?.TwitterComponent ?? TwitterFallback)
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
        zoomPromise.then((zoom) => {
            zoom?.detach();
        }).catch(() => {
            // Ignore cleanup errors
        });
    };
}
