// The service worker's NetworkFirst cache for /api (pwa-runtime-caching.js).
const SW_API_CACHE = "ecency-api";

// API routes whose answers belong to the account the request's cookies name.
// The service worker serves them NetworkOnly; keep in step with the rule there.
export const ACCOUNT_API_PREFIXES = ["/api/mattermost/", "/api/newsletter/"];

/**
 * Deletes per-account answers the service worker cached before those routes
 * were excluded from it: keyed by URL only, they would answer for the
 * previous account after a logout or switch (#2023, #2084). No-op without a
 * Cache API or without that cache.
 */
export async function dropCachedAccountResponses(): Promise<void> {
  if (typeof caches === "undefined" || !caches) return;
  if (!(await caches.has(SW_API_CACHE))) return;
  const cache = await caches.open(SW_API_CACHE);
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((request) => {
        const path = new URL(request.url).pathname;
        return ACCOUNT_API_PREFIXES.some((prefix) => path.startsWith(prefix));
      })
      .map((request) => cache.delete(request))
  );
}
