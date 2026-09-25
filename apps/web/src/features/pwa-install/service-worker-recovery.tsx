"use client";

import { useEffect } from "react";
import { isChunkLoadError, isDeploySkewError } from "@/utils/deploy-skew";

// Re-exported so existing consumers (global-error.tsx, SentryErrorBoundary) keep
// importing the skew matchers from here; the implementations now live in the
// React-free @/utils/deploy-skew so the Sentry client config can share them too.
export { isChunkLoadError, isDeploySkewError } from "@/utils/deploy-skew";

// Guards against reload loops: at most one recovery reload per tab session. If
// the page still errors after the reload, we stop and let the error boundary
// render its fallback rather than refreshing forever.
const RELOAD_FLAG = "deploy-skew-recovery-reloaded";

// In-page deduplication: prevents multiple callers (onError, onRejection,
// onResourceError) from each independently triggering a reload within the same
// page load. A hard reload (window.location.reload) tears this module down and
// reinitializes it, so the flag resets on the next page load — no cross-reload
// state leaks from this variable.
let reloadScheduled = false;

export function reloadForSkew() {
  // Primary guard: deduplicate within this page load, works in all browsing modes.
  if (reloadScheduled) {
    return;
  }
  reloadScheduled = true;

  try {
    // Secondary (cross-reload) guard: if sessionStorage is available, use it to
    // detect whether we already reloaded once this session. If the error persists
    // after a recovery reload it is a real code bug, not deploy-skew — let the
    // error boundary render its fallback instead of looping.
    if (sessionStorage.getItem(RELOAD_FLAG)) {
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage unusable (private mode / storage quota). The module-level
    // guard above prevents duplicate calls within this page load. Proceed with
    // the reload — after it the browser runs a fresh, consistent build so the
    // deploy-skew TypeError cannot recur, making an infinite loop impossible.
  }
  window.location.reload();
}

// Guards a controllerchange reload against firing twice within one page load.
let controllerReloadStarted = false;

// Minimum gap between build-id heartbeat checks, so rapid visibility/refocus
// churn (common on mobile) can't spam /api/version.
const BUILD_CHECK_THROTTLE_MS = 30_000;
let lastBuildCheck = 0;

/**
 * Compares the build this tab is running (`SENTRY_RELEASE`, inlined into the
 * client bundle at build time) against the currently-deployed server build
 * (`/api/version`). A mismatch means the tab is stale, so reload onto the
 * current build.
 *
 * This catches what no error ever surfaces: a backgrounded tab restored from
 * the page cache. It's the dominant skew case on iOS, where Chrome/Firefox have
 * no service worker (so the controllerchange path below can't fire) and a
 * restored tab keeps running an old build whose `/_next/static` chunks the new
 * deploy has since replaced. Reloading heals it without touching auth/storage,
 * so the user stays logged in.
 */
async function checkBuildSkew() {
  // process.env.SENTRY_RELEASE is replaced with a literal at build time; unset
  // in local dev, where there are no deploys and skew protection is inactive.
  const currentBuildId = process.env.SENTRY_RELEASE;
  if (!currentBuildId) {
    return;
  }
  const now = Date.now();
  if (now - lastBuildCheck < BUILD_CHECK_THROTTLE_MS) {
    return;
  }
  lastBuildCheck = now;
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const { buildId } = (await res.json()) as { buildId?: string | null };
    if (buildId && buildId !== currentBuildId) {
      reloadForSkew();
    }
  } catch {
    // Offline or a transient network error — ignore; the next refocus retries.
  }
}

/**
 * Recovers users running a build that no longer matches the server — the cause
 * of the post-deploy "Element type is invalid: undefined" / "undefined (reading
 * 'call')" 500s. Renders nothing. Complements Next's `deploymentId` skew
 * protection (which hard-reloads on navigation); this catches the cases that
 * already crashed (stale cached HTML, mid-render mismatch).
 *
 * 1. When a NEW service worker takes control of an already-controlled page
 *    (`controllerchange`), reload once so the in-memory webpack runtime matches
 *    the freshly-cached chunks. Only armed when the page already had a
 *    controller at mount — otherwise the upcoming `controllerchange` is just the
 *    initial `clientsClaim` on a first visit and a reload would be spurious.
 * 2. As a safety net, reload once (per session) on an uncaught deploy-skew error
 *    (chunk-load failure or webpack factory mismatch).
 * 3. Reload when a `/_next/static` asset (a CSS `<link>` or `<script>`) fails to
 *    load. These resource errors don't bubble and never surface as a
 *    ChunkLoadError, so (2) misses them — yet a stale document referencing a
 *    replaced stylesheet renders silently unstyled. Caught in the capture phase.
 * 4. On tab refocus / page-cache restore, compare the running build against
 *    `/api/version` and reload on a mismatch — the only signal for a stale tab
 *    that never threw (the common iOS Chrome/Firefox case, where there's no
 *    service worker for (1) to use).
 */
export function ServiceWorkerRecovery() {
  useEffect(() => {
    // Capture the container up front so cleanup detaches from the same object,
    // not whatever `navigator.serviceWorker` happens to be later.
    const swContainer =
      typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? navigator.serviceWorker
        : null;

    const onControllerChange = () => {
      if (controllerReloadStarted) {
        return;
      }
      controllerReloadStarted = true;
      window.location.reload();
    };

    // Only arm when the page already has a controller — otherwise the upcoming
    // controllerchange is just the initial clientsClaim on a first visit and a
    // reload would be spurious.
    const armedForController = !!swContainer && !!swContainer.controller;
    if (armedForController) {
      swContainer!.addEventListener("controllerchange", onControllerChange);
    }

    const onError = (event: ErrorEvent) => {
      if (isDeploySkewError(event.error) || isChunkLoadError(event.message)) {
        reloadForSkew();
      }
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isDeploySkewError(event.reason)) {
        reloadForSkew();
      }
    };

    // A failed resource load (a <link>/<script> that 404s) fires an `error`
    // event that does NOT bubble and carries no message — invisible to the
    // `onError` listener above — so it's only observable in the capture phase
    // via its `target`. A 404 on a build-versioned `/_next/static` asset means
    // the running document references a build the server has replaced.
    const onResourceError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const url =
        target.tagName === "LINK"
          ? (target as HTMLLinkElement).href
          : target.tagName === "SCRIPT"
            ? (target as HTMLScriptElement).src
            : "";
      if (!url) {
        return;
      }
      // Require a same-origin `/_next/static/` path: a foreign asset that merely
      // contains that substring (e.g. a third-party CDN) is unrelated to our
      // build and must not burn the session's one skew-recovery reload.
      const assetUrl = new URL(url, window.location.href);
      if (
        assetUrl.origin === window.location.origin &&
        assetUrl.pathname.startsWith("/_next/static/")
      ) {
        reloadForSkew();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkBuildSkew();
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      // Restored from the page cache (back/forward, iOS tab restore): the
      // in-memory build predates any deploy that happened while backgrounded.
      if (event.persisted) {
        void checkBuildSkew();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onResourceError, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      if (armedForController && swContainer) {
        swContainer.removeEventListener("controllerchange", onControllerChange);
      }
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onResourceError, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
