// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// The actual @sentry/nextjs SDK is NOT statically imported here (only its types).
// It is dynamically loaded + initialized after idle / first interaction via the
// lazy facade in src/core/sentry/lazy-sentry, which keeps the ~116KB SDK out of
// every route's eager bootstrap (it used to be chunk 223 in rootMainFiles).
import type * as Sentry from "@sentry/nextjs";
import appPackage from "./package.json";
import { beforeSend } from "./src/utils/sentry-before-send";
import { scrubBreadcrumb } from "./src/utils/sentry-scrub";
import { configureLazySentry } from "./src/core/sentry/lazy-sentry";

const SENTRY_CONFIG: Sentry.BrowserOptions = {
  dsn: "https://8a5c1659d1c2ba3385be28dc7235ce56@o4507985141956608.ingest.de.sentry.io/4507985146609744",

  enabled: process.env.NODE_ENV === "production",
  // Prefer SENTRY_RELEASE (set per-deploy to the commit SHA in CI) so
  // source-map upload and runtime tagging stay aligned across deploys
  // that don't bump the package.json version. Inlined into the client
  // bundle via the `env` block in next.config.js.
  release: process.env.SENTRY_RELEASE ?? appPackage.version,

  // Distinguish staging (alpha) from production. Alpha runs an otherwise
  // identical prod build (same DSN, NODE_ENV=production, often the same commit
  // SHA), so without this label its errors are tagged "production" and trip the
  // prod "Critical errors" alert + eat prod quota. CI stamps SENTRY_ENVIRONMENT
  // per deploy (staging.yml="staging", master.yml="production"); inlined into
  // the client bundle via the `env` block in next.config.js. Falls back to
  // NODE_ENV (so a locally-run prod build is tagged "development", not
  // "production") then "production". `||` (not `??`) so an empty
  // SENTRY_ENVIRONMENT — an unset ARG in a non-CI Docker build yields `ENV=""` —
  // also falls through instead of tagging events with an empty environment.
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",

  tracesSampleRate: 0,
  // Default integrations only. Do NOT add extraErrorDataIntegration without
  // extending src/utils/sentry-scrub first: it serializes an error's own
  // properties, so an Axios error would ship `config.url`, which for an image
  // upload is `/hs/<access token>` (issue #1651).
  integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserTracing"),

  debug: false,
  ignoreErrors: [
    "NEXT_HTTP_ERROR_FALLBACK;404",
    "AxiosError",
    "Wrong private key. Master or active or posting private key required.",
    "Network request failed",
    "Failed to read the 'localStorage' property from 'Window'",
    "Invalid parameters",
    "Failed to connect to MetaMask",
    "Cannot set property tron of #<Window> which has only a getter",
    "Cannot set property ethereum of #<Window> which has only a getter",
    "window.ethereum._handleChainChanged is not a function",
    "window[eFuncName] is not a function",
    "Cannot destructure property 'register' of 'undefined' as it is undefined.",
    "CopyDataProperties is not a function"
  ],
  denyUrls: [/sui\.js/, /extensionServiceWorker\.js$/, /chrome-extension:\/\//],

  // The single source of truth for client-side event filtering and
  // reclassification (deploy-skew, RC exhaustion, extension noise, timeouts).
  // Extracted to src/utils/sentry-before-send so it stays unit-testable.
  beforeSend,

  // beforeSend only sees ERROR events. Breadcrumbs also ride on feedback
  // events (captureFeedback), so redact secret-bearing URLs when each crumb
  // is recorded, too. Never throws: a crumb that cannot be scrubbed is dropped.
  beforeBreadcrumb(crumb) {
    try {
      return scrubBreadcrumb(crumb);
    } catch {
      return null;
    }
  }
};

// Defer Sentry initialization (and now its bytes) until after first interaction
// or 5s idle. The facade buffers early errors + any capture calls and replays
// them once the SDK loads, so coverage is preserved.
configureLazySentry(SENTRY_CONFIG);
