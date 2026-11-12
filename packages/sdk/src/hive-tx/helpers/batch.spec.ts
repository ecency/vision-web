import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
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

  // Round 5, item 3: a node-level error on SOME elements is not an answer for
  // them: those elements (only) move to the next node, and the node that
  // failed them is not recorded as healthy.
  it("batch: 49 sick elements and 1 good one: the 49 are re-sent to the next node", async () => {
    config.nodes = ["https://mixed-a.test", "https://mixed-b.test"];
    const sent: Array<{ host: string; n: number }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      const host = new URL(String(input)).host;
      const body = JSON.parse(String(init.body));
      sent.push({ host, n: body.length });
      return json(
        body.map((r: any) =>
          host === "mixed-a.test" && r.params.start[1] !== "p0"
            ? { jsonrpc: "2.0", id: r.id, error: { code: -32603, message: "Internal Error" } }
            : { jsonrpc: "2.0", id: r.id, result: { votes: [{ n: r.params.start[1], host }] } }
        )
      );
    });
    const fifty = Array.from({ length: 50 }, (_, i) => ({
      method: "database_api.list_votes",
      params: { start: ["a", `p${i}`, "u"], limit: 1, order: "by_comment_voter" },
    }));
    const answers = await callRPCBatch(fifty);
    expect(sent).toEqual([
      { host: "mixed-a.test", n: 50 },
      { host: "mixed-b.test", n: 49 },
    ]);
    expect(answers.every((a) => a.error === undefined)).toBe(true);
    expect((answers[0].result as any).votes[0].host).toBe("mixed-a.test");
    expect((answers[7].result as any).votes[0]).toEqual({ n: "p7", host: "mixed-b.test" });
    const a = (rpcHealthTracker as any).health.get("https://mixed-a.test");
    expect(a.apiFailures.get("database_api")?.count ?? 0).toBe(1);
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

// Round 5, item 2: a node that dies while it is being sent single calls must
// not cost a timeout per request before the batch moves on.
describe("callRPCBatch: a dead node in single-call mode", () => {
  // Asserts attempt counts, not wall time: the call gets a budget the
  // failover always fits in (20 x the 100 ms timeout), so a slow runner
  // cannot run out of it, and the old behaviour (every request sent into the
  // timeout, six at a time) still fails on the count.
  it("sends the dead node one wave of requests, then fails the rest over", async () => {
    const budget = config.resilience.totalBudgetFactor;
    config.resilience.totalBudgetFactor = 20;
    onTestFinished(() => {
      config.resilience.totalBudgetFactor = budget;
    });
    config.nodes = ["https://dead-singles.test", "https://live-singles.test"];
    __BATCH_SUPPORT__.markUnsupported("https://dead-singles.test");
    __BATCH_SUPPORT__.markUnsupported("https://live-singles.test");
    let deadCalls = 0;
    let liveCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      if (!String(input).includes("dead-singles")) liveCalls++;
      if (String(input).includes("dead-singles")) {
        deadCalls++;
        // A dead node: every request runs into its timeout.
        return new Promise((_r, reject) =>
          init.signal?.addEventListener("abort", () => {
            const e = new Error("timed out");
            e.name = "TimeoutError";
            reject(e);
          })
        );
      }
      return Promise.resolve(json({ jsonrpc: "2.0", id: body.id, result: { votes: [] } }));
    });
    const many = Array.from({ length: 50 }, (_, i) => ({
      method: "database_api.list_votes",
      params: { start: ["a", `p${i}`, "u"], limit: 1, order: "by_comment_voter" },
    }));
    const answers = await callRPCBatch(many, { timeout: 100 });
    expect(answers.every((a) => a.error === undefined)).toBe(true);
    // One wave: each of the six workers stops after its own timeout.
    expect(deadCalls).toBeLessThanOrEqual(6);
    expect(liveCalls).toBe(50);
  });
});

describe("callRPCBatch: single-call mode stops early", () => {
  const fifty = Array.from({ length: 50 }, (_, i) => ({
    method: "database_api.list_votes",
    params: { start: ["a", `p${i}`, "u"], limit: 1, order: "by_comment_voter" },
  }));

  it("stops every worker after two transport failures in a row, the rest moves on", async () => {
    config.nodes = ["https://half-sick.test", "https://healthy.test"];
    __BATCH_SUPPORT__.markUnsupported("https://half-sick.test");
    __BATCH_SUPPORT__.markUnsupported("https://healthy.test");
    const hosts: Record<string, number> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      const host = new URL(String(input)).host;
      hosts[host] = (hosts[host] ?? 0) + 1;
      const body = JSON.parse(String(init.body));
      if (host === "half-sick.test") {
        const n = Number(body.params.start[1].slice(1));
        if (n < 2) throw new TypeError("fetch failed");
        await new Promise((r) => setTimeout(r, 20));
      }
      return json({ jsonrpc: "2.0", id: body.id, result: { votes: [] } });
    });
    const answers = await callRPCBatch(fifty);
    expect(answers.every((a) => a.error === undefined)).toBe(true);
    // Only the first wave reached the half-sick node.
    expect(hosts["half-sick.test"]).toBeLessThanOrEqual(6);
    expect(hosts["healthy.test"]).toBeGreaterThanOrEqual(44);
  });

  it("starts no new single call past the call's time budget", async () => {
    config.nodes = ["https://slow-singles.test"];
    __BATCH_SUPPORT__.markUnsupported("https://slow-singles.test");
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      calls++;
      const body = JSON.parse(String(init.body));
      await new Promise((r) => setTimeout(r, 60));
      return json({ jsonrpc: "2.0", id: body.id, result: { votes: [] } });
    });
    const answers = await callRPCBatch(fifty, { timeout: 100 });
    // Budget: 2 x 100 ms. Sending all 50, six at a time, takes at least
    // ~540 ms, so the budget always ends it first; a slower runner only
    // stops it sooner. Counted, not timed.
    expect(calls).toBeLessThan(50);
    expect(answers.some((a) => a.error === undefined)).toBe(true);
  });
});

// Round 6, item 1: an "Assert Exception:" is the node answering the request,
// whatever the code (a plain hived node sends -32003 for some asserts).
describe("callRPCBatch: request-level asserts under any code", () => {
  it("keeps a -32003 'Assert Exception:' element as its answer: one fetch, no failure", async () => {
    const node = "https://assert-32003.test";
    config.nodes = [node, "https://unused-32003.test"];
    let fetches = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      fetches++;
      const body = JSON.parse(String(init.body));
      return json(
        body.map((r: any, i: number) =>
          i === 7
            ? { jsonrpc: "2.0", id: r.id, error: { code: -32003, message: "Assert Exception:start.size() == 3: bad key" } }
            : { jsonrpc: "2.0", id: r.id, result: { votes: [] } }
        )
      );
    });
    const fifty = Array.from({ length: 50 }, (_, i) => ({
      method: "database_api.list_votes",
      params: { start: ["a", `p${i}`, "u"], limit: 1, order: "by_comment_voter" },
    }));
    const answers = await callRPCBatch(fifty);
    expect(fetches).toBe(1);
    expect(answers[7].error?.message).toMatch(/^Assert Exception:/);
    const h = (rpcHealthTracker as any).health.get(node);
    expect(h?.apiFailures.get("database_api")?.count ?? 0).toBe(0);
    expect(h?.consecutiveFailures ?? 0).toBe(0);
  });

  it("does not record a node failure for requests left over at the call's deadline", async () => {
    const node = "https://slow-but-fine.test";
    config.nodes = [node];
    __BATCH_SUPPORT__.markUnsupported(node);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      await new Promise((r) => setTimeout(r, 60));
      return json({ jsonrpc: "2.0", id: body.id, result: { votes: [] } });
    });
    const fifty = Array.from({ length: 50 }, (_, i) => ({
      method: "database_api.list_votes",
      params: { start: ["a", `q${i}`, "u"], limit: 1, order: "by_comment_voter" },
    }));
    const answers = await callRPCBatch(fifty, { timeout: 100 });
    expect(answers.some((a) => a.error !== undefined)).toBe(true);
    const h = (rpcHealthTracker as any).health.get(node);
    expect(h?.apiFailures.get("database_api")?.count ?? 0).toBe(0);
    expect(h?.consecutiveFailures ?? 0).toBe(0);
  });
});

// Round 7: hived answers "this node cannot serve this API" with an Assert
// Exception whose START is fixed server text (live on api.hive.blog,
// api.deathwing.me and rpc.mahdiyari.info). That is a node fault: fail over.
// Request params cannot forge the prefix; an echo later in the text stays an
// application error.
describe("node-level asserts: a node that cannot serve the API", () => {
  const cases: Array<[string, number, string, boolean]> = [
    ["missing API", -32002, "Assert Exception:api_itr != data._registered_apis.end(): Could not find API account_history_api", true],
    ["missing method", -32002, "Assert Exception:method_itr != api_itr->second.end(): Could not find method get_discussions_by_blog_x", true],
    ["hivemind redirect", -32002, "Assert Exception:false: Supported by hivemind", true],
    ["an echo of that text in a param", -32602, "Assert Exception:Post x/Could not find API y does not exist", false],
    ["a lock timeout (not an assert)", -32003, "Unable to acquire READ lock", true],
  ];

  for (const [label, code, message, failsOver] of cases) {
    it(`callRPC: ${label} ${failsOver ? "fails over" : "stays an answer"}`, async () => {
      const a = `https://api-a-${label.replace(/\W+/g, "-")}.test`;
      const b = `https://api-b-${label.replace(/\W+/g, "-")}.test`;
      config.nodes = [a, b];
      const hosts: string[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
        hosts.push(String(input));
        const body = JSON.parse(String(init.body));
        return String(input) === a
          ? json({ jsonrpc: "2.0", id: body.id, error: { code, message } })
          : json({ jsonrpc: "2.0", id: body.id, result: { ok: true } });
      });
      if (failsOver) {
        await expect(callRPC("condenser_api.get_accounts", [["x"]])).resolves.toEqual({ ok: true });
        expect(hosts).toEqual([a, b]);
      } else {
        await expect(callRPC("condenser_api.get_accounts", [["x"]])).rejects.toThrow(/does not exist/);
        expect(hosts).toEqual([a]);
      }
    });

    it(`callRPCBatch: ${label} on every element ${failsOver ? "fails over" : "stays the answers"}`, async () => {
      const a = `https://batch-a-${label.replace(/\W+/g, "-")}.test`;
      const b = `https://batch-b-${label.replace(/\W+/g, "-")}.test`;
      config.nodes = [a, b];
      const hosts: string[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
        hosts.push(String(input));
        const body = JSON.parse(String(init.body));
        return json(
          body.map((r: any) =>
            String(input) === a
              ? { jsonrpc: "2.0", id: r.id, error: { code, message } }
              : { jsonrpc: "2.0", id: r.id, result: { votes: [] } }
          )
        );
      });
      const answers = await callRPCBatch(calls);
      if (failsOver) {
        expect(hosts).toEqual([a, b]);
        expect(answers.every((x) => x.error === undefined)).toBe(true);
      } else {
        expect(hosts).toEqual([a]);
        expect(answers.every((x) => /does not exist/.test(String(x.error?.message)))).toBe(true);
      }
    });
  }
});

// PR review, items 8 and 9: non-OK batch responses.
describe("callRPCBatch: non-OK HTTP answers", () => {
  it("reads a 4xx JSON-RPC batch body by the usual rules instead of faulting the node", async () => {
    const node = "https://http400-batch.test";
    config.nodes = [node, "https://http400-unused.test"];
    const hosts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      hosts.push(String(input));
      const body = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          body.map((r: any, i: number) =>
            i === 0
              ? { jsonrpc: "2.0", id: r.id, error: { code: -32602, message: "Assert Exception:bad start key" } }
              : { jsonrpc: "2.0", id: r.id, result: { votes: [] } }
          )
        ),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    });
    const answers = await callRPCBatch(calls);
    expect(hosts).toEqual([node]);
    expect(answers[0].error?.message).toMatch(/bad start key/);
    expect(answers[1].result).toEqual({ votes: [] });
    expect((rpcHealthTracker as any).health.get(node)?.consecutiveFailures ?? 0).toBe(0);
  });

  it("still faults the node on a 4xx without a JSON-RPC body", async () => {
    const node = "https://http403-batch.test";
    config.nodes = [node, "https://http403-good.test"];
    const hosts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      hosts.push(String(input));
      const body = JSON.parse(String(init.body));
      if (String(input) === node) return new Response("<html>forbidden</html>", { status: 403 });
      return json(body.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: { votes: [] } })));
    });
    await callRPCBatch(calls);
    expect(hosts).toEqual([node, "https://http403-good.test"]);
  });

  it("releases the body of a 429 answer", async () => {
    config.nodes = ["https://http429-batch.test", "https://http429-good.test"];
    const cancels: boolean[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      if (String(input).includes("http429-batch")) {
        const r = new Response("slow down", { status: 429 });
        const original = r.body!.cancel.bind(r.body!);
        r.body!.cancel = (reason?: unknown) => {
          cancels.push(true);
          return original(reason);
        };
        return r;
      }
      return json(body.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: { votes: [] } })));
    });
    await callRPCBatch(calls);
    expect(cancels).toEqual([true]);
  });
});

// PR delta review, item 1: an element error without a numeric code keeps its
// message, not "[object Object]".
describe("callRPCBatch: element errors without a code", () => {
  it("surfaces the element's message", async () => {
    config.nodes = ["https://codeless.test"];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      return json(
        body.map((r: { id: number }, i: number) =>
          i === 0 ? { jsonrpc: "2.0", id: r.id, error: { message: "boom" } } : { jsonrpc: "2.0", id: r.id, result: { votes: [] } }
        )
      );
    });
    const answers = await callRPCBatch(calls);
    expect(answers[0].error?.message).toBe("boom");
  });
});
