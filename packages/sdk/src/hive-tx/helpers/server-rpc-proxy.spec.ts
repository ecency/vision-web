import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRPC, callRPCWithFallback, resetRpcProxyBreaker, rpcHealthTracker, rpcProxyStats, __METHOD_FALLBACK__ } from "./call";
import { config, serverRpcProxy, setServerRpcProxy, DEFAULT_SERVER_RPC_PROXY_METHODS } from "../config";
import { ConfigManager } from "../../modules/core/config";

const ORIGINAL_NODES = [...config.nodes];
const PROXY = "http://proxy.internal:4000/private-api/ssr/rpc";

function jsonOk(result: unknown, status = 200): Response {
  return new Response(JSON.stringify(result), { status, headers: { "Content-Type": "application/json" } });
}
function rpcOk(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const mockFetch = (impl: FetchImpl) => vi.spyOn(globalThis, "fetch").mockImplementation(impl as typeof fetch);
const bodyOf = (init?: RequestInit): Record<string, unknown> => JSON.parse(String(init?.body)) as Record<string, unknown>;
function idOf(init?: RequestInit): number {
  try {
    const id = bodyOf(init).id;
    return typeof id === "number" ? id : 0;
  } catch {
    return 0;
  }
}
function resetStats(): void {
  rpcProxyStats.served = 0;
  rpcProxyStats.fallback = 0;
  rpcProxyStats.skipped = 0;
  rpcProxyStats.parkedOut = 0;
  for (const k of Object.keys(rpcProxyStats.fallbackByReason)) rpcProxyStats.fallbackByReason[k] = 0;
  resetRpcProxyBreaker();
}

beforeEach(() => {
  config.nodes = ["https://node-a.test", "https://node-b.test"];
  resetStats();
  setServerRpcProxy({ url: PROXY, headers: { "X-Ecency-Internal": "s3cret" }, timeoutMs: 500, methods: [...DEFAULT_SERVER_RPC_PROXY_METHODS] });
});

afterEach(() => {
  setServerRpcProxy(null);
  config.nodes = ORIGINAL_NODES;
  vi.restoreAllMocks();
});

describe("server-side RPC proxy", () => {
  it("answers an allowlisted read from the proxy and never touches a node", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
    mockFetch(async (input, init) => {
      calls.push({ url: String(input), body: bodyOf(init), headers: init?.headers as Record<string, string> });
      return jsonOk({ author: "a", permlink: "b" });
    });
    const post = await callRPC("bridge.get_post", { author: "a", permlink: "b" });
    expect(post).toEqual({ author: "a", permlink: "b" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(PROXY);
    expect(calls[0].body).toEqual({ api: "bridge", method: "get_post", params: { author: "a", permlink: "b" } });
    expect(calls[0].headers["X-Ecency-Internal"]).toBe("s3cret");
    expect(rpcProxyStats.served).toBe(1);
    expect(rpcProxyStats.fallback).toBe(0);
  });

  it("sends condenser params as the array the caller passed", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    mockFetch(async (_input, init) => {
      bodies.push(bodyOf(init));
      return jsonOk([{ name: "alice" }]);
    });
    await callRPC("condenser_api.get_accounts", [["alice"]]);
    expect(bodies[0]).toEqual({ api: "condenser_api", method: "get_accounts", params: [["alice"]] });
  });

  it("goes straight to the nodes for a method outside the allowlist", async () => {
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      return rpcOk(idOf(init), { ok: true });
    });
    await callRPC("condenser_api.get_block", [1]);
    expect(urls).toEqual(["https://node-a.test"]);
    expect(rpcProxyStats.served).toBe(0);
    expect(rpcProxyStats.fallback).toBe(0);
  });

  for (const [label, answer, reason] of [
    ["a non-200 answer", () => jsonOk({ error: "Upstream Timeout" }, 504), "status"],
    ["a transport error", () => { throw new TypeError("fetch failed"); }, "transport"],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 }), "parse"]
  ] as const) {
    it(`falls back to the node pool on ${label} and the result is what the node said`, async () => {
      const urls: string[] = [];
      mockFetch(async (input, init) => {
        urls.push(String(input));
        if (String(input) === PROXY) return answer();
        return rpcOk(idOf(init), { from: "node" });
      });
      const out = await callRPC("bridge.get_post", { author: "a", permlink: "b" });
      expect(out).toEqual({ from: "node" });
      expect(urls[0]).toBe(PROXY);
      expect(urls[1]).toBe("https://node-a.test");
      expect(rpcProxyStats.fallback).toBe(1);
      expect(rpcProxyStats.fallbackByReason[reason]).toBe(1);
    });
  }

  it("falls back when the proxy exceeds its timeout", async () => {
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      return rpcOk(idOf(init), { from: "node" });
    });
    const out = await callRPC("bridge.get_post", { author: "a", permlink: "b" });
    expect(out).toEqual({ from: "node" });
    expect(rpcProxyStats.fallbackByReason.timeout).toBe(1);
  });

  it("does not spend the node loop's failover budget on the proxy wait", async () => {
    // Proxy: 250ms then timeout. Caller timeout 100ms => node budget 200ms.
    // Without the fix the proxy wait would exhaust that budget and the second
    // node would never be tried after the first one fails.
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 250 });
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }
      if (String(input) === "https://node-a.test") return new Response("down", { status: 503 });
      return rpcOk(idOf(init), { from: "node-b" });
    });
    const out = await callRPC("bridge.get_post", { author: "a", permlink: "b" }, 100);
    expect(out).toEqual({ from: "node-b" });
    expect(urls).toEqual([PROXY, "https://node-a.test", "https://node-b.test"]);
    expect(rpcProxyStats.fallbackByReason.timeout).toBe(1);
  });

  it("never waits longer for the proxy than the caller's own timeout", async () => {
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 5000 });
    let proxyAbortedAt = 0;
    const started = Date.now();
    mockFetch(async (input, init) => {
      if (String(input) === PROXY) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            proxyAbortedAt = Date.now();
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }
      return rpcOk(idOf(init), { from: "node" });
    });
    const out = await callRPC("bridge.get_post", { author: "a", permlink: "b" }, 120);
    expect(out).toEqual({ from: "node" });
    expect(proxyAbortedAt - started).toBeLessThan(1000);
  });

  it("survives the proxy being switched off while a call is in flight", async () => {
    mockFetch(async (input, init) => {
      if (String(input) === PROXY) {
        setServerRpcProxy(null);
        return jsonOk({ error: "gone" }, 503);
      }
      return rpcOk(idOf(init), { from: "node" });
    });
    const out = await callRPC("bridge.get_post", { author: "a", permlink: "b" });
    expect(out).toEqual({ from: "node" });
  });

  it("releases a non-200 proxy body", async () => {
    let cancelled = false;
    mockFetch(async (input, init) => {
      if (String(input) === PROXY) {
        const body = new ReadableStream({ cancel: () => { cancelled = true; } });
        return new Response(body, { status: 504 });
      }
      return rpcOk(idOf(init), { from: "node" });
    });
    await callRPC("bridge.get_post", { author: "a", permlink: "b" });
    expect(cancelled).toBe(true);
  });

  it("falls back when the caller's validator rejects the proxy result", async () => {
    mockFetch(async (input, init) => {
      if (String(input) === PROXY) return jsonOk(null);
      return rpcOk(idOf(init), [{ name: "alice" }]);
    });
    const out = await callRPC("condenser_api.get_accounts", [["alice"]], undefined, undefined, undefined, (r) => Array.isArray(r));
    expect(out).toEqual([{ name: "alice" }]);
    expect(rpcProxyStats.fallbackByReason.validate).toBe(1);
  });

  it("propagates the caller's abort instead of falling back", async () => {
    const ctl = new AbortController();
    mockFetch(async (_input, init) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        ctl.abort();
      });
    });
    await expect(callRPC("bridge.get_post", { author: "a", permlink: "b" }, undefined, undefined, ctl.signal)).rejects.toBeTruthy();
    expect(rpcProxyStats.fallback).toBe(0);
  });

  it("opens a breaker after consecutive misses and skips the proxy for the cooldown", async () => {
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 500, failureThreshold: 2, cooldownMs: 300 });
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) return jsonOk({ error: "down" }, 502);
      return rpcOk(idOf(init), { from: "node" });
    });
    await callRPC("bridge.get_post", { author: "a", permlink: "1" });
    await callRPC("bridge.get_post", { author: "a", permlink: "2" });
    // Two misses opened it: the third read never touches the proxy.
    await callRPC("bridge.get_post", { author: "a", permlink: "3" });
    expect(urls.filter((u) => u === PROXY)).toHaveLength(2);
    expect(rpcProxyStats.skipped).toBe(1);
    // After the cooldown the proxy is tried again.
    await new Promise((r) => setTimeout(r, 350));
    await callRPC("bridge.get_post", { author: "a", permlink: "4" });
    expect(urls.filter((u) => u === PROXY)).toHaveLength(3);
  });

  it("a relayed node error falls back but neither opens nor advances the breaker", async () => {
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 500, failureThreshold: 2, cooldownMs: 300 });
    const relayed = () =>
      new Response(JSON.stringify({ error: "Assert Exception:Tag nosuchtag does not exist" }), {
        status: 502,
        headers: { "Content-Type": "application/json", "X-Ssr-Cache": "RPCERROR" }
      });
    let answer: () => Response = relayed;
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) return answer();
      return rpcOk(idOf(init), { from: "node" });
    });
    for (let i = 1; i <= 4; i++) {
      const out = await callRPC("bridge.get_ranked_posts", { sort: "created", tag: `nosuchtag${i}`, limit: 20 });
      expect(out).toEqual({ from: "node" });
    }
    // Four relays in a row, all four reached the proxy: the breaker never opened.
    expect(urls.filter((u) => u === PROXY)).toHaveLength(4);
    expect(rpcProxyStats.skipped).toBe(0);
    expect(rpcProxyStats.fallback).toBe(4);
    expect(rpcProxyStats.fallbackByReason.rpcerror).toBe(4);
    expect(rpcProxyStats.fallbackByReason.status).toBe(0);

    // A relay also clears a count a real miss had started: miss, relay, miss
    // does not reach the threshold of two.
    answer = () => jsonOk({ error: "down" }, 502);
    await callRPC("bridge.get_post", { author: "a", permlink: "1" }); // miss 1
    answer = relayed;
    await callRPC("bridge.get_post", { author: "a", permlink: "2" }); // relay, count reset
    answer = () => jsonOk({ error: "down" }, 502);
    await callRPC("bridge.get_post", { author: "a", permlink: "3" }); // miss 1 again (the relay reset it)
    await callRPC("bridge.get_post", { author: "a", permlink: "4" }); // miss 2: tried, then opens
    expect(rpcProxyStats.skipped).toBe(0);
    expect(urls.filter((u) => u === PROXY)).toHaveLength(8);

    // Bare 502s without the tag are still status misses and still count: the
    // breaker is open now.
    await callRPC("bridge.get_post", { author: "a", permlink: "5" }); // skipped
    expect(rpcProxyStats.skipped).toBe(1);
    expect(rpcProxyStats.fallbackByReason.status).toBe(3);
  });

  it("an upstream-throttled answer falls back but neither opens nor advances the breaker", async () => {
    // The proxy answers 503 RATELIMITED when every node behind it is
    // rate-limiting the host. The proxy is fine; opening the breaker would send
    // every following read straight to the same throttling nodes, uncoalesced.
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 500, failureThreshold: 2, cooldownMs: 300 });
    const throttled = () =>
      new Response(JSON.stringify({ error: "Upstream Rate Limited" }), {
        status: 503,
        headers: { "Content-Type": "application/json", "X-Ssr-Cache": "RATELIMITED", "Retry-After": "10" }
      });
    let answer: () => Response = throttled;
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) return answer();
      return rpcOk(idOf(init), { from: "node" });
    });
    for (let i = 1; i <= 4; i++) {
      // Still falls back for this read: the node pool is not the proxy's pool.
      expect(await callRPC("bridge.get_post", { author: "a", permlink: `${i}` })).toEqual({ from: "node" });
    }
    expect(urls.filter((u) => u === PROXY)).toHaveLength(4);
    expect(rpcProxyStats.skipped).toBe(0);
    expect(rpcProxyStats.fallback).toBe(4);
    expect(rpcProxyStats.fallbackByReason.ratelimited).toBe(4);
    expect(rpcProxyStats.fallbackByReason.status).toBe(0);

    // It also clears a count a real miss had started: miss, throttled, miss
    // does not reach the threshold of two.
    answer = () => jsonOk({ error: "down" }, 502);
    await callRPC("bridge.get_post", { author: "a", permlink: "m1" });
    answer = throttled;
    await callRPC("bridge.get_post", { author: "a", permlink: "m2" });
    answer = () => jsonOk({ error: "down" }, 502);
    await callRPC("bridge.get_post", { author: "a", permlink: "m3" });
    expect(rpcProxyStats.skipped).toBe(0);
    answer = throttled;
    await callRPC("bridge.get_post", { author: "a", permlink: "m4" }); // resets again

    // A 503 without the tag is a proxy that is down, and the tag on any other
    // status is not the contract: both still count, and two open the breaker.
    answer = () => jsonOk({ error: "down" }, 503);
    await callRPC("bridge.get_post", { author: "a", permlink: "5" });
    answer = () =>
      new Response(JSON.stringify({ error: "bad gateway" }), {
        status: 502,
        headers: { "Content-Type": "application/json", "X-Ssr-Cache": "RATELIMITED" }
      });
    await callRPC("bridge.get_post", { author: "a", permlink: "6" });
    await callRPC("bridge.get_post", { author: "a", permlink: "7" }); // open: skipped
    expect(rpcProxyStats.skipped).toBe(1);
    expect(rpcProxyStats.fallbackByReason.status).toBe(4); // m1, m3, then these two
    expect(rpcProxyStats.fallbackByReason.ratelimited).toBe(6);
  });

  it("an upstream failure the proxy reports falls back but neither opens nor advances the breaker", async () => {
    // 502 UPSTREAM is the proxy answering correctly that the nodes behind it
    // failed. Counting it opened the breaker on a healthy proxy whenever part of
    // its pool was down.
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 500, failureThreshold: 2, cooldownMs: 300 });
    const tagged = (status: number, tag: string) => () =>
      new Response(JSON.stringify({ error: "upstream" }), {
        status,
        headers: { "Content-Type": "application/json", "X-Ssr-Cache": tag }
      });
    const failedUpstream = tagged(502, "UPSTREAM");
    let answer: () => Response = failedUpstream;
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) return answer();
      return rpcOk(idOf(init), { from: "node" });
    });
    for (let i = 1; i <= 4; i++) {
      // The read itself still falls back: the node pool may reach a node the
      // proxy has parked.
      expect(await callRPC("bridge.get_post", { author: "a", permlink: `${i}` })).toEqual({ from: "node" });
    }
    expect(urls.filter((u) => u === PROXY)).toHaveLength(4);
    expect(rpcProxyStats.skipped).toBe(0);
    expect(rpcProxyStats.fallback).toBe(4);
    expect(rpcProxyStats.fallbackByReason.upstream).toBe(4);
    expect(rpcProxyStats.fallbackByReason.status).toBe(0);

    // It also clears a count a real miss had started: miss, upstream, miss does
    // not reach the threshold of two, so the next read still asks the proxy.
    const down = () => jsonOk({ error: "down" }, 502);
    answer = down;
    await callRPC("bridge.get_post", { author: "a", permlink: "m1" });
    answer = failedUpstream;
    await callRPC("bridge.get_post", { author: "a", permlink: "m2" });
    answer = down;
    await callRPC("bridge.get_post", { author: "a", permlink: "m3" });
    answer = failedUpstream;
    await callRPC("bridge.get_post", { author: "a", permlink: "m4" }); // asked, and resets again
    expect(rpcProxyStats.skipped).toBe(0);
    expect(urls.filter((u) => u === PROXY)).toHaveLength(8);

    // The proxy's own failures still count: 502 UNAVAILABLE (its fill queue
    // full, an unexpected exception) and its 504 TIMEOUT (a wedged proxy answers
    // exactly that). The breaker exists for them. Two open it.
    answer = tagged(502, "UNAVAILABLE");
    await callRPC("bridge.get_post", { author: "a", permlink: "5" });
    answer = tagged(504, "TIMEOUT");
    await callRPC("bridge.get_post", { author: "a", permlink: "6" });
    await callRPC("bridge.get_post", { author: "a", permlink: "7" }); // open: skipped
    expect(rpcProxyStats.skipped).toBe(1);
    expect(rpcProxyStats.fallbackByReason.status).toBe(4); // m1, m3, then these two

    // And the UPSTREAM tag on a status it does not belong to is not the
    // contract: it counts too.
    resetRpcProxyBreaker();
    answer = tagged(503, "UPSTREAM");
    await callRPC("bridge.get_post", { author: "a", permlink: "8" });
    await callRPC("bridge.get_post", { author: "a", permlink: "9" });
    await callRPC("bridge.get_post", { author: "a", permlink: "10" }); // open: skipped
    expect(rpcProxyStats.skipped).toBe(2);
    expect(rpcProxyStats.fallbackByReason.status).toBe(6);
    expect(rpcProxyStats.fallbackByReason.upstream).toBe(6);
  });

  it("a served call closes the breaker count", async () => {
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 500, failureThreshold: 2, cooldownMs: 300 });
    let fail = true;
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) return fail ? jsonOk({ error: "down" }, 502) : jsonOk({ ok: true });
      return rpcOk(idOf(init), { from: "node" });
    });
    await callRPC("bridge.get_post", { author: "a", permlink: "1" }); // miss 1
    fail = false;
    await callRPC("bridge.get_post", { author: "a", permlink: "2" }); // served, count reset
    fail = true;
    await callRPC("bridge.get_post", { author: "a", permlink: "3" }); // miss 1 again, still closed
    await callRPC("bridge.get_post", { author: "a", permlink: "4" }); // proxy still tried
    expect(urls.filter((u) => u === PROXY)).toHaveLength(4);
    expect(rpcProxyStats.skipped).toBe(0);
  });

  it("is inert when switched off", async () => {
    setServerRpcProxy(null);
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      return rpcOk(idOf(init), { from: "node" });
    });
    await callRPC("bridge.get_post", { author: "a", permlink: "b" });
    expect(urls).toEqual(["https://node-a.test"]);
  });

  it("validates its configuration and keeps the previous state on bad input", () => {
    setServerRpcProxy(null);
    setServerRpcProxy({ url: "not a url", headers: {}, timeoutMs: 1, methods: ["bridge.get_post"] });
    expect(serverRpcProxy).toBeNull();
    setServerRpcProxy({ url: PROXY, headers: { bad: "x\r\ny", good: "v" }, timeoutMs: -5, methods: ["nodot", "bridge.get_post"] });
    expect(serverRpcProxy?.headers).toEqual({ good: "v" });
    expect(serverRpcProxy?.timeoutMs).toBe(2000);
    expect(serverRpcProxy?.methods).toEqual(["bridge.get_post"]);
    // An empty allowlist routes nothing, so it is ignored and the previous state stays.
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 100, methods: [] });
    expect(serverRpcProxy?.methods).toEqual(["bridge.get_post"]);
    // Omitted = the default allowlist.
    setServerRpcProxy({ url: PROXY, headers: {}, timeoutMs: 100 });
    expect(serverRpcProxy?.methods).toEqual(DEFAULT_SERVER_RPC_PROXY_METHODS);
  });
});

describe("ConfigManager.getServerRpcProxyStats", () => {
  it("returns the live counters object the call path increments, not a copy", () => {
    const stats = ConfigManager.getServerRpcProxyStats();
    expect(stats).toBe(rpcProxyStats);
    const before = stats.skipped;
    rpcProxyStats.skipped += 1;
    expect(stats.skipped).toBe(before + 1);
    rpcProxyStats.skipped = before;
  });
});

// The read cache relays a node's `unknown method` answer as a 502 tagged
// RPCERROR with the node's message as `{"error": ...}` (vision-api #119).
describe("server-side RPC proxy: per-method fallback", () => {
  beforeEach(() => __METHOD_FALLBACK__.reset());

  function relayedUnknown(): Response {
    return new Response(JSON.stringify({ error: "Assert Exception:unknown method: bridge_apiget_post_v2" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "X-Ssr-Cache": "RPCERROR" }
    });
  }

  it("asks the proxy for v1 after it relayed unknown method for v2, then v1 only", async () => {
    const methods: string[] = [];
    mockFetch(async (input, init) => {
      expect(String(input)).toBe(PROXY);
      const body = bodyOf(init);
      methods.push(`${body.api}.${body.method}`);
      return body.method === "get_post_v2" ? relayedUnknown() : jsonOk({ author: "a", active_votes: [] });
    });
    const primary = { method: "bridge.get_post_v2", params: { author: "a", permlink: "b" } };
    const fallback = { method: "bridge.get_post", params: { author: "a", permlink: "b" } };

    const first = await callRPCWithFallback(primary, fallback);
    expect(first).toEqual({ result: { author: "a", active_votes: [] }, method: "bridge.get_post" });
    expect(methods).toEqual(["bridge.get_post_v2", "bridge.get_post"]);

    methods.length = 0;
    await callRPCWithFallback(primary, fallback);
    expect(methods).toEqual(["bridge.get_post"]);
    expect(rpcProxyStats.served).toBe(2);
    expect(rpcProxyStats.fallback).toBe(0);
  });

  it("does not take an echoed param for a missing method", async () => {
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) {
        return new Response(JSON.stringify({ error: "Assert Exception:Post gtg/unknown method does not exist" }), {
          status: 502,
          headers: { "X-Ssr-Cache": "RPCERROR" }
        });
      }
      return rpcOk(idOf(init), { author: "gtg" });
    });
    await callRPCWithFallback(
      { method: "bridge.get_post_v2", params: {} },
      { method: "bridge.get_post", params: {} }
    );
    expect(urls).toEqual([PROXY, "https://node-a.test"]);
    expect(__METHOD_FALLBACK__.lacksMethod(PROXY, "bridge.get_post_v2")).toBe(false);
  });

  it("treats any other relayed error as before: fall back to the nodes", async () => {
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) {
        return new Response(JSON.stringify({ error: "Assert Exception:Post a/b does not exist" }), {
          status: 502,
          headers: { "X-Ssr-Cache": "RPCERROR" }
        });
      }
      return rpcOk(idOf(init), { author: "a" });
    });
    await callRPCWithFallback(
      { method: "bridge.get_post_v2", params: {} },
      { method: "bridge.get_post", params: {} }
    );
    expect(urls).toEqual([PROXY, "https://node-a.test"]);
    expect(rpcProxyStats.fallbackByReason.rpcerror).toBe(1);
  });
});

// Review A: a read cache that predates the v2 methods answers them with a
// plain 404 (its route fallback, not a relayed node error). That is "the
// proxy lacks this method", not a proxy fault: it must not open the breaker
// for every other method.
describe("server-side RPC proxy: a 404 for the primary of a fallback pair", () => {
  beforeEach(() => __METHOD_FALLBACK__.reset());

  it("serves v2 reads through the proxy's v1 and keeps the breaker closed", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    mockFetch(async (input, init) => {
      const body = bodyOf(init);
      const method = String(input) === PROXY ? `${body.api}.${body.method}` : String(body.method);
      calls.push({ url: String(input), method });
      if (String(input) !== PROXY) return rpcOk(idOf(init), { from: "node" });
      if (body.method === "get_post_v2") return jsonOk({ error: "Not Found" }, 404);
      return jsonOk({ from: "proxy", method });
    });
    const primary = { method: "bridge.get_post_v2", params: { author: "a", permlink: "b" } };
    const fallback = { method: "bridge.get_post", params: { author: "a", permlink: "b" } };

    for (let i = 0; i < 3; i++) {
      const answer = await callRPCWithFallback(primary, fallback);
      expect(answer).toEqual({ result: { from: "proxy", method: "bridge.get_post" }, method: "bridge.get_post" });
    }
    // Probed once, then straight to v1 on the proxy.
    expect(calls.map((c) => c.method)).toEqual([
      "bridge.get_post_v2",
      "bridge.get_post",
      "bridge.get_post",
      "bridge.get_post"
    ]);
    expect(rpcProxyStats.fallbackByReason.status).toBe(0);

    calls.length = 0;
    await callRPC("bridge.get_profile", { account: "a" });
    expect(calls).toEqual([{ url: PROXY, method: "bridge.get_profile" }]);
  });

  it("still counts a 404 for a method without a fallback as a miss", async () => {
    mockFetch(async (input, init) =>
      String(input) === PROXY ? jsonOk({ error: "Not Found" }, 404) : rpcOk(idOf(init), { from: "node" })
    );
    await callRPC("bridge.get_profile", { account: "a" });
    expect(rpcProxyStats.fallbackByReason.status).toBe(1);
  });
});

describe("node parks named by the proxy", () => {
  // Hosts of their own: a park lives in the process-wide tracker, so these
  // must not touch the nodes the other specs use.
  const B = "https://park-b.test:8443";
  let parkSeq = 0;
  const throttledNaming = (parks: string) =>
    new Response(JSON.stringify({ error: "Upstream Rate Limited" }), {
      status: 503,
      headers: { "X-Ssr-Cache": "RATELIMITED", "Retry-After": "5", "X-Ssr-Node-Parks": parks }
    });

  it("falls back only to the nodes the proxy did not name, matching a non-default port", async () => {
    const a = `https://park-a${++parkSeq}.test`;
    config.nodes = [a, B];
    const urls: string[] = [];
    mockFetch(async (input, init) => {
      urls.push(String(input));
      if (String(input) === PROXY) return throttledNaming(`${new URL(a).host}=4000`);
      return rpcOk(idOf(init), { from: String(input) });
    });
    expect(await callRPC("bridge.get_post", { author: "a", permlink: "p" })).toEqual({ from: B });
    expect(urls).not.toContain(a);
    // Parked in this process too, for reads that never reach the proxy.
    expect(rpcHealthTracker.isNodeHealthy(a)).toBe(false);
    expect(rpcHealthTracker.isNodeHealthy(B)).toBe(true);
  });

  it("does not call any node when the proxy named every one, and counts it", async () => {
    const a = `https://park-a${++parkSeq}.test`;
    const b = `https://park-b${parkSeq}.test:8443`;
    config.nodes = [a, b];
    const urls: string[] = [];
    mockFetch(async (input) => {
      urls.push(String(input));
      if (String(input) === PROXY) {
        return throttledNaming(`${new URL(a).host}=4000,${new URL(b).host}=4000,unrelated.test=4000`);
      }
      throw new Error("a parked node was called");
    });
    await expect(callRPC("bridge.get_post", { author: "a", permlink: "p" })).rejects.toThrow(/out of rotation/);
    expect(urls).toEqual([PROXY]);
    expect(rpcProxyStats.parkedOut).toBe(1);
    expect(rpcProxyStats.fallbackByReason.ratelimited).toBe(1);
  });

  it("a shorter hint does not end a longer park already recorded", async () => {
    const a = `https://park-a${++parkSeq}.test`;
    config.nodes = [a, B];
    rpcHealthTracker.recordExternalPark(a, 30_000);
    // Time moves on between reading the hint and choosing a node.
    let t = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => (t += 5));
    const urls: string[] = [];
    mockFetch(async (input) => {
      urls.push(String(input));
      if (String(input) === PROXY) return throttledNaming(`${new URL(a).host}=1`);
      // The one node left fails, so the loop would move on to `a` if the
      // hint's own 1 ms were what kept it out.
      return new Response("bad gateway", { status: 502 });
    });
    await expect(callRPC("bridge.get_post", { author: "a", permlink: "p" })).rejects.toThrow();
    expect(urls).toContain(B);
    expect(urls).not.toContain(a);
  });

  it("only a RATELIMITED answer narrows the fallback: a relayed node error still asks the nodes", async () => {
    // A relayed RPC error (a missing post) is the node's answer, not throttling;
    // the caller must get that answer, not a manufactured rate-limit error.
    const a = `https://park-a${++parkSeq}.test`;
    const b = `https://park-b${parkSeq}.test`;
    config.nodes = [a, b];
    const nodeCalls: string[] = [];
    mockFetch(async (input, init) => {
      if (String(input) === PROXY) {
        return new Response(JSON.stringify({ error: "post does not exist" }), {
          status: 502,
          headers: {
            "X-Ssr-Cache": "RPCERROR",
            "X-Ssr-Node-Parks": `${new URL(a).host}=4000,${new URL(b).host}=4000`
          }
        });
      }
      nodeCalls.push(String(input));
      return rpcOk(idOf(init), { from: String(input) });
    });
    expect(await callRPC("bridge.get_post", { author: "a", permlink: "p" })).toEqual({ from: expect.any(String) });
    expect(nodeCalls.length).toBeGreaterThan(0);
    expect(rpcProxyStats.parkedOut).toBe(0);
  });

  it("parks from a served answer too, never longer than a minute, and skips malformed pairs", async () => {
    const a = `https://park-a${++parkSeq}.test`;
    const b = `https://park-b${parkSeq}.test`;
    config.nodes = [a, b];
    mockFetch(async () =>
      new Response(JSON.stringify({ ok: 1 }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Ssr-Node-Parks": `${new URL(a).host}=99999999999,garbage,${new URL(b).host}=abc,=5`
        }
      })
    );
    expect(await callRPC("bridge.get_post", { author: "a", permlink: "p" })).toEqual({ ok: 1 });
    expect(rpcHealthTracker.isNodeHealthy(a)).toBe(false);
    expect(rpcHealthTracker.isNodeHealthy(b)).toBe(true);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    expect(rpcHealthTracker.isNodeHealthy(a)).toBe(true);
  });

  it("a park never shortens a longer one and counts no failure", () => {
    const n = `https://park-x${++parkSeq}.test`;
    rpcHealthTracker.recordExternalPark(n, 30_000);
    rpcHealthTracker.recordExternalPark(n, 1_000);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 10_000);
    expect(rpcHealthTracker.isNodeHealthy(n)).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
    // Healthy again once the park lapses: no failure streak was left behind.
    expect(rpcHealthTracker.isNodeHealthy(n)).toBe(true);
  });
});
