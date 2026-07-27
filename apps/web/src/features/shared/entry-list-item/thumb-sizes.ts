/**
 * The row thumbnail box is full-width on mobile but a fixed 150px on desktop
 * (.item-image in _index.scss). Use a thumbnail-sized `sizes` — NOT the
 * post-body IMAGE_SIZES (700px) — so desktop picks a small srcset candidate
 * instead of over-fetching an ~800w image for a 150px slot.
 *
 * Lives in its own module (no "use client") so the server-rendered
 * EntryListThumbPreload and the client thumbnail share one value: the
 * preload's `imageSizes` must match the `<img sizes>` exactly, or the browser
 * picks a different srcset candidate and downloads the thumbnail twice.
 */
export const THUMB_SIZES = "(max-width: 768px) 100vw, 150px";
