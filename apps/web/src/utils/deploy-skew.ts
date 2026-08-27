// Pure, framework-free matchers for deploy/version-skew errors — a client tab
// running a build that no longer matches what the server serves. Kept React-free
// so both the client Sentry config (sentry.client.config.ts) and the runtime
// recovery component (features/pwa-install/service-worker-recovery.tsx) can share
// them without the Sentry config pulling React into its early-loaded module graph.

// Message patterns for a failed chunk / dynamic import — a stale cache or a
// just-replaced build handing the client a chunk that no longer exists.
export function isChunkLoadError(message?: string | null): boolean {
  if (!message) {
    return false;
  }
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message)
  );
}

// The webpack runtime was handed an undefined module factory: a chunk loaded but
// references a module id the running runtime doesn't have — a build/version
// mismatch after a deploy ("Cannot read properties of undefined (reading 'call')"
// thrown from webpack-*.js, or the Safari equivalent). Require the webpack
// runtime frame so this never fires on unrelated ".call of undefined" app bugs.
function isWebpackFactoryError(error: { message?: string; stack?: string }): boolean {
  const stack = error.stack ?? "";
  const fromWebpackRuntime =
    /webpack-[0-9a-f]+\.js/i.test(stack) || /webpack-internal/i.test(stack);
  if (!fromWebpackRuntime) {
    return false;
  }
  const message = error.message ?? "";
  return (
    /Cannot read propert(?:y|ies) of undefined \(reading 'call'\)/i.test(message) || // Chrome
    /undefined is not an object \(evaluating '[^']*\.call'\)/i.test(message) || // Safari
    /can't access property ['"]?call\b/i.test(message) || // Firefox (\b so it can't match "callback")
    /'call' of undefined/i.test(message) ||
    /\bis undefined$/i.test(message) // Firefox: e[t] is undefined (direct factory invocation)
  );
}

// The 8-hex deployment id baked into this build's chunk URLs (`?dpl=<id>`),
// derived from the inlined SENTRY_RELEASE exactly as next.config.js derives
// `deploymentId`. Undefined in local dev, where chunks carry no dpl and the
// mismatch rule below is inert. NOTE: this is NOT the always-false
// event.release self-comparison — the id here is compared against dpl values
// read out of the error's OWN stack frames, which come from the actual chunk
// URLs that were executing.
function ownDeploymentId(): string | undefined {
  const release = process.env.SENTRY_RELEASE;
  return release ? release.replace(/^ecency-next@/, "").slice(0, 8) : undefined;
}

// A stack frame from a chunk of a DIFFERENT deployment than the build running
// this code: `page-<hash>.js?dpl=<foreign>` executing against this build's
// module registry. This is the mixed-build skew that chunk-name matching can't
// see — the foreign chunk LOADS fine (CDN still has it) but resolves shifted
// module ids to the wrong modules, surfacing as e.g.
// `(0 , y.useNewsletterEnabled) is not a function` in an app frame
// (ECENCY-NEXT-1GNN, #1674). The dpl comparison is exact proof of a mixed
// build, so no message grammar is required — whatever the symptom, the cure is
// a reload onto one consistent build.
function hasForeignDeploymentFrame(error: { stack?: string }): boolean {
  const own = ownDeploymentId();
  if (!own) {
    return false;
  }
  const stack = error.stack ?? "";
  // Only OUR build-versioned chunks may vote: require the `/_next/static/`
  // path (the same narrowing the resource-error listener in
  // service-worker-recovery uses) and the exact 8-hex id shape
  // ownDeploymentId() produces. A third-party script that happens to carry a
  // dpl query must not be classified as skew — that would burn the session's
  // one guarded reload and bury the real error under the skew fingerprint.
  const dplRe = /\/_next\/static\/\S*?\.js\?dpl=([0-9a-f]{8})\b/g;
  let match; while ((match = dplRe.exec(stack)) !== null) {
    if (match[1] !== own) {
      return true;
    }
  }
  return false;
}

// True when the error indicates the client is running a build that no longer
// matches what the server serves (chunk-load failures, webpack factory
// mismatches, or a chunk from another deployment in the stack). The cure is to
// reload onto the current build.
export function isDeploySkewError(error: unknown): boolean {
  if (typeof error === "string") {
    return isChunkLoadError(error);
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const e = error as { message?: string; stack?: string };
  return isChunkLoadError(e.message) || isWebpackFactoryError(e) || hasForeignDeploymentFrame(e);
}
