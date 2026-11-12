import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  callRPC,
  callRPCBroadcast,
  callREST,
  RPCError,
  NodeHealthTracker,
  HedgeBudget,
  rpcHedgeBudget,
  rpcHealthTracker,
  restHealthTracker,
  callRPCWithFallback,
  __METHOD_FALLBACK__,
} from "./call";
import { config, setResilience } from "../config";

/**
 * Tail-latency resilience: adaptive per-attempt timeouts + hedged reads.
 *
 * Module-level health trackers persist across tests, so every test uses its own
 * unique node hostnames (fresh namespace) instead of trying to reset shared
 * state. Real timers with small configured delays; assertions use generous
 * margins to stay CI-safe. Tuning fields are set by direct config.resilience
 * mutation (the documented pattern) because setResilience deliberately clamps
 * unsafe values — the setter's clamps get their own tests below.
 */

const ORIGINAL_NODES = [...config.nodes];
const ORIGINAL_REST_NODES = [...config.restNodes];
const ORIGINAL_TIMEOUT = config.timeout;
const ORIGINAL_RETRY = config.retry;
const ORIGINAL_RESILIENCE = { ...config.resilience };

let ns = 0;
/** Unique node URLs per test — avoids cross-test health-tracker pollution. */
function freshNodes(n: number): string[] {
  ns++;
  return Array.from({ length: n }, (_, i) => `https://res-${ns}-${String.fromCharCode(97 + i)}.test`);
}

beforeEach(() => {
  config.timeout = 5_000;
  config.retry = 5;
  Object.assign(config.resilience, ORIGINAL_RESILIENCE);
  rpcHedgeBudget.reset();
});

afterEach(() => {
  config.nodes = ORIGINAL_NODES;
  config.restNodes = ORIGINAL_REST_NODES;
  config.timeout = ORIGINAL_TIMEOUT;
  config.retry = ORIGINAL_RETRY;
  Object.assign(config.resilience, ORIGINAL_RESILIENCE);
  rpcHedgeBudget.reset();
  vi.restoreAllMocks();
});

function jsonOk(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function readJsonRpcId(init?: RequestInit | any): number {
  if (!init?.body) return 0;
  try {
    const parsed = JSON.parse(String(init.body));
    return typeof parsed?.id === "number" ? parsed.id : 0;
  } catch {
    return 0;
  }
}

type Behavior =
  | { kind: "ok"; result?: unknown; delayMs?: number }
  | { kind: "hang" } // pends forever, rejects on abort — like a stalled node
  | { kind: "http"; status: number; delayMs?: number }
  | { kind: "rpc-error"; code: number; message: string };

/**
 * URL-routed, abort-aware fetch mock that also tracks request concurrency —
 * `maxConcurrent` is what proves a hedge fired (2) or was suppressed (1).
 */
function routeFetch(routes: Record<string, Behavior>) {
  const calls: Array<{ host: string; at: number }> = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init: any) => {
    const url = String(input);
    const host = new URL(url).origin;
    calls.push({ host, at: Date.now() });
    inFlight++;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    const settle = <T,>(v: T): T => {
      inFlight--;
      return v;
    };
    const behavior = routes[host] ?? { kind: "ok" };
    const signal: AbortSignal | undefined = init?.signal;
    const id = readJsonRpcId(init);
    return new Promise<Response>((resolve, reject) => {
      const abortErr = () => {
        const e = new Error("The operation was aborted");
        e.name = "AbortError";
        return e;
      };
      if (signal?.aborted) {
        reject(settle(abortErr()));
        return;
      }
      const onAbort = () => reject(settle(abortErr()));
      signal?.addEventListener("abort", onAbort, { once: true });
      const respond = () => {
        signal?.removeEventListener("abort", onAbort);
        switch (behavior.kind) {
          case "hang":
            return; // never resolves; only the abort listener can settle it
          case "http":
            resolve(settle(new Response("err", { status: behavior.status })));
            return;
          case "rpc-error":
            resolve(
              settle(
                new Response(
                  JSON.stringify({
                    jsonrpc: "2.0",
                    id,
                    error: { code: behavior.code, message: behavior.message },
                  }),
                  { status: 200, headers: { "Content-Type": "application/json" } }
                )
              )
            );
            return;
          case "ok":
          default:
            resolve(settle(jsonOk(id, behavior.result ?? { ok: true })));
        }
      };
      if (behavior.kind === "hang") {
        return;
      }
      const delayMs = "delayMs" in behavior ? behavior.delayMs : undefined;
      if (delayMs) {
        const t = setTimeout(respond, delayMs);
        signal?.addEventListener("abort", () => clearTimeout(t), { once: true });
      } else {
        respond();
      }
    });
  });
  return {
    spy,
    calls,
    hostsInOrder: () => calls.map((c) => c.host),
    max: () => maxConcurrent,
  };
}

/** Method used by all RPC tests — seeding and asserting share one API profile. */
const METHOD = "condenser_api.get_accounts";

/** Seed a usable (node, api) EWMA for the FIRST node via fast successful calls. */
async function seedPrimaryProfile(nodes: string[]) {
  const seeded = routeFetch({ [nodes[0]]: { kind: "ok" } });
  for (let i = 0; i < 3; i++) {
    await callRPC(METHOD, [["ecency"]]);
  }
  expect(seeded.hostsInOrder().every((h) => h === nodes[0])).toBe(true);
  // The per-method profile must be usable or every hedge test silently
  // degrades to sequential behaviour (vacuous-test guard).
  expect(rpcHealthTracker.getUsableLatencyMs(nodes[0], METHOD)).toBeDefined();
  seeded.spy.mockRestore();
}

describe("adaptive per-attempt timeout", () => {
  it("abandons a profiled node at max(floor, factor×EWMA) instead of the caller timeout", async () => {
    const nodes = freshNodes(3);
    config.nodes = nodes;
    Object.assign(config.resilience, { adaptiveTimeoutFloorMs: 120, adaptiveTimeoutFactor: 2, hedge: false });
    await seedPrimaryProfile(nodes);

    // Primary (profiled, EWMA ~1ms) now stalls; adaptive timeout ≈ floor(120ms).
    const f = routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: 42 } });
    const t0 = Date.now();
    const res = await callRPC<number>(METHOD, [["ecency"]]);
    const elapsed = Date.now() - t0;

    expect(res).toEqual(42);
    // Failed over after ~120ms + jitter — a fraction of the 5s caller timeout.
    expect(elapsed).toBeLessThan(1_500);
    expect(f.hostsInOrder()[0]).toBe(nodes[0]);
    expect(f.hostsInOrder()[1]).toBe(nodes[1]);
  });

  it("feeds AbortSignal.timeout an integer when factor×EWMA is fractional (Node rejects floats)", async () => {
    const nodes = freshNodes(1);
    config.nodes = nodes;
    Object.assign(config.resilience, { adaptiveTimeoutFloorMs: 50, adaptiveTimeoutFactor: 1, hedge: false });
    // Production EWMAs are virtually always fractional (alpha-blend of samples);
    // seed one directly so the adaptive window is a non-integer above the floor.
    for (let i = 0; i < 3; i++) {
      rpcHealthTracker.recordSuccess(nodes[0], "condenser_api", 660.59, METHOD);
    }
    const ewma = rpcHealthTracker.getUsableLatencyMs(nodes[0], METHOD);
    expect(ewma).toBeDefined();
    expect(Number.isInteger(ewma)).toBe(false); // vacuous-test guard

    routeFetch({ [nodes[0]]: { kind: "ok", result: 42 } });
    // Node's AbortSignal.timeout throws ERR_OUT_OF_RANGE for non-integer delays.
    await expect(callRPC<number>(METHOD, [["ecency"]])).resolves.toEqual(42);
  });

  it("treats an explicit caller timeout as authoritative (no adaptive shortening)", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { adaptiveTimeoutFloorMs: 120, adaptiveTimeoutFactor: 1, hedge: false });
    await seedPrimaryProfile(nodes);

    routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: 8 } });
    const t0 = Date.now();
    // Explicit 300ms timeout — must be honored exactly, not clamped to ~120ms.
    const res = await callRPC<number>(METHOD, [["ecency"]], 300);
    const elapsed = Date.now() - t0;

    expect(res).toEqual(8);
    expect(elapsed).toBeGreaterThanOrEqual(280);
  });

  it("does not let a cheap-call profile set the deadline for a different (heavy) API", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    config.timeout = 300;
    Object.assign(config.resilience, { adaptiveTimeoutFloorMs: 120, adaptiveTimeoutFactor: 1, hedge: false });
    // Profile ONLY condenser_api on the primary.
    await seedPrimaryProfile(nodes);

    // A different API (bridge) on the same node is unprofiled → caller window.
    routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: 3 } });
    const t0 = Date.now();
    const res = await callRPC<number>("bridge.get_discussion", { author: "a", permlink: "p" });
    const elapsed = Date.now() - t0;

    expect(res).toEqual(3);
    // Waited (roughly) the full 300ms caller window, NOT the 120ms floor.
    expect(elapsed).toBeGreaterThanOrEqual(280);
  });

  it("keeps the caller timeout when the feature is disabled", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    config.timeout = 300;
    Object.assign(config.resilience, { adaptiveTimeoutFloorMs: 50, adaptiveTimeoutFactor: 1, hedge: false, adaptiveTimeout: false });
    await seedPrimaryProfile(nodes);

    routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: 7 } });
    const t0 = Date.now();
    const res = await callRPC<number>(METHOD, [["ecency"]]);
    const elapsed = Date.now() - t0;

    expect(res).toEqual(7);
    // Waited (roughly) the full 300ms caller timeout, NOT the 50ms floor.
    expect(elapsed).toBeGreaterThanOrEqual(280);
  });

  it("leaves unprofiled nodes on the caller timeout (cold start unchanged)", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    config.timeout = 250;
    Object.assign(config.resilience, { adaptiveTimeoutFloorMs: 50, adaptiveTimeoutFactor: 1, hedge: false });
    // NO seeding — primary has no usable EWMA.
    routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: 1 } });
    const t0 = Date.now();
    await callRPC(METHOD, [["ecency"]]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(230);
  });

  it("applies to callREST attempts as well", async () => {
    const nodes = freshNodes(2);
    config.restNodes = nodes;
    Object.assign(config.resilience, { adaptiveTimeoutFloorMs: 120, adaptiveTimeoutFactor: 2, hedge: false });
    // Seed the REST tracker's (node, api) profile directly.
    for (let i = 0; i < 3; i++) restHealthTracker.recordSuccess(nodes[0], "status", 5, "status:/status");

    routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: { fine: true } } });
    const t0 = Date.now();
    const res = await callREST("status", "/status");
    expect(res).toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(1_500);
  });
});

describe("total wall-clock budget", () => {
  it("stops starting new attempts past totalBudgetFactor × timeout when the pool is slow", async () => {
    const nodes = freshNodes(6);
    config.nodes = nodes;
    config.timeout = 200;
    config.retry = 5;
    Object.assign(config.resilience, { hedge: false, totalBudgetFactor: 2 }); // deadline = 400ms
    const routes: Record<string, Behavior> = {};
    for (const n of nodes) routes[n] = { kind: "hang" };
    const f = routeFetch(routes);

    const t0 = Date.now();
    await expect(callRPC(METHOD, [["ecency"]])).rejects.toBeTruthy();
    const elapsed = Date.now() - t0;

    // Unbudgeted worst case: 6 × 200ms + jitter ≈ 1.6s. The deadline cuts the
    // walk after ~2 attempts: well under half, and far fewer fetches.
    expect(elapsed).toBeLessThan(1_200);
    expect(f.spy.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

describe("hedged reads", () => {
  it("fires a hedge after the delay, first success wins, budget is spent", async () => {
    const nodes = freshNodes(2); // pool of exactly one candidate — deterministic target
    config.nodes = nodes;
    Object.assign(config.resilience, {
      hedge: true,
      hedgeDelayFloorMs: 100,
      hedgeDelayFactor: 1,
      adaptiveTimeoutFloorMs: 2_000,
      adaptiveTimeoutFactor: 4,
    });
    await seedPrimaryProfile(nodes);
    const before = rpcHedgeBudget.available;

    const f = routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: "hedged" } });
    const t0 = Date.now();
    const res = await callRPC<string>(METHOD, [["ecency"]]);
    const elapsed = Date.now() - t0;

    expect(res).toEqual("hedged");
    // Resolved shortly after the 100ms hedge delay — NOT the 2s adaptive floor.
    expect(elapsed).toBeLessThan(1_000);
    // Both legs genuinely overlapped.
    expect(f.max()).toBe(2);
    // Exactly one token spent.
    expect(rpcHedgeBudget.available).toBeCloseTo(before - 1, 5);
  });

  it("still hedges a heavy (node,api) profile — delay is clamped below the primary's window", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    config.timeout = 400; // ceiling; primary window = min(400, max(2000, 4×EWMA)) = 400
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 80, hedgeDelayFactor: 2 });
    // Heavy profile: EWMA 3s ⇒ un-clamped delay = 2×3000 = 6000ms, which lands
    // PAST the 400ms window — the primary's timeout-abort would clear the timer
    // and hedging would never fire for exactly this heavy tail. The clamp fires
    // it at 0.8 × 400 = 320ms instead. The peer is profiled slower (5s) so the
    // heavy node still ranks first (an unproven peer would outrank a 3s EWMA
    // via the neutral prior and steal the primary slot).
    for (let i = 0; i < 3; i++) rpcHealthTracker.recordSuccess(nodes[0], "condenser_api", 3_000, METHOD);
    for (let i = 0; i < 3; i++) rpcHealthTracker.recordSuccess(nodes[1], "condenser_api", 5_000, METHOD);

    const f = routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: "heavy-hedged" } });
    const res = await callRPC<string>(METHOD, [["ecency"]]);
    expect(res).toEqual("heavy-hedged");
    // The duplicate genuinely overlapped the primary — the timer beat the abort.
    expect(f.max()).toBe(2);
  });

  it("repeated hedge-wins teach the ranker to reorder (censored latency)", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 80, hedgeDelayFactor: 1 });
    await seedPrimaryProfile(nodes);

    routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: "x" } });
    // Several hedge-wins: each feeds the stalled primary a censored (≥delay)
    // latency sample and the hedge node a fast success sample.
    for (let i = 0; i < 3; i++) {
      await callRPC(METHOD, [["ecency"]]);
    }

    // Next call: the previously-hedged node should now rank FIRST.
    const f2 = routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: "y" } });
    await callRPC(METHOD, [["ecency"]]);
    expect(f2.hostsInOrder()[0]).toBe(nodes[1]);
  });

  it("records NO censored sample for a primary that already failed before the hedge won", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 60, hedgeDelayFactor: 1 });
    await seedPrimaryProfile(nodes);
    const ewmaBefore = rpcHealthTracker.getUsableLatencyMs(nodes[0])!;
    expect(ewmaBefore).toBeLessThan(50); // seeded fast

    // Primary fails on its own AFTER the hedge fires (503 at ~150ms > 60ms
    // delay); the hedge then wins much later (400ms). A censored sample here
    // would fabricate a ~400ms latency for a node that answered (an error) at
    // 150ms — its EWMA must stay untouched by this interleaving.
    routeFetch({
      [nodes[0]]: { kind: "http", status: 503, delayMs: 150 },
      [nodes[1]]: { kind: "ok", result: "late-win", delayMs: 340 },
    });
    const res = await callRPC<string>(METHOD, [["ecency"]]);
    expect(res).toEqual("late-win");

    // Fast-failing 503 is below the slow-failure floor and the censored sample
    // is suppressed → the primary's EWMA is exactly as seeded.
    const ewmaAfter = rpcHealthTracker.getUsableLatencyMs(nodes[0])!;
    expect(ewmaAfter).toBeCloseTo(ewmaBefore, 3);
  });

  it("does not hedge when the budget is empty (no concurrent duplicate)", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, {
      hedge: true,
      hedgeDelayFloorMs: 60,
      hedgeDelayFactor: 1,
      adaptiveTimeoutFloorMs: 2_000,
      adaptiveTimeoutFactor: 4,
    });
    config.timeout = 250; // unhedged path falls over via the caller window
    await seedPrimaryProfile(nodes);
    rpcHedgeBudget.reset(0);

    const f = routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: 9 } });
    const res = await callRPC<number>(METHOD, [["ecency"]]);
    expect(res).toEqual(9);
    // The delay (60ms) elapsed while the primary stalled, but with zero tokens
    // no duplicate may ever be in flight concurrently.
    expect(f.max()).toBe(1);
    // The sequential failover SUCCESS earned one refill — and nothing more
    // (proves the suppressed hedge spent nothing while below a whole token).
    expect(rpcHedgeBudget.available).toBeCloseTo(config.resilience.hedgeRefillPerSuccess, 5);
  });

  it("clears the hedge when the primary answers before the delay", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 200, hedgeDelayFactor: 1 });
    await seedPrimaryProfile(nodes);
    const before = rpcHedgeBudget.available;

    const f = routeFetch({ [nodes[0]]: { kind: "ok", result: "fast", delayMs: 20 } });
    const res = await callRPC<string>(METHOD, [["ecency"]]);
    // Give a cancelled-timer bug a chance to surface before asserting.
    await new Promise((r) => setTimeout(r, 300));

    expect(res).toEqual("fast");
    expect(f.spy).toHaveBeenCalledTimes(1);
    expect(f.max()).toBe(1);
    // No token spent; the un-hedged success refills (clamped at capacity).
    expect(rpcHedgeBudget.available).toBeGreaterThanOrEqual(before);
  });

  it("survives a failing hedge — the primary still wins the attempt", async () => {
    const nodes = freshNodes(2); // single hedge candidate — deterministic
    config.nodes = nodes;
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 60, hedgeDelayFactor: 1 });
    await seedPrimaryProfile(nodes);

    routeFetch({
      [nodes[0]]: { kind: "ok", result: "primary", delayMs: 250 },
      [nodes[1]]: { kind: "http", status: 503 },
    });
    const res = await callRPC<string>(METHOD, [["ecency"]]);
    expect(res).toEqual("primary");
  });

  it("falls through to the outer failover when both legs fail", async () => {
    const nodes = freshNodes(3);
    config.nodes = nodes;
    Object.assign(config.resilience, {
      hedge: true,
      hedgeDelayFloorMs: 60,
      hedgeDelayFactor: 1,
      adaptiveTimeoutFloorMs: 2_000,
      adaptiveTimeoutFactor: 4,
    });
    config.timeout = 300;
    await seedPrimaryProfile(nodes);
    // Park the third node so the hedge pool is deterministically [nodes[1]];
    // the outer loop still reaches it as a last resort after both legs fail.
    rpcHealthTracker.recordRateLimit(nodes[2], 60_000);

    const f = routeFetch({
      [nodes[0]]: { kind: "hang" }, // primary: aborts at the caller window
      [nodes[1]]: { kind: "http", status: 503 }, // hedge: fails fast
      [nodes[2]]: { kind: "ok", result: "third" },
    });
    const res = await callRPC<string>(METHOD, [["ecency"]]);
    expect(res).toEqual("third");
    // Third node was reached on the NEXT outer attempt (both hedged legs tried).
    expect(new Set(f.hostsInOrder()).size).toBe(3);
  });

  it("propagates an authoritative RPCError from the hedge immediately", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 60, hedgeDelayFactor: 1 });
    await seedPrimaryProfile(nodes);

    routeFetch({
      [nodes[0]]: { kind: "hang" },
      [nodes[1]]: { kind: "rpc-error", code: -32602, message: "Missing Posting Authority for alice" },
    });
    const t0 = Date.now();
    await expect(callRPC(METHOD, [["ecency"]])).rejects.toBeInstanceOf(RPCError);
    // Rejected right after the hedge answered — did not wait out the primary.
    expect(Date.now() - t0).toBeLessThan(1_500);
  });

  it("external abort mid-race rejects and cancels both legs", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 60, hedgeDelayFactor: 1 });
    await seedPrimaryProfile(nodes);

    const f = routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "hang" } });
    const ac = new AbortController();
    const p = callRPC(METHOD, [["ecency"]], undefined, undefined, ac.signal);
    setTimeout(() => ac.abort(), 150); // after the hedge has fired
    const t0 = Date.now();
    await expect(p).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(f.max()).toBe(2); // hedge really was in flight when we aborted
  });

  it("never hedges when disabled (default) even with a stalling primary", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { adaptiveTimeoutFloorMs: 2_000, adaptiveTimeoutFactor: 4 });
    config.timeout = 250;
    expect(config.resilience.hedge).toBe(false); // default
    await seedPrimaryProfile(nodes);

    const f = routeFetch({ [nodes[0]]: { kind: "hang" }, [nodes[1]]: { kind: "ok", result: 1 } });
    await callRPC(METHOD, [["ecency"]]);
    expect(f.max()).toBe(1);
  });

  it("never hedges broadcasts, even with hedging enabled", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    config.broadcastTimeout = 250;
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 40, hedgeDelayFactor: 1 });
    await seedPrimaryProfile(nodes);

    const f = routeFetch({
      [nodes[0]]: { kind: "ok", result: { id: "deadbeef" }, delayMs: 150 },
    });
    const res = await callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}]);
    expect(res).toBeTruthy();
    // 150ms > 40ms hedge delay — a hedging broadcast would have shown 2 here.
    expect(f.max()).toBe(1);
    expect(f.spy).toHaveBeenCalledTimes(1);
    config.broadcastTimeout = 15_000;
  });
});

describe("response payload validation", () => {
  it("fails over to the next node when a well-formed response fails validation", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    const fetches = routeFetch({
      [new URL(nodes[0]).origin]: { kind: "ok", result: "lie" },
      [new URL(nodes[1]).origin]: { kind: "ok", result: "truth" },
    });

    const result = await callRPC(METHOD, [["ecency"]], undefined, undefined, undefined, (r) => r === "truth");

    expect(result).toBe("truth");
    expect(fetches.hostsInOrder()).toEqual([new URL(nodes[0]).origin, new URL(nodes[1]).origin]);
  });

  it("cools the lying node down for that API immediately (successes must not wash it out)", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    routeFetch({
      [new URL(nodes[0]).origin]: { kind: "ok", result: "lie" },
      [new URL(nodes[1]).origin]: { kind: "ok", result: "truth" },
    });

    // A single validation failure is a decisive fault: unvalidated calls to a
    // top-ranked lying node record successes that clear ordinary strikes, so
    // an accrual-based penalty would reset forever (observed live).
    await callRPC(METHOD, [["ecency"]], undefined, undefined, undefined, (r) => r === "truth");

    expect(rpcHealthTracker.isNodeHealthy(nodes[0], "condenser_api")).toBe(false);
    // The fault is API-scoped: the node stays available for other APIs.
    expect(rpcHealthTracker.isNodeHealthy(nodes[0], "bridge")).toBe(true);
    // And a later success on that API must not lift the active cooldown early.
    rpcHealthTracker.recordSuccess(nodes[0], "condenser_api");
    expect(rpcHealthTracker.isNodeHealthy(nodes[0], "condenser_api")).toBe(false);
  });

  it("throws the validation error when every node fails validation", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    config.retry = 1; // 2 attempts total — one per node, no wrap-around
    routeFetch({
      [new URL(nodes[0]).origin]: { kind: "ok", result: "lie" },
      [new URL(nodes[1]).origin]: { kind: "ok", result: "lie" },
    });

    await expect(
      callRPC(METHOD, [["ecency"]], undefined, undefined, undefined, () => false)
    ).rejects.toThrow(/response validation failed/);
  });

  it("does not interfere with calls that pass no validator", async () => {
    const nodes = freshNodes(1);
    config.nodes = nodes;
    routeFetch({ [new URL(nodes[0]).origin]: { kind: "ok", result: "anything" } });

    await expect(callRPC(METHOD, [["ecency"]])).resolves.toBe("anything");
  });
});

describe("HedgeBudget", () => {
  it("spends whole tokens and refills fractionally up to capacity", () => {
    const b = new HedgeBudget();
    b.reset(0);
    expect(b.trySpend()).toBe(false);
    for (let i = 0; i < 10; i++) b.refill(); // 10 × 0.1 = 1 token
    expect(b.available).toBeCloseTo(1, 5);
    expect(b.trySpend()).toBe(true);
    expect(b.trySpend()).toBe(false);
    b.reset();
    expect(b.available).toBe(config.resilience.hedgeBucketCapacity);
    b.refill();
    expect(b.available).toBe(config.resilience.hedgeBucketCapacity); // capped
  });
});

describe("NodeHealthTracker resilience hooks", () => {
  it("getUsableLatencyMs gates on samples and recordCensoredLatency feeds the EWMA", () => {
    const t = new NodeHealthTracker();
    const node = "https://unit.test";
    expect(t.getUsableLatencyMs(node)).toBeUndefined();
    t.recordSuccess(node, "condenser_api", 100);
    t.recordSuccess(node, "condenser_api", 100);
    expect(t.getUsableLatencyMs(node)).toBeUndefined(); // below MIN_SAMPLES
    t.recordSuccess(node, "condenser_api", 100);
    expect(t.getUsableLatencyMs(node)).toBeCloseTo(100, 0);
    t.recordCensoredLatency(node, 1_000);
    expect(t.getUsableLatencyMs(node)!).toBeGreaterThan(100);
    // Instant aborts are ignored (guards degenerate samples).
    const before = t.getUsableLatencyMs(node)!;
    t.recordCensoredLatency(node, 5);
    expect(t.getUsableLatencyMs(node)).toBe(before);
  });

  it("keeps per-method profiles separate — a cheap method never calibrates a heavy one", () => {
    const t = new NodeHealthTracker();
    const node = "https://unit-api.test";
    const cheap = "condenser_api.get_accounts";
    const heavy = "condenser_api.get_account_history";
    for (let i = 0; i < 3; i++) t.recordSuccess(node, "condenser_api", 100, cheap);
    // Global (ranking) profile is usable...
    expect(t.getUsableLatencyMs(node)).toBeCloseTo(100, 0);
    // ...and so is the profiled method...
    expect(t.getUsableLatencyMs(node, cheap)).toBeCloseTo(100, 0);
    // ...but a DIFFERENT method — even in the SAME api — has no profile:
    // no fallback to the global mix or the prefix average.
    expect(t.getUsableLatencyMs(node, heavy)).toBeUndefined();
    // The heavy method builds its own baseline.
    for (let i = 0; i < 3; i++) t.recordSuccess(node, "condenser_api", 3_000, heavy);
    expect(t.getUsableLatencyMs(node, heavy)).toBeCloseTo(3_000, 0);
    expect(t.getUsableLatencyMs(node, cheap)).toBeCloseTo(100, 0);
  });
});

describe("setResilience validation", () => {
  it("applies valid partial updates and ignores junk field-by-field", () => {
    setResilience({ hedge: true, hedgeDelayFloorMs: 500 });
    expect(config.resilience.hedge).toBe(true);
    expect(config.resilience.hedgeDelayFloorMs).toBe(500);

    setResilience({
      hedge: "yes" as any,
      hedgeDelayFloorMs: -5,
      adaptiveTimeoutFactor: NaN,
      adaptiveTimeoutFloorMs: 2_345,
    } as any);
    expect(config.resilience.hedge).toBe(true); // junk ignored
    expect(config.resilience.hedgeDelayFloorMs).toBe(500); // junk ignored
    expect(config.resilience.adaptiveTimeoutFloorMs).toBe(2_345); // valid applied

    setResilience(null as any); // must not throw
  });

  it("clamps unsafe values: refill ≤ 1, adaptive floor ≥ 2s, budget factor ≥ 1", () => {
    setResilience({ hedgeRefillPerSuccess: 5 });
    expect(config.resilience.hedgeRefillPerSuccess).toBe(1);
    // Below the slow-failure recording floor the EWMA could never self-correct.
    setResilience({ adaptiveTimeoutFloorMs: 800 });
    expect(config.resilience.adaptiveTimeoutFloorMs).toBe(2_000);
    setResilience({ totalBudgetFactor: 0.25 });
    expect(config.resilience.totalBudgetFactor).toBe(1);
  });
});

// Issue #2056: each hedge leg decides the method fallback for ITS node. An
// old hedge node answering `unknown method` switches to v1 on that node only,
// and the primary node is not marked.
describe("hedged reads with a per-node method fallback", () => {
  it("lets the hedge node fall back to v1 without marking the primary", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, {
      hedge: true,
      hedgeDelayFloorMs: 80,
      hedgeDelayFactor: 1,
      adaptiveTimeoutFloorMs: 2_000,
      adaptiveTimeoutFactor: 4,
    });
    const primary = { method: "bridge.get_post_v2", params: { author: "a", permlink: "b" } };
    const fallback = { method: "bridge.get_post", params: { author: "a", permlink: "b" } };

    // Profile the primary node for the v2 method so the hedge can fire.
    const seeded = routeFetch({ [nodes[0]]: { kind: "ok", result: { observer_vote: null } } });
    for (let i = 0; i < 3; i++) await callRPCWithFallback(primary, fallback);
    expect(rpcHealthTracker.getUsableLatencyMs(nodes[0], primary.method)).toBeDefined();
    seeded.spy.mockRestore();
    const before = rpcHedgeBudget.available;

    const seen: Array<{ host: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init: any) => {
      const host = new URL(String(input)).origin;
      const body = JSON.parse(String(init.body));
      seen.push({ host, method: body.method });
      if (host === nodes[0]) {
        // Stalled primary: settles only on abort.
        return new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          })
        );
      }
      const payload =
        body.method === "bridge.get_post_v2"
          ? { error: { code: -32602, message: "Assert Exception:unknown method: bridge_apiget_post_v2" } }
          : { result: { author: "a", active_votes: [] } };
      return Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...payload }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    const answer = await callRPCWithFallback(primary, fallback);

    expect(answer.method).toBe("bridge.get_post");
    expect(seen).toEqual([
      { host: nodes[0], method: "bridge.get_post_v2" },
      { host: nodes[1], method: "bridge.get_post_v2" },
      { host: nodes[1], method: "bridge.get_post" },
    ]);
    expect(__METHOD_FALLBACK__.lacksMethod(nodes[1], primary.method)).toBe(true);
    expect(__METHOD_FALLBACK__.lacksMethod(nodes[0], primary.method)).toBe(false);
    // One hedge, one token: the unknown-method answer spent nothing extra.
    expect(rpcHedgeBudget.available).toBeCloseTo(before - 1, 5);
    expect(rpcHealthTracker.isNodeHealthy(nodes[1], "bridge")).toBe(true);
  });
});

// Review 3: on a node without the v2 methods every read is answered by v1, so
// that is the profile the node builds. Hedging and the adaptive per-attempt
// timeout must read the profile of the method the node will actually be
// asked, or the four main reads never hedge on a v2-less node.
describe("hedge and adaptive timeout on a v2-less node", () => {
  const primary = { method: "bridge.get_post_v2", params: { author: "a", permlink: "b" } };
  const fallback = { method: "bridge.get_post", params: { author: "a", permlink: "b" } };

  function oldNodeFetch(stall: () => string | undefined) {
    return vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init: any) => {
      const host = new URL(String(input)).origin;
      const body = JSON.parse(String(init.body));
      if (body.method === "bridge.get_post_v2") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: "Assert Exception:unknown method: bridge_apiget_post_v2" } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (host === stall()) {
        return new Promise((_r, reject) =>
          init.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          })
        );
      }
      return Promise.resolve(jsonOk(body.id, { from: host }));
    });
  }

  async function seed(nodes: string[]) {
    __METHOD_FALLBACK__.reset();
    const spy = oldNodeFetch(() => undefined);
    for (let i = 0; i < 12; i++) await callRPCWithFallback(primary, fallback);
    expect(rpcHealthTracker.getUsableLatencyMs(nodes[0], "bridge.get_post")).toBeDefined();
    spy.mockRestore();
  }

  it("hedges the read", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { hedge: true, hedgeDelayFloorMs: 80, hedgeDelayFactor: 1, adaptiveTimeoutFloorMs: 3_000, adaptiveTimeoutFactor: 4 });
    await seed(nodes);
    oldNodeFetch(() => nodes[0]);
    const t0 = Date.now();
    const answer = await callRPCWithFallback(primary, fallback);
    expect(answer.result).toEqual({ from: nodes[1] });
    expect(Date.now() - t0).toBeLessThan(1_500);
  });

  it("shortens the attempt by the node's own profile", async () => {
    const nodes = freshNodes(2);
    config.nodes = nodes;
    Object.assign(config.resilience, { hedge: false, adaptiveTimeoutFloorMs: 150, adaptiveTimeoutFactor: 1 });
    await seed(nodes);
    oldNodeFetch(() => nodes[0]);
    const t0 = Date.now();
    const answer = await callRPCWithFallback(primary, fallback);
    expect(answer.result).toEqual({ from: nodes[1] });
    // The caller's ceiling (config.timeout, 5 s here) would end it at ~5 s.
    expect(Date.now() - t0).toBeLessThan(1_500);
  });
});
