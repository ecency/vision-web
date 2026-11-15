import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NodeHealthTracker,
  callRPC,
  callREST,
  callWithQuorum,
  callRPCWithFallback,
  rpcHealthTracker,
  restHealthTracker,
  __LATENCY_TUNING__,
} from "./call";
import { config } from "../config";

// Tuning values are imported from the implementation (not re-declared here) so the
// assertions can never silently drift out of sync with call.ts.
const { MIN_SAMPLES, REPROBE_MS, MAX_AGE_MS, SLOW_FAILURE_MS } = __LATENCY_TUNING__;

const D = "https://api.syncad.com"; // a 4th public node
const A = "https://api.hive.blog";
const B = "https://api.deathwing.me";
const C = "https://api.openhive.network";

// Deterministic clock: every Date.now() in the tracker + call sites reads this var.
let now: number;
const advance = (ms: number) => {
  now += ms;
};

beforeEach(() => {
  now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Profile a node with `n` successful samples of `ms`. n>=MIN_SAMPLES ⇒ proven.
 *  Any n>=1 also makes the node recently-sampled, so the orthogonal re-probe
 *  exploration won't perturb a steady-state ordering assertion. */
function warm(t: NodeHealthTracker, node: string, ms: number, n: number = MIN_SAMPLES) {
  for (let i = 0; i < n; i++) t.recordSuccess(node, undefined, ms);
}

describe("NodeHealthTracker — adaptive latency ordering", () => {
  it("cold start: no latency data ⇒ config order preserved (today's behavior)", () => {
    const t = new NodeHealthTracker();
    expect(t.getOrderedNodes([D, A, B])).toEqual([D, A, B]);
  });

  it("cold start: REPEATED orderings inside the first re-probe window stay in config order", () => {
    // Regression guard. Fresh nodes used to be created with lastProbeAt=0, so the
    // re-probe gate (touch <= now - REPROBE_MS) fired immediately and the 2nd ordering
    // on a cold worker promoted an unproven, lower-priority node ahead of the
    // configured order — with no latency reason. A cold worker must keep serving the
    // configured order until a real latency signal OR a genuinely elapsed re-probe
    // window justifies reordering.
    const t = new NodeHealthTracker();
    for (let i = 0; i < 5; i++) {
      advance(10_000); // 5 × 10s = 50s, still within one LATENCY_REPROBE_MS window
      expect(t.getOrderedNodes([D, A, B])).toEqual([D, A, B]);
    }
  });

  it("profiled nodes sort fastest-first", () => {
    const t = new NodeHealthTracker();
    warm(t, A, 850);
    warm(t, B, 300);
    warm(t, C, 1200);
    expect(t.getOrderedNodes([A, B, C])).toEqual([B, A, C]);
  });

  it("a proven-slow node is ranked behind even warming peers (absolute score)", () => {
    const t = new NodeHealthTracker();
    warm(t, D, 8000); // only proven node, and it's slow
    warm(t, A, 100, 1); // warming (1 sample) ⇒ unproven prior, but recently sampled
    warm(t, B, 100, 1);
    const order = t.getOrderedNodes([D, A, B]);
    expect(order[order.length - 1]).toBe(D);
  });

  it("warming node does NOT jump a proven-fast node (no churn)", () => {
    const t = new NodeHealthTracker();
    warm(t, D, 300); // proven fast
    warm(t, A, 100, 2); // 2 samples (< MIN_SAMPLES) ⇒ still warming
    warm(t, B, 100, 1);
    expect(t.getOrderedNodes([D, A, B])[0]).toBe(D);
  });

  it("an INSTANT failure is not mis-read as 'slow' (down node ≠ slow node)", () => {
    const t = new NodeHealthTracker();
    t.recordSlowFailure(A, 50); // below the slow floor ⇒ no latency sample
    expect((t as any).health.get(A)?.ewmaLatencyMs).toBeUndefined();
  });

  it("slow failures (timeouts/slow-5xx) demote a 200-but-too-slow node", () => {
    const t = new NodeHealthTracker();
    warm(t, A, 850);
    warm(t, B, 900);
    for (let i = 0; i < MIN_SAMPLES; i++) t.recordSlowFailure(D, 5000);
    expect(t.getOrderedNodes([D, A, B]).pop()).toBe(D);
  });

  describe("recovery / re-probe (the starvation-trap fix)", () => {
    /** Set up: A,B fast+proven, D demoted by timeouts, and D made strictly the
     *  stalest (overdue for a re-probe) while A,B stay fresh. */
    function demotedDOverdue(t: NodeHealthTracker) {
      for (let i = 0; i < MIN_SAMPLES; i++) t.recordSlowFailure(D, 5000); // D @ t0
      advance(1);
      warm(t, A, 850); // A,B sampled @ t0+1 (fresher than D)
      warm(t, B, 900);
      advance(REPROBE_MS); // D now REPROBE+1 stale (strictly stalest)
    }

    it("a demoted node overdue for sampling is promoted to front for ONE pass", () => {
      const t = new NodeHealthTracker();
      demotedDOverdue(t);
      expect(t.getOrderedNodes([D, A, B])[0]).toBe(D);
    });

    it("single-flight: the immediate next pass does NOT re-promote the same node", () => {
      const t = new NodeHealthTracker();
      demotedDOverdue(t);
      expect(t.getOrderedNodes([D, A, B])[0]).toBe(D); // promotes the demoted node, stamps lastProbeAt
      const second = t.getOrderedNodes([D, A, B]);
      expect(second[0]).toBe(A); // not re-promoted
      expect(second.pop()).toBe(D); // still demoted by latency
    });

    it("a demoted node that recovers climbs back to the front", () => {
      const t = new NodeHealthTracker();
      demotedDOverdue(t);
      // re-probes over time now return fast (CF path recovered) ⇒ EWMA decays toward fast
      for (let i = 0; i < 8; i++) {
        advance(REPROBE_MS + 1);
        warm(t, A, 850, 1); // keep peers fresh + proven
        warm(t, B, 900, 1);
        t.recordSuccess(D, undefined, 250); // the probe call comes back fast now
      }
      expect(t.getOrderedNodes([D, A, B])[0]).toBe(D);
    });
  });

  it("stale latency (> MAX_AGE) reverts a node to warming on next sample", () => {
    const t = new NodeHealthTracker();
    warm(t, A, 100);
    expect((t as any).health.get(A)?.latencySampleCount).toBe(MIN_SAMPLES);
    advance(MAX_AGE_MS + 1);
    t.recordSuccess(A, undefined, 100); // stale ⇒ profile reset, this is sample #1
    expect((t as any).health.get(A)?.latencySampleCount).toBe(1);
  });

  it("rate-limit: node drops to the tail, EWMA preserved, recovers after cooldown", () => {
    const t = new NodeHealthTracker();
    warm(t, D, 300);
    warm(t, A, 800);
    t.recordRateLimit(D, 10_000);
    const ordered = t.getOrderedNodes([D, A]);
    expect(ordered[ordered.length - 1]).toBe(D); // rate-limited ⇒ unhealthy tail
    expect((t as any).health.get(D)?.ewmaLatencyMs).toBe(300); // EWMA untouched
    advance(10_001);
    expect(t.getOrderedNodes([D, A])[0]).toBe(D); // back on preserved fast EWMA
  });

  it("staleness (head-block lag) still wins over low latency", () => {
    const t = new NodeHealthTracker();
    warm(t, D, 100); // fastest
    warm(t, A, 800);
    warm(t, B, 800, 1);
    t.recordHeadBlock(A, 1000);
    t.recordHeadBlock(B, 1000);
    t.recordHeadBlock(D, 900); // 100 behind > STALE_BLOCK_THRESHOLD(30)
    expect(t.getOrderedNodes([D, A, B]).pop()).toBe(D);
  });

  it("capability: ranks only within the per-API node set handed to it", () => {
    const t = new NodeHealthTracker();
    warm(t, A, 900);
    warm(t, C, 300);
    const order = t.getOrderedNodes([A, C], "hivesense");
    expect(order).toEqual([C, A]);
    expect(order).not.toContain(B);
  });

  it("per-API failures deprioritize a node for THAT api only, not globally", () => {
    const t = new NodeHealthTracker();
    warm(t, A, 300); // fast for everything
    warm(t, B, 800);
    // A repeatedly fails the 'hivesense' plugin ⇒ per-API cooldown (not a global fail)
    t.recordFailure(A, "hivesense");
    t.recordFailure(A, "hivesense");
    // for hivesense: A is in cooldown ⇒ unhealthy tail, B serves despite being slower
    const hs = t.getOrderedNodes([A, B], "hivesense");
    expect(hs[0]).toBe(B);
    expect(hs[hs.length - 1]).toBe(A);
    // for a different api: A is still healthy and ranks first on its fast latency
    expect(t.getOrderedNodes([A, B], "condenser_api")[0]).toBe(A);
  });
});

// ── Real-path integration: prove the CALL SITES feed latency (end-to-end) ────
describe("call sites feed the tracker — adaptive behavior end to end", () => {
  const ORIG_NODES = [...config.nodes];
  const ORIG_REST = [...config.restNodes];
  const ORIG_RETRY = config.retry;

  afterEach(() => {
    config.nodes = [...ORIG_NODES];
    config.restNodes = [...ORIG_REST];
    config.retry = ORIG_RETRY;
  });

  function jsonOk(init: any, result: unknown): Response {
    const id = init?.body ? JSON.parse(String(init.body)).id : 0;
    return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("callRPC: a slow node gets demoted so later calls prefer the fast node", async () => {
    const SLOW = "https://rpc-slow.test"; // config-first, but slow
    const FAST = "https://rpc-fast.test";
    config.nodes = [SLOW, FAST];
    config.retry = 3;
    const hits: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init: any) => {
      const url = String(u);
      hits.push(url.includes("slow") ? "slow" : "fast");
      advance(url.includes("slow") ? 4000 : 80); // slow node: 4s round-trip
      return jsonOk(init, { ok: true });
    });
    // drive enough calls for the ranker to profile both and flip preference
    for (let i = 0; i < 10; i++) {
      await callRPC("condenser_api.get_dynamic_global_properties", []);
    }
    const firstHalf = hits.slice(0, 5).filter((h) => h === "fast").length;
    const lastHalf = hits.slice(-5).filter((h) => h === "fast").length;
    // both nodes were exercised (fast got sampled via exploration/failover)…
    expect(hits).toContain("fast");
    // …and by the end the fast node is preferred over the slow config-first node.
    expect(lastHalf).toBeGreaterThan(firstHalf);
  });

  it("callRPC: a config-first node that FAST-fails (HTTP 530 down node) is demoted, reads still served", async () => {
    // Distinct from the slow-node case above: a Cloudflare 530 (error 1033 tunnel /
    // node in maintenance) returns in ~80ms. recordSlowFailure ignores such instant
    // failures, so the demotion must come from the hard-fault path (NodeError →
    // recordError → recordFailure). Unique hosts so the file-wide rpcHealthTracker
    // singleton can be asserted without another test's profile bleeding in.
    const DOWN = "https://rpc-530.test"; // config-first, fast 530
    const UP = "https://rpc-live.test";
    config.nodes = [DOWN, UP];
    config.retry = 3;
    const hits: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any, init: any) => {
      const url = String(u);
      const down = url.includes("rpc-530");
      hits.push(down ? "down" : "up");
      advance(down ? 80 : 100); // both fast — the 530 is NOT a slow failure
      if (down) {
        return new Response("error code: 1033", {
          status: 530,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return jsonOk(init, { ok: true });
    });

    for (let i = 0; i < 8; i++) {
      await callRPC("condenser_api.get_dynamic_global_properties", []);
    }

    // failover keeps every read served despite the down config-first node
    expect(hits.filter((h) => h === "up").length).toBe(8);
    // the ranker tails the down node and fronts the live one
    const order = rpcHealthTracker.getOrderedNodes([DOWN, UP]);
    expect(order[0]).toBe(UP);
    expect(order[order.length - 1]).toBe(DOWN);
    // and the down node stops being hit once demoted (not just re-tried every call)
    const firstHalfDown = hits.slice(0, 4).filter((h) => h === "down").length;
    const lastHalfDown = hits.slice(-4).filter((h) => h === "down").length;
    expect(lastHalfDown).toBeLessThan(firstHalfDown);
  });

  it("callREST: a slow-failing node is demoted (the M1b REST penalty path runs)", async () => {
    const SLOWFAIL = "https://rest-slowfail.test"; // config-first, slow 5xx
    const OK = "https://rest-ok.test";
    config.restNodes = [SLOWFAIL, OK];
    config.retry = 3;
    const hits: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u: any) => {
      const url = String(u);
      hits.push(url.includes("slowfail") ? "slowfail" : "ok");
      if (url.includes("slowfail")) {
        advance(SLOW_FAILURE_MS + 500); // slow before the 5xx (CF interstitial style)
        return new Response("<html>530</html>", { status: 530 });
      }
      advance(120);
      return new Response(JSON.stringify({ balance: "1.000 HIVE" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    let res: any;
    for (let i = 0; i < 8; i++) {
      res = await callREST("balance", "/accounts/{a}/balances", { a: "alice" });
    }
    expect(res).toEqual({ balance: "1.000 HIVE" }); // always served (failover)
    const firstHalf = hits.slice(0, 6).filter((h) => h === "ok").length;
    const lastHalf = hits.slice(-6).filter((h) => h === "ok").length;
    expect(lastHalf).toBeGreaterThan(firstHalf); // ok node preferred once slowfail demoted
  });

  it("callREST: an EXTERNAL abort records NO failure or latency penalty", async () => {
    // Regression guard. callRPC bails before recording when the *caller's* signal is
    // aborted; callREST did not — so a React-Query unmount/navigation that cancelled an
    // in-flight REST call booked a failure + slow-latency sample against a perfectly
    // healthy node (e.g. a node still in restNodes) and could spuriously demote it.
    // Asserted directly on the live tracker because failover spreads the (wrongful)
    // penalty across every node it reaches, so node *ordering* alone can't see it.
    // Unique host: restHealthTracker is a file-wide singleton, so another test's host
    // would carry over its profile.
    const N1 = "https://rest-keep.test";
    config.restNodes = [N1];
    config.retry = 2;
    let currentAbort: AbortController | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      advance(SLOW_FAILURE_MS + 500); // elapsed long enough to be a real slow penalty IF recorded
      currentAbort?.abort(); // caller cancels the in-flight request
      const err: any = new Error("The operation was aborted.");
      err.name = "AbortError";
      throw err;
    });

    // Several in-flight cancellations (signal is callREST's 6th arg).
    for (let i = 0; i < 3; i++) {
      currentAbort = new AbortController();
      await expect(
        callREST(
          "balance",
          "/accounts/{a}/balances",
          { a: "alice" },
          undefined,
          undefined,
          currentAbort.signal
        )
      ).rejects.toBeTruthy();
    }

    // The node was contacted (entry exists) but the aborts left it completely clean.
    const h: any = (restHealthTracker as any).health.get(N1);
    expect(h?.latencySampleCount ?? 0).toBe(0); // no latency sample recorded
    expect(h?.ewmaLatencyMs).toBeUndefined(); // no EWMA penalty
    expect(h?.apiFailures?.get?.("balance")).toBeUndefined(); // no per-API failure
    expect(h?.consecutiveFailures ?? 0).toBe(0); // no global failure
  });

  it("callWithQuorum still reaches consensus (jsonRPCCall return shape intact)", async () => {
    config.nodes = ["https://q-a.test", "https://q-b.test", "https://q-c.test"];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u: any, init: any) =>
      jsonOk(init, { head_block_number: 42 })
    );
    const result = await callWithQuorum<{ head_block_number: number }>(
      "condenser_api.get_dynamic_global_properties",
      [],
      2
    );
    // would be {result,durationMs} (and quorum could never match) if we'd changed
    // jsonRPCCall's return shape; consensus proves it's still the raw result.
    expect(result).toEqual({ head_block_number: 42 });
  });

  // #2002: the caller learns which node answered, so a double-check can leave
  // a lagging node out. The result is unchanged.
  it("callRPCWithFallback tells onAnswer which node produced the result", async () => {
    config.nodes = ["https://q-down.test", "https://q-up.test"];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) =>
      String(url).includes("q-down") ? new Response("down", { status: 503 }) : jsonOk(init, null)
    );
    const nodes: string[] = [];
    const answer = await callRPCWithFallback(
      { method: "bridge.get_post_v2", params: { author: "a", permlink: "p" } },
      { method: "bridge.get_post", params: { author: "a", permlink: "p" } },
      { onAnswer: (n) => nodes.push(n) }
    );
    expect(answer).toEqual({ result: null, method: "bridge.get_post_v2" });
    expect(nodes).toEqual(["https://q-up.test"]);
  });

  // #2002: the observer reports each node's outcome and changes nothing else.
  it("callWithQuorum tells an observer what each node answered or threw, same outcome", async () => {
    config.nodes = ["https://q-a.test", "https://q-b.test"];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) =>
      String(url).includes("q-a")
        ? new Response("down", { status: 503 })
        : jsonOk(init, null)
    );
    const outcomes: Array<{ node: string; result?: unknown; error?: unknown }> = [];
    await expect(
      callWithQuorum("bridge.get_post", { author: "a", permlink: "p" }, 1, undefined, (o) =>
        outcomes.push(o)
      )
    ).rejects.toThrow("No more nodes available.");
    // Without an observer: the very same rejection.
    await expect(
      callWithQuorum("bridge.get_post", { author: "a", permlink: "p" }, 1)
    ).rejects.toThrow("No more nodes available.");

    const byNode = Object.fromEntries(outcomes.map((o) => [o.node, o]));
    expect(byNode["https://q-b.test"]).toEqual({ node: "https://q-b.test", result: null });
    expect(String(byNode["https://q-a.test"].error)).toContain("HTTP 503");
  });
});
