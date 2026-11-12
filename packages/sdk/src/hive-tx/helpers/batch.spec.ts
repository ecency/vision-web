import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRPCBatch, rpcHealthTracker, __METHOD_FALLBACK__ } from "./call";
import { config } from "../config";

const ORIGINAL_NODES = [...config.nodes];
const calls = [
  { method: "database_api.list_votes", params: { start: ["a", "p1", "u"], limit: 1, order: "by_comment_voter" } },
  { method: "database_api.list_votes", params: { start: ["a", "p2", "u"], limit: 1, order: "by_comment_voter" } },
  { method: "database_api.list_votes", params: { start: ["a", "p3", "u"], limit: 1, order: "by_comment_voter" } },
];
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => __METHOD_FALLBACK__.reset());
afterEach(() => {
  config.nodes = ORIGINAL_NODES;
  vi.restoreAllMocks();
});

// Review 2: a node that answers HTTP 200 with a node-level error for every
// request of the batch (a sick backend) is a node failure, not three answers.
describe("callRPCBatch: node-level errors inside a batch", () => {
  it("fails the batch over to the next node and records the failure", async () => {
    config.nodes = ["https://sick-batch.test", "https://good-batch.test"];
    const hosts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      hosts.push(new URL(String(input)).host);
      if (String(input).includes("sick")) {
        return json(body.map((r: any) => ({ jsonrpc: "2.0", id: r.id, error: { code: -32603, message: "Internal Error" } })));
      }
      return json(body.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: { votes: [] } })));
    });

    const answers = await callRPCBatch(calls);

    expect(hosts).toEqual(["sick-batch.test", "good-batch.test"]);
    expect(answers.every((a) => a.error === undefined)).toBe(true);
    expect((rpcHealthTracker as any).health.get("https://sick-batch.test").apiFailures.get("database_api").count).toBe(1);
  });

  it("keeps an application error as that request's answer", async () => {
    config.nodes = ["https://app-error.test", "https://unused.test"];
    const hosts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      hosts.push(new URL(String(input)).host);
      return json(
        body.map((r: any, i: number) =>
          i === 1
            ? { jsonrpc: "2.0", id: r.id, error: { code: -32602, message: "Assert Exception:bad start" } }
            : { jsonrpc: "2.0", id: r.id, result: { votes: [] } }
        )
      );
    });
    const answers = await callRPCBatch(calls);
    expect(hosts).toEqual(["app-error.test"]);
    expect(answers[1].error?.message).toMatch(/bad start/);
  });
});

// Review 7: a node (or proxy in front of it) that cannot take a batch array
// answers with a single object. That says nothing about its health: mark it
// as batch-incapable for a while and ask it the requests one by one.
describe("callRPCBatch: a node that does not take batches", () => {
  it("sends the lookups as single calls to that node, with no health penalty, and remembers it", async () => {
    config.nodes = ["https://no-batch.test"];
    const shapes: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      if (Array.isArray(body)) {
        shapes.push(`batch of ${body.length}`);
        return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
      }
      shapes.push("single");
      return json({ jsonrpc: "2.0", id: body.id, result: { votes: [{ voter: "u", n: body.params.start[1] }] } });
    });
    const before = (rpcHealthTracker as any).health.get("https://no-batch.test")?.consecutiveFailures ?? 0;

    const first = await callRPCBatch(calls);
    expect(shapes).toEqual(["batch of 3", "single", "single", "single"]);
    expect(first.map((a) => (a.result as any).votes[0].n)).toEqual(["p1", "p2", "p3"]);
    expect((rpcHealthTracker as any).health.get("https://no-batch.test")?.consecutiveFailures ?? 0).toBe(before);
    expect(rpcHealthTracker.isNodeHealthy("https://no-batch.test", "database_api")).toBe(true);

    shapes.length = 0;
    await callRPCBatch(calls);
    expect(shapes).toEqual(["single", "single", "single"]);
  });
});
