import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const { mockCallRPC, mockFallback } = vi.hoisted(() => ({ mockCallRPC: vi.fn(), mockFallback: vi.fn() }));
vi.mock("@/modules/core/hive-tx", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callRPC: mockCallRPC,
  callRPCWithFallback: mockFallback,
}));

import { CONFIG } from "@/modules/core/config";
import { getAccountVoteHistoryInfiniteQueryOptions } from "./get-account-vote-history-infinite-query-options";

// Issue #2056: posts read through bridge v2 carry no active_votes. The vote
// history used that field to recognise a post and so listed nothing.
describe("getAccountVoteHistoryInfiniteQueryOptions with v2 posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (CONFIG as any).queryClient = new QueryClient();
  });

  it("lists a voted post that has observer_vote and no active_votes", async () => {
    const now = new Date().toISOString().slice(0, 19);
    mockCallRPC.mockResolvedValue([
      [7, { timestamp: now, op: ["vote", { voter: "carol", author: "alice", permlink: "p", weight: 10000 }] }],
    ]);
    mockFallback.mockResolvedValue({
      result: {
        author: "alice",
        permlink: "p",
        stats: { total_votes: 2, gray: false, hide: false, flag_weight: 0 },
        observer_vote: null,
      },
      method: "bridge.get_post_v2",
    });

    const options = getAccountVoteHistoryInfiniteQueryOptions("carol");
    const page = await (options.queryFn as any)({ pageParam: { start: -1 } });

    expect(page.entries.map((e: any) => `${e.author}/${e.permlink}`)).toEqual(["alice/p"]);
  });
});
