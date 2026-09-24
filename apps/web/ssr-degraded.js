// Keeps a degraded page render out of every shared cache.
//
// A server prefetch that outlives its SSR timeout (query-helpers.ts) resolves
// undefined and the page renders without that data, leaving the client to
// fetch it after hydration. That is the right fallback for the one visitor,
// but the middleware decided Cache-Control before the render began, so the
// degraded document still carried the route's s-maxage and was stored at the
// origin nginx and the edge for the whole tier: five minutes of an entry-less
// profile for everyone, an hour or more on post pages (#1558). Nothing in the
// App Router lets a server component change a response header once rendering
// has started, and throwing instead turns into a 500 that keeps the same
// Cache-Control and is stored whenever there is no older copy to fall back to.
//
// This preload gives each request an async context. A timed-out prefetch
// calls globalThis.__ecencySsrDegraded.mark(), which flags the request it ran
// under, and when the response head is written a flagged response goes out as
// `private, no-store`, with `-degraded` appended to x-cache-tier. No layer
// stores it, and an expired good copy stays in place to be served stale while
// the next request renders again. A render streamed past its first flush
// cannot be changed any more; those are counted as `late`.
//
// One stderr line per minute, only when something was degraded, so a slow
// upstream shows up in the container log instead of passing silently.
//
// Loaded with `node --require ./ssr-degraded.js` (see the Dockerfile CMD).
// Runs before Next, so it must stay dependency-free.
const http = require("http");
const { AsyncLocalStorage } = require("async_hooks");

const DEGRADED_CACHE_CONTROL = "private, no-store";
const MAX_SAMPLE_PATHS = 5;

const storage = new AsyncLocalStorage();
const state = { degraded: 0, late: 0 };
let samplePaths = new Set();

function pathOf(req) {
  const url = (req && req.url) || "/";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function mark(reason) {
  const ctx = storage.getStore();
  if (!ctx) return;
  if (ctx.res.headersSent) {
    // Counted per timeout: the head is gone and nothing can be changed.
    if (!ctx.late) state.late += 1;
    ctx.late = true;
  } else {
    if (!ctx.reason) state.degraded += 1;
    ctx.reason = ctx.reason || String(reason || "degraded");
  }
  if (samplePaths.size < MAX_SAMPLE_PATHS) samplePaths.add(pathOf(ctx.req));
}

// Read by specs; the app only calls mark().
globalThis.__ecencySsrDegraded = { mark, state };

const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function emit(event, req, res) {
  if (event !== "request" || !req || !res) {
    return originalEmit.apply(this, arguments);
  }
  const ctx = { req, res, reason: null, late: false };
  // Every path to the wire goes through writeHead: an explicit call, or
  // _implicitHeader() on the first write()/end()/flushHeaders().
  const originalWriteHead = res.writeHead;
  res.writeHead = function writeHead() {
    if (ctx.reason) {
      this.setHeader("Cache-Control", DEGRADED_CACHE_CONTROL);
      const tier = this.getHeader("x-cache-tier");
      if (tier) this.setHeader("x-cache-tier", `${tier}-degraded`);
    }
    return originalWriteHead.apply(this, arguments);
  };
  return storage.run(ctx, () => originalEmit.apply(this, arguments));
};

let last = { degraded: 0, late: 0 };
setInterval(() => {
  if (state.degraded === last.degraded && state.late === last.late) return;
  process.stderr.write(
    `[ssr-degraded] ${state.degraded - last.degraded} responses sent uncacheable after an SSR prefetch timeout in the last 60s, ` +
      `${state.late - last.late} too late to change (headers already sent); paths: ${Array.from(samplePaths).join(" ")}\n`
  );
  last = { degraded: state.degraded, late: state.late };
  samplePaths = new Set();
}, 60_000).unref();
