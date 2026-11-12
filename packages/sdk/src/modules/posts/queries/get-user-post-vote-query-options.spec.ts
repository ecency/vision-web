import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCallRPC = vi.hoisted(() => vi.fn());
vi.mock("@/modules/core/hive-tx", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callRPC: mockCallRPC,
}));

import { getUserPostVoteQueryOptions } from "./get-user-post-vote-query-options";

// Review 9d: database_api.list_votes by_voter_comment is a lower-bound seek
// too: for a post the user did not vote on it returns the user's NEXT vote,
// or another voter's. Only a row matching all three fields is the vote.
const run = () => (getUserPostVoteQueryOptions("alice", "bob", "post").queryFn as any)();
const row = (over: Record<string, unknown> = {}) => ({
  voter: "alice", author: "bob", permlink: "post", rshares: 5, vote_percent: 10000, ...over,
});

describe("getUserPostVoteQueryOptions", () => {
  beforeEach(() => {
    mockCallRPC.mockReset();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled in this spec"));
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns the user's vote on the post", async () => {
    mockCallRPC.mockResolvedValue({ votes: [row()] });
    await expect(run()).resolves.toMatchObject({ voter: "alice", permlink: "post" });
  });

  it("returns null for the user's vote on another post", async () => {
    mockCallRPC.mockResolvedValue({ votes: [row({ permlink: "later-post" })] });
    await expect(run()).resolves.toBeNull();
    mockCallRPC.mockResolvedValue({ votes: [row({ author: "carol" })] });
    await expect(run()).resolves.toBeNull();
  });

  it("returns null for another voter's row", async () => {
    mockCallRPC.mockResolvedValue({ votes: [row({ voter: "alicia" })] });
    await expect(run()).resolves.toBeNull();
  });
});
