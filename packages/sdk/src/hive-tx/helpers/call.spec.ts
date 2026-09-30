import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { callRPCBroadcast, callRPC, callREST, RPCError, NodeHealthTracker } from "./call";
import { config, setUserAgent } from "../config";

const ORIGINAL_NODES = [...config.nodes];
const ORIGINAL_TIMEOUT = config.broadcastTimeout;

beforeEach(() => {
  config.nodes = [
    "https://node-a.test",
    "https://node-b.test",
    "https://node-c.test",
  ];
  // Short timeout so the test is fast if something deadlocks.
  config.broadcastTimeout = 500;
});

afterEach(() => {
  config.nodes = ORIGINAL_NODES;
  config.broadcastTimeout = ORIGINAL_TIMEOUT;
  vi.restoreAllMocks();
});

function jsonOk(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonRpcError(id: number, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
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

describe("callRPCBroadcast — browser-style failover", () => {
  function spyFetch(
    steps: Array<"network-error" | "html-530" | "html-502" | "text-413" | "json-403" | "rpc-error-400" | "rpc-error" | "ok">
  ) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const id = readJsonRpcId(init);
      const step = steps.shift() ?? "ok";
      switch (step) {
        case "network-error":
          // Mimics browser fetch's TypeError when CORS blocks or DNS/TLS fails.
          throw new TypeError("Failed to fetch");
        case "html-530":
          return new Response("<html>cf 530 origin unreachable</html>", {
            status: 530,
            headers: { "Content-Type": "text/html" },
          });
        case "html-502":
          // CF tunnel error 1033 typically surfaces as a 502 or 530 with an
          // HTML interstitial body (no JSON-RPC envelope).
          return new Response("<html>error 1033 cloudflare tunnel</html>", {
            status: 502,
            headers: { "Content-Type": "text/html" },
          });
        case "text-413":
          return new Response("JSON payload is larger than allowed", {
            status: 413,
            headers: { "Content-Type": "text/plain" },
          });
        case "json-403":
          return new Response(JSON.stringify({ error: "forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        case "rpc-error-400":
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "Missing Posting Authority for alice" } }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        case "rpc-error":
          return jsonRpcError(id, -32602, "Missing Posting Authority for alice");
        case "ok":
        default:
          return jsonOk(id, { id: "deadbeef", block_num: 1, trx_num: 0, expired: false });
      }
    });
  }

  it("fails over from a browser TypeError to the next node", async () => {
    const fetchSpy = spyFetch(["network-error", "ok"]);
    const res = await callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}]);
    expect((res as any).id).toBe("deadbeef");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("node-a.test");
    expect(String(fetchSpy.mock.calls[1]![0])).toContain("node-b.test");
  });

  it("fails over from a Cloudflare HTML 530 to the next node", async () => {
    const fetchSpy = spyFetch(["html-530", "ok"]);
    const res = await callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}]);
    expect((res as any).block_num).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fails over from a Cloudflare HTML 502 (tunnel 1033) to the next node", async () => {
    const fetchSpy = spyFetch(["html-502", "ok"]);
    const res = await callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}]);
    expect((res as any).block_num).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fails over from a proxy's JSON 4xx that is not a JSON-RPC reply", async () => {
    const fetchSpy = spyFetch(["json-403", "ok"]);
    const res = await callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}]);
    expect((res as any).block_num).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("counts a proxy 4xx against the node as a whole, not as a per-API cooldown", async () => {
    const recordFailure = vi.spyOn(NodeHealthTracker.prototype, "recordFailure");
    spyFetch(["text-413", "ok"]);
    await callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}]);
    // One failure, recorded without an api (node-wide), for whichever node refused.
    expect(recordFailure.mock.calls).toEqual([[expect.stringMatching(/^https:\/\/node-[abc]\.test$/)]]);
  });

  it("treats a JSON-RPC error sent with a 4xx status as the chain's verdict", async () => {
    const fetchSpy = spyFetch(["rpc-error-400", "ok"]);
    await expect(
      callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}])
    ).rejects.toBeInstanceOf(RPCError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("tries each node once and reports the status when every node answers text 413", async () => {
    const fetchSpy = spyFetch(["text-413", "text-413", "text-413", "ok"]);
    await expect(
      callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}])
    ).rejects.toThrow(/HTTP 413/);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("does NOT fail over on a blockchain RPCError (real rejection)", async () => {
    const fetchSpy = spyFetch(["rpc-error", "ok"]);
    await expect(
      callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}])
    ).rejects.toBeInstanceOf(RPCError);
    // The second node must never see this tx.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("traverses all nodes once when every node fails with network errors", async () => {
    const fetchSpy = spyFetch(["network-error", "network-error", "network-error"]);
    await expect(
      callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}])
    ).rejects.toBeTruthy();
    // Tried each node exactly once — no wrap-around for broadcasts.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  // First call fails with `firstError`, every later one succeeds.
  const failFirstThenOk = (firstError: () => Error) => {
    let first = true;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      if (first) {
        first = false;
        throw firstError();
      }
      return jsonOk(readJsonRpcId(init), {});
    });
  };
  const named = (name: string, message: string) => () => Object.assign(new Error(message), { name });
  const until = (ms: number) => ({ failoverOnTimeoutUntil: Date.now() + ms });

  it("fails over on a timeout while the caller's failover window is open", async () => {
    for (const shape of [named("TimeoutError", "aborted due to timeout"), named("AbortError", "The operation was aborted")]) {
      const fetchSpy = failFirstThenOk(shape);
      await expect(
        callRPCBroadcast("condenser_api.broadcast_transaction", [{}], undefined, undefined, until(60_000))
      ).resolves.toEqual({});
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      fetchSpy.mockRestore();
    }
  });

  it("does not fail over on a timeout once the window has closed, or without one", async () => {
    let fetchSpy = failFirstThenOk(named("TimeoutError", "aborted due to timeout"));
    await expect(
      callRPCBroadcast("condenser_api.broadcast_transaction", [{}], undefined, undefined, until(-1))
    ).rejects.toThrow(/timeout/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();

    fetchSpy = failFirstThenOk(named("TimeoutError", "aborted due to timeout"));
    await expect(callRPCBroadcast("condenser_api.broadcast_transaction", [{}])).rejects.toThrow(/timeout/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still throws other ambiguous errors at once inside the window", async () => {
    const fetchSpy = failFirstThenOk(named("Error", "weird"));
    await expect(
      callRPCBroadcast("condenser_api.broadcast_transaction", [{}], undefined, undefined, until(60_000))
    ).rejects.toThrow("weird");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // Timeouts are the genuinely ambiguous case: the node may have received the
  // tx and started processing it. Failing over a timed-out broadcast risks a
  // second node accepting the dup and surfacing an RPCError that masks the
  // original success. So by default timeouts do NOT fail over; only a caller
  // that takes the duplicate answer as success opts in (Transaction.broadcast).
  it("does NOT fail over on an AbortError/TimeoutError (broadcast may have been processed)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const err = new Error("The operation was aborted") as Error & { name: string };
      err.name = "AbortError";
      throw err;
    });
    await expect(
      callRPCBroadcast("condenser_api.broadcast_transaction_synchronous", [{}])
    ).rejects.toThrow(/aborted/i);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("server-side User-Agent identity", () => {
  // Vitest runs the package specs under Node, so isNodeRuntime is true here and
  // the configured User-Agent must be attached to every outgoing request.
  const ORIGINAL_REST = [...config.restNodes];
  const ORIGINAL_UA = config.userAgent;

  afterEach(() => {
    config.restNodes = ORIGINAL_REST;
    config.userAgent = ORIGINAL_UA;
  });

  function headersOf(init: any): Record<string, string> {
    return (init?.headers ?? {}) as Record<string, string>;
  }

  it("attaches the configured User-Agent on JSON-RPC (callRPC) requests", async () => {
    config.userAgent = "ecency-sdk-test/1.2.3";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input: any, init: any) =>
        jsonOk(readJsonRpcId(init), { ok: true })
      );
    await callRPC("condenser_api.get_dynamic_global_properties", []);
    const headers = headersOf(fetchSpy.mock.calls[0]![1]);
    expect(headers["User-Agent"]).toBe("ecency-sdk-test/1.2.3");
    // The JSON-RPC content type must survive the header merge.
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("attaches the configured User-Agent on REST (callREST) requests", async () => {
    config.restNodes = ["https://rest-a.test"];
    config.userAgent = "ecency-sdk-test/9.9.9";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    await callREST("status", "/status");
    expect(headersOf(fetchSpy.mock.calls[0]![1])["User-Agent"]).toBe("ecency-sdk-test/9.9.9");
  });

  it("setUserAgent trims input and ignores blank/invalid values", () => {
    setUserAgent("  custom-ua/1.0  ");
    expect(config.userAgent).toBe("custom-ua/1.0");
    setUserAgent("   ");
    expect(config.userAgent).toBe("custom-ua/1.0"); // unchanged by blank input
    // CRLF / control characters are rejected (header-injection guard) so the
    // previous valid value is kept rather than storing a header that would make
    // every subsequent fetch throw.
    setUserAgent("evil/1.0\r\nX-Injected: 1");
    expect(config.userAgent).toBe("custom-ua/1.0");
    // Non-string input from plain-JS callers is ignored, not thrown on.
    setUserAgent(undefined as unknown as string);
    expect(config.userAgent).toBe("custom-ua/1.0");
  });
});

describe("NodeHealthTracker — 429 rate-limit backoff", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("honors an explicit Retry-After (ms) exactly", () => {
    vi.setSystemTime(0);
    const t = new NodeHealthTracker();
    t.recordRateLimit("https://n.test", 5_000);
    vi.setSystemTime(4_999);
    expect(t.isNodeHealthy("https://n.test")).toBe(false);
    vi.setSystemTime(5_001);
    expect(t.isNodeHealthy("https://n.test")).toBe(true);
  });

  it("uses the base 10s cooldown for a first header-less 429", () => {
    vi.setSystemTime(0);
    const t = new NodeHealthTracker();
    t.recordRateLimit("https://n.test");
    vi.setSystemTime(9_999);
    expect(t.isNodeHealthy("https://n.test")).toBe(false);
    vi.setSystemTime(10_001);
    expect(t.isNodeHealthy("https://n.test")).toBe(true);
  });

  it("escalates on consecutive header-less 429s so the cooldown outlasts the 30s failure gate", () => {
    vi.setSystemTime(0);
    const t = new NodeHealthTracker();
    t.recordRateLimit("https://n.test"); // streak 0 → +10s
    t.recordRateLimit("https://n.test"); // streak 1 → +20s
    t.recordRateLimit("https://n.test"); // streak 2 → +40s (until 40_000)
    // consecutiveFailures=3 → failure gate parks it only until 30_000; the escalated
    // 40s rate-limit window must keep it parked past that.
    vi.setSystemTime(30_001);
    expect(t.isNodeHealthy("https://n.test")).toBe(false);
    vi.setSystemTime(40_001);
    expect(t.isNodeHealthy("https://n.test")).toBe(true);
  });

  it("caps the escalated cooldown at 60s (not unbounded doubling)", () => {
    vi.setSystemTime(0);
    const t = new NodeHealthTracker();
    // streak 0..5 would be 10,20,40,80,160,320s; all capped at 60s.
    for (let i = 0; i < 6; i++) t.recordRateLimit("https://n.test");
    vi.setSystemTime(59_999);
    expect(t.isNodeHealthy("https://n.test")).toBe(false);
    vi.setSystemTime(60_001);
    expect(t.isNodeHealthy("https://n.test")).toBe(true);
  });

  it("resets the escalation streak on success without erasing an active window", () => {
    vi.setSystemTime(0);
    const t = new NodeHealthTracker();
    t.recordRateLimit("https://n.test"); // streak 0 → +10s
    t.recordRateLimit("https://n.test"); // streak 1 → +20s, until 20_000
    // A success must NOT lift the active window — a concurrent success from an
    // in-flight request could otherwise un-bench a just-throttled node. It stays parked.
    t.recordSuccess("https://n.test");
    expect(t.isNodeHealthy("https://n.test")).toBe(false);
    vi.setSystemTime(20_001); // window expires on its own
    expect(t.isNodeHealthy("https://n.test")).toBe(true);
    // But the streak WAS reset, so the next header-less 429 starts at base 10s, not 40s.
    t.recordRateLimit("https://n.test"); // at 20_001 → +10s → until 30_001
    vi.setSystemTime(30_002);
    expect(t.isNodeHealthy("https://n.test")).toBe(true);
  });

  it("does not let explicit-Retry-After 429s inflate the header-less escalation", () => {
    vi.setSystemTime(0);
    const t = new NodeHealthTracker();
    // A 429 WITH Retry-After is honored exactly and must NOT advance the streak.
    t.recordRateLimit("https://n.test", 5_000);
    // So the next header-less 429 starts at base 10s, not the escalated 20s.
    t.recordRateLimit("https://n.test"); // until 10_000 if base; until 20_000 if wrongly escalated
    vi.setSystemTime(9_999);
    expect(t.isNodeHealthy("https://n.test")).toBe(false);
    vi.setSystemTime(10_001);
    expect(t.isNodeHealthy("https://n.test")).toBe(true);
  });

  it("a header-less 429 never shortens a longer explicit Retry-After window already set", () => {
    vi.setSystemTime(0);
    const t = new NodeHealthTracker();
    t.recordRateLimit("https://n.test", 3_600_000); // explicit 1h window
    vi.setSystemTime(1_000);
    // A last-resort retry gets a header-less 429 (base 10s). It must NOT truncate the 1h.
    t.recordRateLimit("https://n.test");
    vi.setSystemTime(60_000);
    expect(t.isNodeHealthy("https://n.test")).toBe(false); // still parked by the 1h window
  });

  it("expires the escalation streak after a long quiet gap", () => {
    vi.setSystemTime(0);
    const t = new NodeHealthTracker();
    // One 429 → streak 1 (a 2nd, prompt 429 would be escalated to 20s). Two total
    // keeps consecutiveFailures at 2 so the separate 30s failure gate stays out of it.
    t.recordRateLimit("https://n.test");
    // No 429 for > RATE_LIMIT_STREAK_RESET_MS (120s) → the streak expires.
    vi.setSystemTime(200_000);
    t.recordRateLimit("https://n.test"); // streak expired → base 10s → until 210_000 (not 20s)
    vi.setSystemTime(210_001);
    expect(t.isNodeHealthy("https://n.test")).toBe(true);
  });
});
