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
// renders are counted: static assets, API routes and the health check pass
// through uncounted. Disabled unless SSR_MAX_INFLIGHT is a positive number.
//
// Loaded with `node --require ./ssr-admission.js` (see the Dockerfile CMD).
// Runs before Next, so it must stay dependency-free.
const http = require("http");

const max = Number(process.env.SSR_MAX_INFLIGHT || 0);
const retryAfter = String(process.env.SSR_SHED_RETRY_AFTER || "1");

// Paths that are not page renders. Anything else that reaches this process is
// a document or an RSC navigation (the reverse proxy keeps private-api and
// friends away from it), so those are what the cap protects.
const PASS_PREFIXES = ["/_next/", "/api/", "/assets/", "/scripts/"];
const PASS_EXACT = new Set(["/favicon.ico", "/manifest.json", "/robots.txt"]);

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

const state = { max, inflight: 0, shed: 0 };
// Read by the event-loop monitor's log lines; never written from outside.
globalThis.__ecencySsrAdmission = state;

if (max > 0) {
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
      const release = () => {
        if (released) return;
        released = true;
        state.inflight -= 1;
      };
      // finish = response written; close = client went away first (the CF
      // worker's timeout, a navigation away). Either way the slot is free.
      res.once("finish", release);
      res.once("close", release);
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
} else {
  process.stderr.write("[ssr-admission] disabled (SSR_MAX_INFLIGHT unset)\n");
}
