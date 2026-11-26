import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRPC, callRPCBatch, callWithQuorum, nodeCallCounts } from "./call";
import { config, setServerRpcProxy } from "../config";

const ORIGINAL_NODES = [...config.nodes];

function rpcOk(init: RequestInit | undefined, result: unknown): Response {
  const id = (JSON.parse(String(init?.body)) as { id: number }).id;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("per-node request counts", () => {
  let seq = 0;
  beforeEach(() => setServerRpcProxy(null));
  afterEach(() => {
    config.nodes = ORIGINAL_NODES;
    vi.restoreAllMocks();
  });

  it("counts every request a node was sent, by outcome", async () => {
    // Hosts of their own: the counts are process-wide.
    const a = `https://count-a${++seq}.test`;
    const b = `https://count-b${seq}.test`;
    config.nodes = [a, b];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === a) return new Response("slow down", { status: 429 });
      return rpcOk(init, { ok: true });
    });
    expect(await callRPC("condenser_api.get_accounts", [["x"]])).toEqual({ ok: true });
    const counts = nodeCallCounts();
    expect(counts[a]).toEqual({ ok: 0, failed: 0, rateLimited: 1 });
    expect(counts[b]).toEqual({ ok: 1, failed: 0, rateLimited: 0 });
  });

  it("counts a transport failure and the extra reads of a quorum check", async () => {
    const a = `https://count-a${++seq}.test`;
    const b = `https://count-b${seq}.test`;
    config.nodes = [a, b];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === a) throw new TypeError("fetch failed");
      return rpcOk(init, { ok: true });
    });
    await callRPC("condenser_api.get_accounts", [["x"]]);
    await callWithQuorum("condenser_api.get_accounts", [["x"]], 1).catch(() => undefined);
    const counts = nodeCallCounts();
    expect(counts[a].failed).toBeGreaterThanOrEqual(1);
    expect(counts[b].ok).toBeGreaterThanOrEqual(2);
  });

  it("counts a 200 whose body does not parse as failed, and an RPC error reply as answered", async () => {
    const a = `https://count-a${++seq}.test`;
    const b = `https://count-b${seq}.test`;
    config.nodes = [a, b];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === a) return new Response("<html>oops", { status: 200 });
      const id = (JSON.parse(String(init?.body)) as { id: number }).id;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32602, message: "Assert Exception:Post a/b does not exist" } }), {
        status: 200
      });
    });
    await callRPC("condenser_api.get_content", ["a", "b"]).catch(() => undefined);
    const counts = nodeCallCounts();
    expect(counts[a]).toEqual({ ok: 0, failed: 1, rateLimited: 0 });
    expect(counts[b].ok).toBeGreaterThanOrEqual(1);
    expect(counts[b].failed).toBe(0);
  });

  it("counts one batch request once", async () => {
    const a = `https://count-a${++seq}.test`;
    config.nodes = [a];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const reqs = JSON.parse(String(init?.body)) as Array<{ id: number }>;
      return new Response(JSON.stringify(reqs.map((r) => ({ jsonrpc: "2.0", id: r.id, result: 1 }))), { status: 200 });
    });
    await callRPCBatch([
      { method: "condenser_api.get_accounts", params: [["x"]] },
      { method: "condenser_api.get_accounts", params: [["y"]] }
    ]);
    expect(nodeCallCounts()[a]).toEqual({ ok: 1, failed: 0, rateLimited: 0 });
  });
});
