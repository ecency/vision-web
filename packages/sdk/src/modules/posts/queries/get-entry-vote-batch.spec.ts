import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { config } from "@/hive-tx/config";
import { getEntryVoteQueryOptions } from "./get-entry-active-votes-query-options";

// Review B: a page of cards read for the default observer needs the user's own
// vote on each. Lookups issued in one tick go out as ONE JSON-RPC batch POST.
const ORIGINAL_NODES = [...config.nodes];

function batchAnswer(body: any[]): Response {
  const out = body.map((req) => {
    const [author, permlink, voter] = req.params.start;
    const n = Number(permlink.replace("p", ""));
    // Even posts: the user voted. Odd posts: the seek lands on someone else.
    const votes = [{ voter: n % 2 === 0 ? voter : "zzz", author, permlink, rshares: n, vote_percent: 100 * (n + 1), weight: 1, last_update: "t" }];
    return { jsonrpc: "2.0", id: req.id, result: { votes } };
  });
  // Batch answers may come back in any order.
  return new Response(JSON.stringify(out.reverse()), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("getEntryVoteQueryOptions: batched lookups", () => {
  beforeEach(() => {
    config.nodes = ["https://batch-a.test", "https://batch-b.test"];
  });
  afterEach(() => {
    config.nodes = ORIGINAL_NODES;
    vi.restoreAllMocks();
  });

  it("sends 20 cards' lookups as one HTTP request and routes each answer", async () => {
    const requests: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      return batchAnswer(body);
    });
    const qc = new QueryClient();

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => qc.fetchQuery(getEntryVoteQueryOptions("bob", `p${i}`, "alice")))
    );

    expect(requests).toHaveLength(1);
    expect(Array.isArray(requests[0])).toBe(true);
    expect(requests[0]).toHaveLength(20);
    expect(requests[0][3]).toMatchObject({
      method: "database_api.list_votes",
      params: { start: ["bob", "p3", "alice"], limit: 1, order: "by_comment_voter" },
    });
    expect(results[4]).toEqual({ rshares: 4, percent: 500 });
    expect(results[5]).toBeNull();
  });

  it("splits a large tick into chunks", async () => {
    const sizes: number[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      sizes.push(body.length);
      return batchAnswer(body);
    });
    const qc = new QueryClient();
    await Promise.all(
      Array.from({ length: 120 }, (_, i) => qc.fetchQuery(getEntryVoteQueryOptions("bob", `p${i}`, "alice")))
    );
    expect(sizes).toEqual([50, 50, 20]);
  });

  it("fails over as a unit: the whole batch moves to the next node", async () => {
    const hosts: Array<{ host: string; size: number }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      hosts.push({ host: new URL(String(input)).host, size: body.length });
      if (String(input).includes("batch-a")) return new Response("down", { status: 503 });
      return batchAnswer(body);
    });
    const qc = new QueryClient();
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, i) => qc.fetchQuery(getEntryVoteQueryOptions("bob", `p${i}`, "alice")))
    );
    expect(hosts).toEqual([
      { host: "batch-a.test", size: 3 },
      { host: "batch-b.test", size: 3 },
    ]);
    expect(results[0]).toEqual({ rshares: 0, percent: 100 });
  });

  it("asks once for the same lookup issued twice in a tick", async () => {
    const requests: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      requests.push(body);
      return batchAnswer(body);
    });
    const a = getEntryVoteQueryOptions("bob", "p2", "alice");
    const [x, y] = await Promise.all([new QueryClient().fetchQuery(a), new QueryClient().fetchQuery(a)]);
    expect(requests[0]).toHaveLength(1);
    expect(x).toEqual(y);
  });
});
