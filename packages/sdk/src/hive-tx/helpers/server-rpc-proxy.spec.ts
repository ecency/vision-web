import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRPC, resetRpcProxyBreaker, rpcProxyStats } from "./call";
import { config, serverRpcProxy, setServerRpcProxy, DEFAULT_SERVER_RPC_PROXY_METHODS } from "../config";

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
