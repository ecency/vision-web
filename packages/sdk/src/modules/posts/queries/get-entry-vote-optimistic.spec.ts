import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ConfigManager, QueryKeys } from "@/modules/core";
import { config } from "@/hive-tx/config";
import { getEntryVoteQueryOptions, recordOptimisticVote } from "./get-entry-active-votes-query-options";

// Round 4, item 4: bridge and database reads lag the chain by a block or
// more. The lookup refetch the post-vote refresh triggers can say "no vote"
// before the vote is indexed, and that answer would stick for the query's
// staleTime. Within 60 s of a vote this client cast, a disagreeing answer
// keeps the optimistic vote and one more read follows ~15 s later.
const ORIGINAL_NODES = [...config.nodes];

function answerNoVote() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
    const body = JSON.parse(String(init.body));
    const out = body.map((r: any) => ({
      jsonrpc: "2.0",
      id: r.id,
      result: { votes: [{ voter: "zz-next", author: "bob", permlink: "p", rshares: 1, vote_percent: 100 }] },
    }));
    return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("getEntryVoteQueryOptions right after this client voted", () => {
  let qc: QueryClient;
  beforeEach(() => {
    config.nodes = ["https://lagging.test"];
    qc = new QueryClient();
    ConfigManager.setQueryClient(qc);
  });
  afterEach(() => {
    config.nodes = ORIGINAL_NODES;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the optimistic vote over a lagging 'no vote' and reads again ~15 s later", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answerNoVote();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    recordOptimisticVote("bob", "p", "alice", { rshares: 5000, percent: 5000 });

    const vote = await qc.fetchQuery(getEntryVoteQueryOptions("bob", "p", "alice"));
    expect(vote).toEqual({ rshares: 5000, percent: 5000 });

    expect(invalidate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: QueryKeys.posts.entryVote("bob", "p", "alice") });
  });

  it("trusts the chain once 60 s have passed", async () => {
    answerNoVote();
    const t0 = Date.now();
    recordOptimisticVote("bob", "p", "carol", { rshares: 5000, percent: 5000 });
    vi.spyOn(Date, "now").mockReturnValue(t0 + 61_000);
    const vote = await qc.fetchQuery(getEntryVoteQueryOptions("bob", "p", "carol"));
    expect(vote).toBeNull();
  });

  it("does not hold anything for a lookup this client did not vote on", async () => {
    answerNoVote();
    const vote = await qc.fetchQuery(getEntryVoteQueryOptions("bob", "p", "dave"));
    expect(vote).toBeNull();
  });
});
