import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRPC, callWithQuorum, nodeCallCounts } from "./call";
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
});
