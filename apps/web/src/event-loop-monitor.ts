/**
 * Event loop lag monitor + stuck-loop watchdog.
 *
 * Background: the Next.js server runs on a single-threaded event loop. Any
 * synchronous CPU work (regex backtracking, huge JSON parsing, markdown
 * rendering, etc.) blocks ALL requests — including healthchecks. When that
 * happens the container can look completely dead even though Node is just
 * busy.
 *
 * The naïve approach — a setInterval on the main thread that samples event
 * loop delay — has a fatal flaw: when the loop is truly stuck, the interval
 * cannot fire, so the blocker is never logged. It only prints AFTER unblock
 * (or never, if the healthcheck kills the container first).
 *
 * Architecture here:
 *
 *   ┌────────────────────── main thread ──────────────────────┐
 *   │ diagnostics_channel → { start, finish } events          │
 *   │ per request, postMessage({start|end,id,method,url}) ──┐ │
 *   │ heartbeat every 100ms: postMessage({heartbeat,ts}) ───┤ │
 *   │ histogram monitorEventLoopDelay → post-unblock SPIKE  │ │
 *   └───────────────────────────────────────────────────────┼─┘
 *                                                           │
 *   ┌────────────────── watchdog worker ───────────────────┐ │
 *   │ own event loop, own setInterval(100ms)               │◄┘
 *   │ maintains parallel activeRequests map                │
 *   │ if (now - lastHeartbeat) > threshold:                │
 *   │   fs.writeSync(2, "STUCK ..." + activeRequests)      │
 *   │ on next heartbeat: writeSync "RECOVERED ..."         │
 *   └──────────────────────────────────────────────────────┘
 *
 * The worker runs on its own libuv event loop, completely independent of the
 * main thread. When the main thread blocks, the worker keeps ticking and
 * logs the URLs it last heard were in-flight. All output uses fs.writeSync
 * on fd 2 to bypass Node streams and guarantee flush — important because
 * stream-buffered output is lost when the container is SIGKILLed.
 *
 * Tuning (all via env, no rebuild):
 *   EVENT_LOOP_LAG_THRESHOLD_MS    — SPIKE threshold, default 1000
 *   EVENT_LOOP_STUCK_THRESHOLD_MS  — STUCK threshold (watchdog), default 500
 *   EVENT_LOOP_SAMPLE_INTERVAL_MS  — histogram sample window, default 1000
 *   EVENT_LOOP_SLOW_REQUEST_MS     — "slow" request threshold, default 500
 *   EVENT_LOOP_MONITOR_DISABLED    — set to "1" to disable entirely
 */

import diagnosticsChannel from "node:diagnostics_channel";
import fs from "node:fs";
import os from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import v8 from "node:v8";
import { Worker } from "node:worker_threads";
import { HEAP_PRESSURE_RATIO, heapPressureLine } from "./heap-pressure";

type ActiveRequest = {
  id: number;
  method: string;
  url: string;
  startTime: number;
};

type SlowRequest = {
  method: string;
  url: string;
  durationMs: number;
  finishedAt: number;
};

const activeRequests = new Map<object, ActiveRequest>();
const recentSlowRequests: SlowRequest[] = [];
const MAX_RECENT_SLOW = 20;

let initialized = false;

// Strip the query string from a request URL before we record it anywhere.
//
// Some routes carry credentials in query params that must never end up in
// stderr logs:
//   - /auth?code=<HiveSigner auth code>  (exchanges for access/refresh tokens)
//   - /api/mattermost/websocket?token=<bearer token>
// We discard the entire query rather than maintaining an allowlist — the
// path alone is enough for diagnosing stalls, and new secret-bearing params
// shouldn't silently leak if someone adds them later.
export function sanitizeUrl(url: string): string {
  const qIdx = url.indexOf("?");
  const hashIdx = url.indexOf("#");
  const cutAt =
    qIdx === -1 ? hashIdx : hashIdx === -1 ? qIdx : Math.min(qIdx, hashIdx);
  return cutAt === -1 ? url : url.slice(0, cutAt);
}

// Synchronous stderr write that bypasses Node's streams. Crucial: if the
// container is killed by the healthcheck before the async stream flushes,
// buffered output is lost. fs.writeSync(2, …) calls write(2) directly.
function writeStderrSync(line: string): void {
  try {
    fs.writeSync(2, line.endsWith("\n") ? line : line + "\n");
  } catch {
    // stderr closed — nothing we can do
  }
}

export function initEventLoopMonitor(): void {
  if (initialized) return;
  if (process.env.EVENT_LOOP_MONITOR_DISABLED === "1") return;
  if (!process.versions?.node) return;
  initialized = true;

  const lagThresholdMs = Number(process.env.EVENT_LOOP_LAG_THRESHOLD_MS ?? 1000);
  const stuckThresholdMs = Number(process.env.EVENT_LOOP_STUCK_THRESHOLD_MS ?? 500);
  const sampleIntervalMs = Number(process.env.EVENT_LOOP_SAMPLE_INTERVAL_MS ?? 1000);
  const slowRequestMs = Number(process.env.EVENT_LOOP_SLOW_REQUEST_MS ?? 500);
  // Out-of-band healthcheck: the watchdog worker exposes an HTTP /health on
  // its own libuv loop. Swarm's healthcheck (apps/web/healthCheck.js) hits
  // this port instead of the main Next.js port so brief queue starvation in
  // the main thread doesn't get classified as "container unhealthy". Set to
  // 0 to disable (falls back to main-thread /api/healthcheck).
  const healthcheckPort = Number(process.env.HEALTHCHECK_PORT ?? 3030);
  // Threshold beyond which the main-thread heartbeat is considered stale and
  // /health returns 503. Generous enough to ride out occasional GC pauses,
  // tight enough that a hung process is detected within ~3 healthcheck cycles.
  const healthcheckHeartbeatTimeoutMs = Number(
    process.env.HEALTHCHECK_HEARTBEAT_TIMEOUT_MS ?? 30_000
  );

  const host =
    process.env.HOSTNAME ||
    process.env.HOST ||
    (typeof os.hostname === "function" ? os.hostname() : "unknown");
  const taskName = process.env.TASK_NAME || process.env.SERVICE_NAME;
  const containerTag = taskName ? `${taskName}@${host}` : host;

  // Inline watchdog worker source. Runs on its own event loop and is
  // therefore immune to main-thread stalls. Uses only require() (no
  // bundler involvement) and writes straight to stderr via write(2).
  // Also serves an out-of-band /health endpoint on HEALTHCHECK_PORT so
  // Swarm healthchecks aren't queued behind work on the main thread.
  const watchdogSource = `
    const { parentPort } = require("node:worker_threads");
    const fs = require("node:fs");
    const http = require("node:http");

    const CONTAINER = ${JSON.stringify(containerTag)};
    const STUCK_MS = ${stuckThresholdMs};
    const CHECK_MS = 100;
    const HEALTHCHECK_PORT = ${healthcheckPort};
    const HEARTBEAT_TIMEOUT_MS = ${healthcheckHeartbeatTimeoutMs};

    const active = new Map();
    let lastHeartbeat = Date.now();
    let stuckReportedAt = 0;

    function writeLine(line) {
      try { fs.writeSync(2, line + "\\n"); } catch (e) {}
    }

    parentPort.on("message", (msg) => {
      switch (msg.type) {
        case "start":
          active.set(msg.id, { method: msg.method, url: msg.url, startTime: msg.ts });
          break;
        case "end":
          active.delete(msg.id);
          break;
        case "heartbeat": {
          const prev = lastHeartbeat;
          lastHeartbeat = msg.ts;
          if (stuckReportedAt) {
            const stuckForMs = msg.ts - prev;
            writeLine("[EventLoopLag] RECOVERED " + JSON.stringify({
              container: CONTAINER,
              stuckForMs: stuckForMs
            }));
            stuckReportedAt = 0;
          }
          break;
        }
      }
    });

    setInterval(() => {
      const delta = Date.now() - lastHeartbeat;
      if (delta <= STUCK_MS) return;
      // Avoid spamming: only emit once per stall, then wait for recovery.
      if (stuckReportedAt) return;
      stuckReportedAt = Date.now();
      const now = Date.now();
      const snapshot = Array.from(active.values())
        .map(r => ({ method: r.method, url: r.url, durationMs: now - r.startTime }))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10);
      writeLine("[EventLoopLag] STUCK " + JSON.stringify({
        container: CONTAINER,
        stuckForMs: delta,
        activeCount: active.size,
        active: snapshot
      }));
    }, CHECK_MS).unref();

    // Out-of-band healthcheck: returns 200 only if the main thread has sent
    // a heartbeat within HEARTBEAT_TIMEOUT_MS. This lets the watchdog answer
    // healthchecks even when the main HTTP server is queue-starved on a
    // traffic spike, but still fails fast when Node is actually dead
    // (segfault, OOM stall, infinite sync loop). Set HEALTHCHECK_PORT=0 to
    // disable and fall back to the main-thread /api/healthcheck.
    if (HEALTHCHECK_PORT > 0) {
      const server = http.createServer((req, res) => {
        const ageMs = Date.now() - lastHeartbeat;
        const healthy = ageMs < HEARTBEAT_TIMEOUT_MS;
        const body = JSON.stringify({
          status: healthy ? "ok" : "stale",
          heartbeatAgeMs: ageMs,
          activeRequests: active.size,
          container: CONTAINER
        });
        res.writeHead(healthy ? 200 : 503, {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "Cache-Control": "no-store"
        });
        res.end(body);
      });
      server.on("error", (e) => {
        writeLine("[EventLoopLag] healthcheck server error: " + (e && e.message ? e.message : e));
      });
      // Bind to localhost only — same container's healthcheck script is the
      // sole intended client; not reachable from outside the container.
      server.listen(HEALTHCHECK_PORT, "127.0.0.1");
    }
  `;

  let worker: Worker | null = null;
  try {
    worker = new Worker(watchdogSource, { eval: true });
    worker.on("error", (err) => {
      writeStderrSync(`[EventLoopLag] watchdog worker error: ${err?.message || err}`);
    });
    worker.unref();
  } catch (err) {
    writeStderrSync(
      `[EventLoopLag] failed to start watchdog worker: ${(err as Error)?.message || err}`
    );
  }

  const postToWorker = (msg: Record<string, unknown>): void => {
    if (!worker) return;
    try {
      worker.postMessage(msg);
    } catch {
      // worker may be terminating
    }
  };

  let nextReqId = 0;

  const startChannel = diagnosticsChannel.channel("http.server.request.start");
  const finishChannel = diagnosticsChannel.channel("http.server.response.finish");

  // Centralized cleanup so response.finish, request abort, and connection
  // close all converge on the same removal path. activeRequests.delete()
  // returns whether the key was present, which guards against double-emit
  // when multiple events fire for the same request (e.g. finish then close).
  type RequestLike = {
    method?: string;
    url?: string;
    on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
    once?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  };
  const finalize = (request: RequestLike, finished: boolean): void => {
    const info = activeRequests.get(request);
    if (!info) return;
    activeRequests.delete(request);
    postToWorker({ type: "end", id: info.id });
    if (!finished) return;
    const durationMs = Date.now() - info.startTime;
    if (durationMs >= slowRequestMs) {
      recentSlowRequests.push({
        method: info.method,
        url: info.url,
        durationMs,
        finishedAt: Date.now()
      });
      if (recentSlowRequests.length > MAX_RECENT_SLOW) {
        recentSlowRequests.shift();
      }
    }
  };

  startChannel.subscribe((message) => {
    const { request } = message as { request?: RequestLike };
    if (!request) return;
    const id = ++nextReqId;
    const entry: ActiveRequest = {
      id,
      method: request.method ?? "UNKNOWN",
      url: sanitizeUrl(request.url ?? "unknown"),
      startTime: Date.now()
    };
    activeRequests.set(request, entry);
    postToWorker({
      type: "start",
      id,
      method: entry.method,
      url: entry.url,
      ts: entry.startTime
    });

    // Disconnect cleanup: when a CF Worker hits its 8s timeout (or any
    // client goes away mid-response), the underlying socket closes but the
    // http.server.response.finish channel never fires. Without these
    // listeners the request stayed in activeRequests forever, making the
    // watchdog report phantom "1h+" stuck entries. Listen on both abort and
    // close to cover pre-response and mid-response disconnects.
    request.once?.("aborted", () => finalize(request, false));
    request.once?.("close", () => finalize(request, false));
  });

  finishChannel.subscribe((message) => {
    const { request } = message as { request?: RequestLike };
    if (!request) return;
    finalize(request, true);
  });

  // Heartbeat: keeps the watchdog informed the main loop is alive.
  // When this stops firing, the watchdog fires the STUCK log.
  setInterval(() => {
    postToWorker({ type: "heartbeat", ts: Date.now() });
  }, 100).unref();

  // Histogram-based post-unblock SPIKE log. Still useful for milder
  // stalls that the watchdog's stuck threshold doesn't trigger on.
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  let lastHeapPressureAt = 0;
  let lastHeapPressureRatio = 0;

  setInterval(() => {
    // Near the heap cap, name the renders in flight before a possible abort
    // takes the log with it (#2043). At most one line a minute, and only on a
    // new high-water mark until the heap drops back under the threshold.
    const heap = v8.getHeapStatistics();
    const heapRatio = heap.heap_size_limit > 0 ? heap.used_heap_size / heap.heap_size_limit : 0;
    if (heapRatio < HEAP_PRESSURE_RATIO) lastHeapPressureRatio = 0;
    const heapLine = heapPressureLine({
      usedBytes: heap.used_heap_size,
      limitBytes: heap.heap_size_limit,
      active: activeRequests.values(),
      containerTag,
      now: Date.now(),
      lastAt: lastHeapPressureAt,
      lastRatio: lastHeapPressureRatio
    });
    if (heapLine) {
      lastHeapPressureAt = Date.now();
      lastHeapPressureRatio = heapRatio;
      writeStderrSync(heapLine);
    }

    const maxMs = histogram.max / 1e6;
    if (maxMs >= lagThresholdMs) {
      const now = Date.now();
      const active = Array.from(activeRequests.values())
        .map((r) => ({
          method: r.method,
          url: r.url,
          durationMs: now - r.startTime
        }))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10);

      const recentSlow = recentSlowRequests
        .slice()
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10)
        .map((r) => ({
          method: r.method,
          url: r.url,
          durationMs: r.durationMs,
          agoMs: now - r.finishedAt
        }));

      const mem = process.memoryUsage();

      writeStderrSync(
        "[EventLoopLag] SPIKE " +
          JSON.stringify({
            container: containerTag,
            windowMs: sampleIntervalMs,
            maxMs: Math.round(maxMs),
            p99Ms: Math.round(histogram.percentile(99) / 1e6),
            meanMs: Math.round(histogram.mean / 1e6),
            rssMb: Math.round(mem.rss / 1024 / 1024),
            heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
            activeCount: activeRequests.size,
            active,
            recentSlow
          })
      );
    }
    histogram.reset();
  }, sampleIntervalMs).unref();

  writeStderrSync(
    `[EventLoopLag] monitor initialized container=${containerTag} ` +
      `(spikeThreshold=${lagThresholdMs}ms, stuckThreshold=${stuckThresholdMs}ms, ` +
      `interval=${sampleIntervalMs}ms, slowReq=${slowRequestMs}ms, watchdog=${worker ? "on" : "off"})`
  );
}
