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
// This preload gives each request an async context. A prefetch that timed
// out or failed calls globalThis.__ecencySsrDegraded.mark(reason), which flags
// the request it ran under, and when the response head is written a flagged
// response goes out as `private, no-store`, with `-degraded` appended to
// x-cache-tier. No layer stores it, and an expired good copy stays in place to
// be served stale while the next request renders again. The status is left
// alone, with one exception: a page whose required record lookup failed
// (`lookup-unavailable`, prefetchRequired in query-helpers.ts) throws, and
// Next answers 500. That response goes out as a 503 with Retry-After, which
// tells crawlers the page is temporarily unavailable rather than broken, and
// is the status that stale-serving caches and retrying proxies in front of
// the app act on (#2000). A render streamed past its first flush cannot be changed
// any more; those are counted as `late`, and their paths name the streamed
// routes that still cache a degraded document.
//
// One stderr line per minute, only when something happened, so a slow or
// failing upstream shows up in the container log instead of passing silently.
// Each outcome is counted by reason with its own sample paths: `sent` (head
// written as no-store), `late` (head already sent, response unchanged) and
// `abandoned` (marked, but the client went away before any head was written,
// so nothing was sent at all). A mark may carry a detail (the failing error);
// the line ends with a few distinct ones, so it says why, not only how often.
//
// Loaded with `node --require ./ssr-degraded.js` (see the Dockerfile CMD).
// Runs before Next, so it must stay dependency-free.
const http = require("http");
const { AsyncLocalStorage } = require("async_hooks");

const DEGRADED_CACHE_CONTROL = "private, no-store";
const MAX_SAMPLE_PATHS = 5;
const MAX_SAMPLE_DETAILS = 3;
const MAX_DETAIL_LENGTH = 120;
const OUTCOMES = ["sent", "late", "abandoned"];
// A required record could not be read (see the header). Its server error is
// sent as a retryable 503.
const LOOKUP_UNAVAILABLE = "lookup-unavailable";
const RETRY_AFTER_SECONDS = "30";

const storage = new AsyncLocalStorage();

// Per outcome: counts by reason, and a few sample paths.
function emptyTally() {
  const tally = {};
  for (const outcome of OUTCOMES) tally[outcome] = { reasons: {}, paths: new Set() };
  return tally;
}
// Lifetime counts, read by specs; the window is what the next log line reports.
const totals = { sent: {}, late: {}, abandoned: {} };
let window = emptyTally();
// A few distinct mark details (failing errors) for the next log line.
let details = new Set();

function sampleDetail(detail) {
  if (detail === undefined || detail === null || details.size >= MAX_SAMPLE_DETAILS) return;
  details.add(String(detail).replace(/\s+/g, " ").slice(0, MAX_DETAIL_LENGTH));
}

function pathOf(req) {
  const url = (req && req.url) || "/";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function record(outcome, reason, req) {
  totals[outcome][reason] = (totals[outcome][reason] || 0) + 1;
  const entry = window[outcome];
  entry.reasons[reason] = (entry.reasons[reason] || 0) + 1;
  if (entry.paths.size < MAX_SAMPLE_PATHS) entry.paths.add(pathOf(req));
}

function mark(reason, detail) {
  const ctx = storage.getStore();
  if (!ctx) return;
  const why = String(reason || "degraded");
  sampleDetail(detail);
  // Kept apart from ctx.reason: an earlier mark under another reason must not
  // stop a failed record lookup from going out as a 503.
  if (why === LOOKUP_UNAVAILABLE && !ctx.res.headersSent) ctx.unavailable = true;
  if (ctx.res.headersSent) {
    // Once per request: the head is gone and nothing can be changed. A request
    // marked before its head already went out uncacheable, so it is not late.
    if (!ctx.reason && !ctx.late) record("late", why, ctx.req);
    ctx.late = true;
  } else if (!ctx.reason) {
    ctx.reason = why;
    // The client left while this prefetch was still pending: close has fired
    // already and no head will ever be written.
    if (ctx.closed) record("abandoned", why, ctx.req);
  }
}

function flush() {
  const parts = [];
  for (const outcome of OUTCOMES) {
    const { reasons, paths } = window[outcome];
    const counts = Object.entries(reasons).map(([r, n]) => `${r}=${n}`);
    if (counts.length === 0) continue;
    parts.push(`${outcome} ${counts.join(",")} [${Array.from(paths).join(" ")}]`);
  }
  if (parts.length > 0 && details.size > 0) {
    parts.push(`errors [${Array.from(details).join(" | ")}]`);
  }
  window = emptyTally();
  details = new Set();
  if (parts.length === 0) return;
  process.stderr.write(`[ssr-degraded] last 60s: ${parts.join("; ")}\n`);
}

// Headers handed to writeHead (an object, or a flat [name, value, ...] array)
// are applied over setHeader values, so a degraded response's own headers are
// removed from them, case-insensitively, for the preload's to stand.
function dropHeaders(args, names) {
  const index = args.findIndex((a, i) => i > 0 && a !== null && typeof a === "object");
  if (index === -1) return;
  const headers = args[index];
  if (Array.isArray(headers)) {
    const kept = [];
    for (let i = 0; i + 1 < headers.length; i += 2) {
      if (!names.includes(String(headers[i]).toLowerCase())) kept.push(headers[i], headers[i + 1]);
    }
    args[index] = kept;
    return;
  }
  const kept = {};
  for (const key of Object.keys(headers)) {
    if (!names.includes(key.toLowerCase())) kept[key] = headers[key];
  }
  args[index] = kept;
}

// Read by specs; the app only calls mark().
globalThis.__ecencySsrDegraded = { mark, totals, flush };

const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function emit(event, req, res) {
  if (event !== "request" || !req || !res) {
    return originalEmit.apply(this, arguments);
  }
  const ctx = { req, res, reason: null, late: false, closed: false, unavailable: false };
  // Every path to the wire goes through writeHead: an explicit call, or
  // _implicitHeader() on the first write()/end()/flushHeaders().
  const originalWriteHead = res.writeHead;
  res.writeHead = function writeHead() {
    const args = Array.from(arguments);
    if (ctx.reason) {
      this.setHeader("Cache-Control", DEGRADED_CACHE_CONTROL);
      const tier = this.getHeader("x-cache-tier");
      if (tier) this.setHeader("x-cache-tier", `${tier}-degraded`);
      record("sent", ctx.reason, req);
    }
    // Only a server error is rewritten: notFound() keeps its 404, a page that
    // rendered anyway keeps its 200.
    const status = typeof args[0] === "number" ? args[0] : this.statusCode;
    if (ctx.unavailable && status >= 500) {
      if (typeof args[0] === "number") {
        args[0] = 503;
        // writeHead(status, statusMessage, headers): drop a stale message.
        if (typeof args[1] === "string") args.splice(1, 1);
      } else {
        this.statusCode = 503;
      }
      this.statusMessage = "Service Unavailable";
      this.setHeader("Cache-Control", DEGRADED_CACHE_CONTROL);
      this.setHeader("Retry-After", RETRY_AFTER_SECONDS);
      dropHeaders(args, ["cache-control", "retry-after"]);
    } else if (ctx.reason) {
      dropHeaders(args, ["cache-control"]);
    }
    return originalWriteHead.apply(this, args);
  };
  res.once("close", () => {
    ctx.closed = true;
    if (ctx.reason && !res.headersSent) record("abandoned", ctx.reason, req);
  });
  return storage.run(ctx, () => originalEmit.apply(this, arguments));
};

setInterval(flush, 60_000).unref();
