// Workbox runtime caching rules for the service worker (next-pwa, see next.config.js).
// Kept in their own module so specs can check them without loading the Next config.
module.exports = [
  {
    // Geo-tag cities dataset: fetched once when the picker opens, then served
    // from cache (it's a static, versioned data blob).
    urlPattern: /\/geo\/.*\.json$/i,
    handler: "CacheFirst",
    options: {
      cacheName: "ecency-geo-data",
      expiration: {
        maxEntries: 4,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      },
      cacheableResponse: {
        statuses: [0, 200]
      }
    }
  },
  {
    // Build-id heartbeat for deploy-skew recovery: must ALWAYS hit the network
    // so a stale tab never compares a service-worker-cached old build id against
    // itself (the request's `no-store` doesn't bypass the SW Cache API). Listed
    // before the generic /api/* NetworkFirst rule below — Workbox uses the first
    // matching route. Offline simply fails the fetch, which the heartbeat treats
    // as "skip" rather than a stale match.
    urlPattern: /^https:\/\/ecency\.com\/api\/version(?:\?.*)?$/i,
    handler: 'NetworkOnly'
  },
  {
    // Cache API responses with network-first strategy
    urlPattern: /^https:\/\/ecency\.com\/api\/.*/i,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'ecency-api',
      networkTimeoutSeconds: 3,
      expiration: {
        maxEntries: 30,
        maxAgeSeconds: 2 * 60 // 2 minutes
      },
      cacheableResponse: {
        statuses: [0, 200]
      }
    }
  },
  // No rule for the image hosts (i/img/images.ecency.com). Post images and
  // avatars load through <img> without CORS, so the worker only sees opaque
  // responses and cannot tell a 200 from a 503: caching them kept errors on
  // screen for days. The browser's own HTTP cache keeps good images (the hosts
  // send long-lived cache headers) and never keeps an error. The retired
  // "ecency-images-cdn" cache is deleted by <ServiceWorkerRecovery>.
  {
    // Cache local images and static assets
    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'local-images',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      }
    }
  },
  {
    // Cache fonts
    urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'fonts',
      expiration: {
        maxEntries: 20,
        maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
      }
    }
  }
];
