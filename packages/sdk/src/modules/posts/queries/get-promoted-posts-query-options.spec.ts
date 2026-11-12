import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigManager } from "@/modules/core";
import { getPromotedPostsQuery } from "./get-promoted-posts-query-options";

// Review D(b): /private-api/promoted-entries rows still carry raw active_votes.
describe("getPromotedPostsQuery", () => {
  afterEach(() => vi.restoreAllMocks());
  it("normalizes every row: no voter list, the vote stated as unknown", async () => {
    ConfigManager.setPrivateApiHost("https://ecency.example");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { author: "a", permlink: "p", stats: { total_votes: 2 }, active_votes: [{ voter: "x", rshares: 1 }, { voter: "y", rshares: 2 }] },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const rows = (await (getPromotedPostsQuery().queryFn as any)()) as any[];
    expect(rows[0]).not.toHaveProperty("active_votes");
    expect(rows[0].observer_vote_for).toBeNull();
    expect(rows[0].stats.total_votes).toBe(2);
  });
});
