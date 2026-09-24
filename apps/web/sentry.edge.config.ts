// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import appPackage from "./package.json";
import { scrubBreadcrumb, scrubSentryEvent } from "./src/utils/sentry-scrub";

Sentry.init({
  dsn: "https://8a5c1659d1c2ba3385be28dc7235ce56@o4507985141956608.ingest.de.sentry.io/4507985146609744",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: process.env.NODE_ENV === "production",

  // Prefer SENTRY_RELEASE (set per-deploy to the commit SHA in CI) so
  // source-map upload and runtime tagging stay aligned across deploys
  // that don't bump the package.json version.
  release: process.env.SENTRY_RELEASE ?? appPackage.version,

  // Tag staging (alpha) vs production so staging noise doesn't trip the prod
  // "Critical errors" alert. Set via the Dockerfile ENV from CI
  // (staging.yml="staging"). `||` chain falls back to NODE_ENV then "production",
  // and treats an empty SENTRY_ENVIRONMENT (unset ARG in a non-CI build) as unset
  // (an empty `ENV` would otherwise survive `??` and tag events with "").
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
  _experiments: { enableLogs: true },
  ignoreErrors: [
    "NEXT_HTTP_ERROR_FALLBACK;404",
    "AxiosError",
    "Wrong private key. Master or active or posting private key required.",
    "Network request failed",
    "Invalid parameters",
    "Failed to connect to MetaMask",
    "window.ethereum._handleChainChanged is not a function",
    "Cannot destructure property 'register' of 'undefined' as it is undefined."
  ],

  // Middleware sees every page URL, including /auth?code=... and the
  // newsletter token links (issue #1651).
  beforeSend: (event) => scrubSentryEvent(event),
  beforeBreadcrumb(crumb) {
    try {
      return scrubBreadcrumb(crumb);
    } catch {
      return null;
    }
  }
});
Sentry.setTag("source", "edge");
