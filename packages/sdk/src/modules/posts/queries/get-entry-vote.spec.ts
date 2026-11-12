import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const mockBatch = vi.hoisted(() => vi.fn());
vi.mock("@/modules/core/hive-tx", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callRPCBatch: mockBatch,
}));

import { getEntryVote } from "./get-entry-active-votes-query-options";

// Review C: database_api.list_votes is a lower-bound seek. For an account that
// did not vote it returns the NEXT row in (author, permlink, voter) order
// (live: `hiveio` on ecency/comments-are-the-most-underrated came back as
// hivewatchers' 5500), so the identity check is the whole guard.
const row = (over: Record<string, unknown> = {}) => ({
  voter: "alice",
  author: "bob",
  permlink: "post",
  rshares: 120,
  vote_percent: 5500,
  weight: 1,
  last_update: "2026-11-07T00:00:00",
  ...over,
});

function answer(votes: unknown[]) {
  mockBatch.mockImplementation(async (calls: unknown[]) => calls.map(() => ({ result: { votes } })));
}

describe("getEntryVote", () => {
  beforeEach(() => {
    mockBatch.mockReset();
    // Only the batch transport is under test: nothing may reach a real node.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled in this spec"));
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns the account's own vote", async () => {
    answer([row()]);
    await expect(getEntryVote("bob", "post", "alice")).resolves.toEqual({ rshares: 120, percent: 5500 });
  });

  it("returns null when the seek lands on the next voter", async () => {
    answer([row({ voter: "hivewatchers" })]);
    await expect(getEntryVote("bob", "post", "alice")).resolves.toBeNull();
  });

  it("returns null when the seek lands on another post", async () => {
    answer([row({ permlink: "post-2" })]);
    await expect(getEntryVote("bob", "post", "alice")).resolves.toBeNull();
    answer([row({ author: "bobby" })]);
    await expect(getEntryVote("bob", "post", "alice")).resolves.toBeNull();
  });

  it("returns null for a removed vote (percent 0)", async () => {
    answer([row({ vote_percent: 0, rshares: 0 })]);
    await expect(getEntryVote("bob", "post", "alice")).resolves.toBeNull();
  });

  it("returns null when nothing follows", async () => {
    answer([]);
    await expect(getEntryVote("bob", "post", "alice")).resolves.toBeNull();
  });

  it("rejects when the node answers that request with an error", async () => {
    mockBatch.mockImplementation(async (calls: unknown[]) =>
      calls.map(() => ({ error: new Error("Assert Exception:boom") }))
    );
    await expect(getEntryVote("bob", "post", "alice")).rejects.toThrow("boom");
  });
});
