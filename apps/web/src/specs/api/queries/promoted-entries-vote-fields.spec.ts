import { describe, expect, it, vi } from "vitest";

// Review D(b): /private-api/promoted-entries rows still carry the raw voter
// list. Every source goes through normalizeEntry, so no raw list reaches a
// card, and the vote is stated as unknown (looked up) instead.
const get = vi.hoisted(() => vi.fn());
vi.mock("@/api/axios", () => ({ appAxios: { get } }));

import { getPromotedEntriesInfiniteQuery } from "@/api/queries/get-account-posts-feed-query";

describe("promoted entries", () => {
  it("normalizes the rows: no voter list, the vote unknown", async () => {
    get.mockResolvedValue({
      data: [
        {
          author: "a",
          permlink: "p",
          title: "t",
          body: "b",
          json_metadata: {},
          stats: { total_votes: 2, flag_weight: 0, gray: false, hide: false },
          active_votes: [
            { voter: "x", rshares: 1 },
            { voter: "alice", rshares: 2 }
          ]
        }
      ]
    });
    const rows = await (getPromotedEntriesInfiniteQuery().queryFn as any)({ pageParam: "empty" });
    expect(rows[0]).not.toHaveProperty("active_votes");
    expect(rows[0].observer_vote_for).toBeNull();
    expect(rows[0].observer_vote).toBeNull();
    expect(rows[0].stats.total_votes).toBe(2);
  });
});
