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
// does not end the render in a way this layer can see: Next aborts the stream
// and destroys the response (no end(), no finish), the render stops at its
// next chunk boundary, but an async server component already inside a chain
// of awaited prefetches runs on, each leg bounded by the server prefetch
// timeout (10s). There is no completion signal for that tail, so the slot is
// held for a fixed grace after the socket closes, long enough to cover several
// sequential legs, and the undercount is bounded to renders that outlive it,
// which the event-loop monitor reports as pathological anyway.
const rawGrace = process.env.SSR_ABANDONED_GRACE_MS;
const abandonedGraceMs = /^\d{1,6}$/.test(rawGrace || "") ? Number(rawGrace) : 30_000;

// Paths that are not page renders, named precisely: the build output, API
// routes, the public/ directories, the static root files the app serves, and
// the Redis-backed sitemap routes. Anything else that reaches this process is
// work on the render loop and counts: a document, an RSC navigation, an RSS
// feed (`/@user/rss.xml` renders twenty posts), an agent route
// (`/@author/permlink.md|.json|.discussion.json`, a suffix the middleware
// appends to a permlink, renders the post), and an unknown path such as
// `/@author/post.png` (permlinks never contain a dot, so that is the
// not-found page, still a render). Hence no extension-based bypass at all:
// every static file this app serves lives under a prefix or at a root path
// listed here, so a name is the only safe test.
const PASS_PREFIXES = ["/_next/", "/api/", "/assets/", "/scripts/", "/geo/", "/dmca/", "/.well-known/", "/sitemap/"];
const PASS_EXACT = new Set([
  "/favicon.ico",
  "/manifest.json",
  "/robots.txt",
  "/llms.txt",
  "/sitemap.xml",
  "/sw.js",
  "/firebase-messaging-sw.js",
  "/og.jpg",
  "/next.svg",
  "/vercel.svg",
  "/public-nodes.json",
  "/apple-app-site-association"
]);

function isRender(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = req.url || "/";
  const q = url.indexOf("?");
  const path = q === -1 ? url : url.slice(0, q);
  if (PASS_EXACT.has(path)) return false;
  for (const prefix of PASS_PREFIXES) {
    if (path.startsWith(prefix)) return false;
  }
  return true;
}

const state = { max, inflight: 0, shed: 0, abandoned: 0 };
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
        state.abandoned += 1;
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
      `[ssr-admission] shed ${state.shed - lastShed} requests in the last 60s (inflight=${state.inflight}, max=${state.max}, abandoned=${state.abandoned})\n`
    );
    lastShed = state.shed;
  }, 60_000).unref();

  process.stderr.write(`[ssr-admission] max in-flight renders per process: ${max}\n`);
} else if (rawMax !== undefined && rawMax !== "" && !(Number.isFinite(max) && max > 0) && max !== 0) {
  process.stderr.write(`[ssr-admission] SSR_MAX_INFLIGHT=${JSON.stringify(rawMax)} is not a positive number; disabled\n`);
} else {
  process.stderr.write("[ssr-admission] disabled (SSR_MAX_INFLIGHT unset or 0)\n");
}
