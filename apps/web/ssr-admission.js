// Per-process admission control for page renders.
//
// Nothing inside the Next.js process limits how many renders it accepts at
// once; shedding happens only upstream and site-wide. When one render turns
// slow, requests pile up on that process, every one of them slows down, and
// the heap runaway behind the exit-134 history becomes reachable. This preload
// caps the number of in-flight page renders per process: above the cap a
// request is answered 503 with Retry-After before Next ever sees it, so the
// edge fails over to another origin instead of queueing behind a stuck loop.
//
// Hooks http.Server's 'request' emission, which is how Node hands a request to
// `next start`, so the check runs before any Next code. Only document and RSC
// renders are counted: static assets, files served from public/, API routes and
// the health check pass through uncounted. Disabled unless SSR_MAX_INFLIGHT is
// a positive number.
//
// Loaded with `node --require ./ssr-admission.js` (see the Dockerfile CMD).
// Runs before Next, so it must stay dependency-free.
const http = require("http");

const rawMax = process.env.SSR_MAX_INFLIGHT;
const max = rawMax === undefined || rawMax === "" ? 0 : Number(rawMax);

// Retry-After must be a plain number of seconds; anything else would throw
// from setHeader at the worst possible moment, so it falls back to 1.
const rawRetryAfter = process.env.SSR_SHED_RETRY_AFTER;
const retryAfter = /^\d{1,4}$/.test(rawRetryAfter || "") ? rawRetryAfter : "1";

// A client that goes away mid-render (the edge worker's timeout, a navigation)
// does not stop the render: the server prefetches run on until their own
// timeout. The slot is therefore held for this long after the socket closes
// unless the response finishes first, so abandoned renders still count as the
// work they are. Matches the server-side prefetch timeout.
const rawGrace = process.env.SSR_ABANDONED_GRACE_MS;
const abandonedGraceMs = /^\d{1,6}$/.test(rawGrace || "") ? Number(rawGrace) : 10_000;

// Paths that are not page renders. Anything else that reaches this process is
// a document or an RSC navigation (the reverse proxy keeps private-api and
// friends away from it), so those are what the cap protects.
const PASS_PREFIXES = ["/_next/", "/api/", "/assets/", "/scripts/"];
// Files served from public/ (service workers, social images, geo data, fonts,
// manifests) carry a file extension; page paths do not. Usernames can contain
// a dot (`/@demo.com`), hence a fixed list rather than "has any extension".
const PASS_EXTENSIONS = /\.(?:js|mjs|css|map|json|webmanifest|txt|xml|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|eot|mp4|webm|mp3|m4a|pdf|html?)$/i;

function isRender(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = req.url || "/";
  const q = url.indexOf("?");
  const path = q === -1 ? url : url.slice(0, q);
  for (const prefix of PASS_PREFIXES) {
    if (path.startsWith(prefix)) return false;
  }
  return !PASS_EXTENSIONS.test(path);
}

const state = { max, inflight: 0, shed: 0 };
// Read by the event-loop monitor's log lines; never written from outside.
globalThis.__ecencySsrAdmission = state;

if (Number.isFinite(max) && max > 0) {
  const originalEmit = http.Server.prototype.emit;
  http.Server.prototype.emit = function emit(event, req, res) {
    if (event === "request" && req && res && isRender(req)) {
      if (state.inflight >= state.max) {
        state.shed += 1;
        res.statusCode = 503;
        res.setHeader("Retry-After", retryAfter);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Server busy, retry shortly");
        return true;
      }
      state.inflight += 1;
      let released = false;
      let graceTimer = null;
      const release = () => {
        if (released) return;
        released = true;
        if (graceTimer) clearTimeout(graceTimer);
        state.inflight -= 1;
      };
      // finish = the response was written: the render is over. When the
      // client has already gone, a destroyed response never emits finish, so
      // the end() call itself (Next writing its last byte) releases too.
      res.once("finish", release);
      const originalEnd = res.end;
      res.end = function end() {
        release();
        return originalEnd.apply(this, arguments);
      };
      // close before the render ends = the client went away while it runs on;
      // keep the slot for the grace period, or until end(), whichever first.
      res.once("close", () => {
        if (released) return;
        if (abandonedGraceMs === 0) {
          release();
          return;
        }
        graceTimer = setTimeout(release, abandonedGraceMs);
        graceTimer.unref();
      });
    }
    return originalEmit.apply(this, arguments);
  };

  // One line per minute at most, and only when something was shed, so a
  // saturated process shows up in the container log without flooding it.
  let lastShed = 0;
  setInterval(() => {
    if (state.shed === lastShed) return;
    process.stderr.write(
      `[ssr-admission] shed ${state.shed - lastShed} requests in the last 60s (inflight=${state.inflight}, max=${state.max})\n`
    );
    lastShed = state.shed;
  }, 60_000).unref();

  process.stderr.write(`[ssr-admission] max in-flight renders per process: ${max}\n`);
} else if (rawMax !== undefined && rawMax !== "" && !(Number.isFinite(max) && max > 0) && max !== 0) {
  process.stderr.write(`[ssr-admission] SSR_MAX_INFLIGHT=${JSON.stringify(rawMax)} is not a positive number; disabled\n`);
} else {
  process.stderr.write("[ssr-admission] disabled (SSR_MAX_INFLIGHT unset or 0)\n");
}
