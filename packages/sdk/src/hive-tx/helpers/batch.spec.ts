import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRPC, callRPCBatch, rpcHealthTracker, __METHOD_FALLBACK__, __BATCH_SUPPORT__ } from "./call";
import { config } from "../config";

const ORIGINAL_NODES = [...config.nodes];
const calls = [
  { method: "database_api.list_votes", params: { start: ["a", "p1", "u"], limit: 1, order: "by_comment_voter" } },
  { method: "database_api.list_votes", params: { start: ["a", "p2", "u"], limit: 1, order: "by_comment_voter" } },
  { method: "database_api.list_votes", params: { start: ["a", "p3", "u"], limit: 1, order: "by_comment_voter" } },
];
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  __METHOD_FALLBACK__.reset();
  __BATCH_SUPPORT__.reset();
});
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
        // A plain answer: not an array, not an error object.
        return json({ jsonrpc: "2.0", id: null, result: null });
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

    // One refusal is not enough to mark it: the batch is tried again.
    shapes.length = 0;
    await callRPCBatch(calls);
    expect(shapes).toEqual(["batch of 3", "single", "single", "single"]);

    // Two in a row: marked, singles straight away.
    shapes.length = 0;
    await callRPCBatch(calls);
    expect(shapes).toEqual(["single", "single", "single"]);
  });
});

// Round 4, item 1: hivemind echoes caller params into "Assert Exception:"
// messages, so a missing post whose permlink says "internal" is an answer,
// not a sick node.
describe("node-level classification of echoed asserts", () => {
  const echoed = (id: number) => ({
    jsonrpc: "2.0",
    id,
    error: { code: -32602, message: "Assert Exception:Post a/internal-notes does not exist" },
  });

  it("callRPC: a 'does not exist' assert naming 'internal' does not fail over", async () => {
    config.nodes = ["https://echo-a.test", "https://echo-b.test"];
    const hosts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      hosts.push(new URL(String(input)).host);
      return json(echoed(JSON.parse(String(init.body)).id));
    });
    await expect(callRPC("bridge.get_post", { author: "a", permlink: "internal-notes" })).rejects.toThrow(/does not exist/);
    expect(hosts).toEqual(["echo-a.test"]);
  });

  it("batch: such an element is that lookup's answer; no failover", async () => {
    config.nodes = ["https://echo-batch-a.test", "https://echo-batch-b.test"];
    const hosts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      hosts.push(new URL(String(input)).host);
      const body = JSON.parse(String(init.body));
      return json(body.map((r: any) => echoed(r.id)));
    });
    const answers = await callRPCBatch(calls);
    expect(hosts).toEqual(["echo-batch-a.test"]);
    expect(answers.every((a) => /does not exist/.test(String(a.error?.message)))).toBe(true);
  });

  it("batch: one sick element among good ones stays that element's answer", async () => {
    config.nodes = ["https://mixed-a.test", "https://mixed-b.test"];
    const hosts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      hosts.push(new URL(String(input)).host);
      const body = JSON.parse(String(init.body));
      return json(
        body.map((r: any, i: number) =>
          i === 0
            ? { jsonrpc: "2.0", id: r.id, error: { code: -32603, message: "Internal Error" } }
            : { jsonrpc: "2.0", id: r.id, result: { votes: [] } }
        )
      );
    });
    const answers = await callRPCBatch(calls);
    expect(hosts).toEqual(["mixed-a.test"]);
    expect(answers[0].error).toBeDefined();
    expect(answers[1].result).toEqual({ votes: [] });
    expect(answers[2].result).toEqual({ votes: [] });
  });
});

// Round 4, item 2: what does and does not mean "this node takes no batches".
describe("callRPCBatch: refusals and partial answers", () => {
  it("fails over on a whole-batch node-level error object, without marking", async () => {
    config.nodes = ["https://whole-sick.test", "https://whole-good.test"];
    const hosts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      hosts.push(new URL(String(input)).host);
      const body = JSON.parse(String(init.body));
      if (String(input).includes("whole-sick")) {
        return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal Error" } });
      }
      return json(body.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: { votes: [] } })));
    });
    await callRPCBatch(calls);
    expect(hosts).toEqual(["whole-sick.test", "whole-good.test"]);
    expect(__BATCH_SUPPORT__.refused("https://whole-sick.test")).toBe(0);
  });

  it("re-sends only the missing ids of a partial answer, as singles, without marking", async () => {
    config.nodes = ["https://partial.test"];
    const shapes: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      if (Array.isArray(body)) {
        shapes.push(`batch of ${body.length}`);
        // Only the first request answered.
        return json([{ jsonrpc: "2.0", id: body[0].id, result: { votes: [{ n: body[0].params.start[1] }] } }]);
      }
      shapes.push(`single ${body.params.start[1]}`);
      return json({ jsonrpc: "2.0", id: body.id, result: { votes: [{ n: body.params.start[1] }] } });
    });
    const answers = await callRPCBatch(calls);
    expect(shapes).toEqual(["batch of 3", "single p2", "single p3"]);
    expect(answers.map((a) => (a.result as any).votes[0].n)).toEqual(["p1", "p2", "p3"]);
    expect(__BATCH_SUPPORT__.refused("https://partial.test")).toBe(0);
  });

  it("caps singles in flight and keeps the others when one single fails", async () => {
    config.nodes = ["https://capped.test"];
    __BATCH_SUPPORT__.markUnsupported("https://capped.test");
    let inFlight = 0;
    let max = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      inFlight++;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      if (body.params.start[1] === "p4") throw new TypeError("fetch failed");
      return json({ jsonrpc: "2.0", id: body.id, result: { votes: [] } });
    });
    const many = Array.from({ length: 15 }, (_, i) => ({
      method: "database_api.list_votes",
      params: { start: ["a", `p${i}`, "u"], limit: 1, order: "by_comment_voter" },
    }));
    const answers = await callRPCBatch(many);
    expect(max).toBeLessThanOrEqual(6);
    expect(answers.filter((a) => a.error === undefined)).toHaveLength(14);
    expect(answers[4].error).toBeDefined();
  });
});

describe("callRPCBatch: an error-object refusal", () => {
  it("answers with singles this time but never marks the node", async () => {
    config.nodes = ["https://invalid-req.test"];
    const shapes: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      if (Array.isArray(body)) {
        shapes.push("batch");
        return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
      }
      shapes.push("single");
      return json({ jsonrpc: "2.0", id: body.id, result: { votes: [] } });
    });
    for (let i = 0; i < 3; i++) await callRPCBatch(calls.slice(0, 1));
    expect(shapes).toEqual(["batch", "single", "batch", "single", "batch", "single"]);
    expect(__BATCH_SUPPORT__.refused("https://invalid-req.test")).toBe(0);
  });
});
