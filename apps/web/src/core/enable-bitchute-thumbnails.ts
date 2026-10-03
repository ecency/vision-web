import { setBitchuteThumbnailOrigin } from "@ecency/render-helper";
import baseDefaults from "@/defaults.json";

/**
 * Point the renderer at this site's BitChute cover route.
 *
 * YouTube posters are a pure function of the video id. BitChute's are not, so
 * the renderer emits `<origin>/api/bitchute-thumbnail/<id>` and only when a
 * host has called this. `defaults.base` is the canonical site on the server
 * and in the browser; `defaults.base` from `@/defaults` follows
 * window.location on a non-production host, which would make the thumbnail
 * URL in server HTML differ from a client re-render of the same post.
 *
 * CALL IT. Never `import "@/core/enable-bitchute-thumbnails"` for the side
 * effect: `sideEffects` in apps/web/package.json is an allowlist, so webpack
 * drops a bare import of a module outside that list from the production
 * bundle while vitest and `next dev` still run it. A call through a used
 * binding survives. Idempotent, so every entry point that renders a post or
 * reads its cover can call it without knowing whether another already did.
 */
export function enableBitchuteThumbnails(): void {
  setBitchuteThumbnailOrigin(baseDefaults.base);
}
