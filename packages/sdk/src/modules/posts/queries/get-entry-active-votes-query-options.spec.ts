import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { config } from "@/hive-tx/config";
import { __METHOD_FALLBACK__ } from "@/hive-tx/helpers/call";
import { getEntryActiveVotesQueryOptions } from "./get-entry-active-votes-query-options";

// Issue #2056: the votes dialog lists every voter. v1 entries stopped at 1000
// votes, so the full list comes from bridge.list_votes (paged, `start` is the
// last voter of the previous page, exclusive) and, on a node without it, from
// condenser_api.get_active_votes.
const ORIGINAL_NODES = [...config.nodes];
const VOTES = Array.from({ length: 1500 }, (_, i) => ({
  voter: `voter${String(i).padStart(4, "0")}`,
  rshares: 1000 + i,
  percent: 10000,
  weight: 10 + i,
  reputation: 50,
  time: "2026-11-07T06:45:09"
}));

function rpc(id: number, body: object): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, ...body }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function listVotesPage(params: { start?: string; limit?: number }) {
  const limit = params.limit ?? 1000;
  const from = params.start ? VOTES.findIndex((v) => v.voter === params.start) + 1 : 0;
  return VOTES.slice(from, from + limit);
}

const entry = { author: "alice", permlink: "big-post" } as any;

describe("getEntryActiveVotesQueryOptions: every voter of a 1500-vote post", () => {
  beforeEach(() => {
    // Each test starts with no node marked as lacking list_votes.
    __METHOD_FALLBACK__.reset();
    config.nodes = ["https://votes-node.test"];
  });
  afterEach(() => {
    config.nodes = ORIGINAL_NODES;
    vi.restoreAllMocks();
  });

  it("pages bridge.list_votes until the last page", async () => {
    const calls: Array<{ method: string; params: any }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      calls.push({ method: body.method, params: body.params });
      if (body.method === "bridge.list_votes") return rpc(body.id, { result: listVotesPage(body.params) });
      return rpc(body.id, { result: VOTES.slice(0, 1000) });
    });

    const votes = await new QueryClient().fetchQuery(getEntryActiveVotesQueryOptions(entry));

    expect(calls.map((c) => c.method)).toEqual(["bridge.list_votes", "bridge.list_votes"]);
    expect(calls[0].params).toEqual({ author: "alice", permlink: "big-post", limit: 1000 });
    expect(calls[1].params).toEqual({
      author: "alice",
      permlink: "big-post",
      limit: 1000,
      start: "voter0999"
    });
    expect(votes).toHaveLength(1500);
    expect(new Set(votes.map((v) => v.voter)).size).toBe(1500);
  });

  // Review E: condenser_api.get_active_votes stops at 1000 (live: 1000 of
  // 1059), so a node without list_votes is paged through database_api.
  it("pages database_api.list_votes on a node without list_votes, never condenser", async () => {
    const ALL = Array.from({ length: 1059 }, (_, i) => ({
      voter: `voter${String(i).padStart(4, "0")}`,
      author: "alice",
      permlink: "big-post",
      rshares: 10 + i,
      vote_percent: 10000,
      weight: 5 + i,
      last_update: "2026-11-07T06:45:09",
      num_changes: 0,
    }));
    // The index is (author, permlink, voter): a seek past this post's last
    // voter lands on the next post's rows.
    const NEXT_POST = [{ ...ALL[0], permlink: "zz-next-post", voter: "aaa" }];
    const calls: Array<{ method: string; params: any }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      calls.push({ method: body.method, params: body.params });
      if (body.method === "bridge.list_votes") {
        return rpc(body.id, {
          error: { code: -32602, message: "Assert Exception:unknown method: bridge_apilist_votes" },
        });
      }
      if (body.method === "database_api.list_votes") {
        const [, , voter] = body.params.start;
        const from = voter ? ALL.findIndex((v) => v.voter === voter) : 0;
        return rpc(body.id, { result: { votes: [...ALL, ...NEXT_POST].slice(from, from + body.params.limit) } });
      }
      return rpc(body.id, { result: VOTES.slice(0, 1000) });
    });

    const votes = await new QueryClient().fetchQuery(getEntryActiveVotesQueryOptions(entry));

    expect(calls.map((c) => c.method)).toEqual([
      "bridge.list_votes",
      "database_api.list_votes",
      "database_api.list_votes",
    ]);
    expect(calls[1].params).toEqual({ start: ["alice", "big-post", ""], limit: 1000, order: "by_comment_voter" });
    // Inclusive start: the last voter of page 1 comes back first and is skipped.
    expect(calls[2].params).toEqual({
      start: ["alice", "big-post", "voter0999"],
      limit: 1000,
      order: "by_comment_voter",
    });
    expect(votes).toHaveLength(1059);
    expect(new Set(votes.map((v) => v.voter)).size).toBe(1059);
    expect(votes.some((v) => v.voter === "aaa")).toBe(false);
    expect(votes[5]).toEqual({
      voter: "voter0005",
      rshares: 15,
      percent: 10000,
      weight: 10,
      time: "2026-11-07T06:45:09",
    });
  });

  it("restarts from scratch when the method changes mid-pagination, never unions", async () => {
    config.nodes = ["https://new-votes.test", "https://old-votes.test"];
    const LV = Array.from({ length: 1500 }, (_, i) => ({ voter: `lv${i}`, rshares: 1, percent: 100, weight: 1, time: "t", reputation: 50 }));
    const DB = Array.from({ length: 1200 }, (_, i) => ({
      voter: `db${String(i).padStart(4, "0")}`, author: "alice", permlink: "big-post", rshares: 1, vote_percent: 100, weight: 1, last_update: "t",
    }));
    let newNodeCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      if (String(input).includes("new-votes")) {
        newNodeCalls++;
        // Serves page 1, then goes down.
        if (newNodeCalls > 1) return new Response("down", { status: 503 });
        return rpc(body.id, { result: LV.slice(0, 1000) });
      }
      if (body.method === "bridge.list_votes") {
        return rpc(body.id, {
          error: { code: -32602, message: "Assert Exception:unknown method: bridge_apilist_votes" },
        });
      }
      const [, , voter] = body.params.start;
      const from = voter ? DB.findIndex((v) => v.voter === voter) : 0;
      return rpc(body.id, { result: { votes: DB.slice(from, from + body.params.limit) } });
    });

    const votes = await new QueryClient().fetchQuery(getEntryActiveVotesQueryOptions(entry));

    expect(votes).toHaveLength(1200);
    expect(votes.every((v) => v.voter.startsWith("db"))).toBe(true);
  });

  it("stops when a page brings no new voter (a relay that answered the full list)", async () => {
    let n = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      n++;
      // Ignores `start` and returns everything, every time.
      return rpc(body.id, { result: VOTES });
    });

    const votes = await new QueryClient().fetchQuery(getEntryActiveVotesQueryOptions(entry));

    expect(votes).toHaveLength(1500);
    expect(n).toBe(2);
  });
});
