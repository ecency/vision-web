import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { QueryKeys } from "@/modules/core";
import { applyVoteCacheUpdate, isVoteAlreadyReflected } from "./use-vote";

describe("isVoteAlreadyReflected", () => {
  const votes = [{ voter: "alice" }, { voter: "bob" }];

  it("is false for a fresh vote when the voter is not in active_votes", () => {
    expect(isVoteAlreadyReflected(votes, "carol", 10000)).toBe(false);
  });

  it("is true for a vote when the voter is already in active_votes (platform optimistic layer applied it)", () => {
    expect(isVoteAlreadyReflected(votes, "alice", 10000)).toBe(true);
  });

  it("is true for a downvote when the voter is already in active_votes", () => {
    expect(isVoteAlreadyReflected(votes, "alice", -10000)).toBe(true);
  });

  it("is false for an unvote when the voter is still in active_votes", () => {
    expect(isVoteAlreadyReflected(votes, "bob", 0)).toBe(false);
  });

  it("is true for an unvote when the voter is already removed", () => {
    expect(isVoteAlreadyReflected(votes, "carol", 0)).toBe(true);
  });

  it("is false for a fresh vote on an entry with no votes yet", () => {
    expect(isVoteAlreadyReflected([], "carol", 10000)).toBe(false);
  });
});

interface SeededEntry {
  author: string;
  permlink: string;
  payout: number;
  active_votes: Array<{ voter: string; rshares: number }>;
  stats: { gray: boolean; hide: boolean; flag_weight: number; total_votes: number };
  total_votes?: number;
}

describe("applyVoteCacheUpdate", () => {
  const entryKey = QueryKeys.posts.entry("/@alice/my-post");

  const seedEntry = (activeVotes: Array<{ voter: string; rshares: number }>) => {
    const qc = new QueryClient();
    const entry: SeededEntry = {
      author: "alice",
      permlink: "my-post",
      payout: 1,
      active_votes: activeVotes,
      stats: { gray: false, hide: false, flag_weight: 0, total_votes: activeVotes.length },
    };
    qc.setQueryData(entryKey, entry);
    return { qc, entry };
  };

  it("applies votes and payout for a fresh vote (voter not in active_votes)", () => {
    const { qc } = seedEntry([{ voter: "bob", rshares: 100 }]);

    applyVoteCacheUpdate("carol", { author: "alice", permlink: "my-post", weight: 10000, estimated: 2 }, qc);

    const updated = qc.getQueryData<SeededEntry>(entryKey)!;
    expect(updated.active_votes).toEqual([
      { voter: "bob", rshares: 100 },
      { rshares: 10000, voter: "carol" },
    ]);
    expect(updated.payout).toBe(3);
    expect(updated.total_votes).toBe(2);
  });

  it("skips the write when the voter is already in active_votes (platform layer applied it)", () => {
    const { qc, entry } = seedEntry([{ voter: "carol", rshares: 100 }]);

    applyVoteCacheUpdate("carol", { author: "alice", permlink: "my-post", weight: 10000, estimated: 2 }, qc);

    // Same object reference: no cache write happened at all.
    expect(qc.getQueryData(entryKey)).toBe(entry);
  });

  it("applies an unvote when the voter is still in active_votes", () => {
    const { qc } = seedEntry([
      { voter: "bob", rshares: 100 },
      { voter: "carol", rshares: 200 },
    ]);

    applyVoteCacheUpdate("carol", { author: "alice", permlink: "my-post", weight: 0, estimated: 0 }, qc);

    const updated = qc.getQueryData<SeededEntry>(entryKey)!;
    expect(updated.active_votes).toEqual([{ voter: "bob", rshares: 100 }]);
    expect(updated.total_votes).toBe(1);
  });

  it("skips the write for an unvote when the voter is already removed", () => {
    const { qc, entry } = seedEntry([{ voter: "bob", rshares: 100 }]);

    applyVoteCacheUpdate("carol", { author: "alice", permlink: "my-post", weight: 0, estimated: 0 }, qc);

    expect(qc.getQueryData(entryKey)).toBe(entry);
  });

  it("does nothing when the entry is not cached or lacks active_votes", () => {
    const qc = new QueryClient();
    expect(() =>
      applyVoteCacheUpdate("carol", { author: "alice", permlink: "my-post", weight: 10000 }, qc)
    ).not.toThrow();
    expect(qc.getQueryData(entryKey)).toBeUndefined();

    qc.setQueryData(entryKey, { author: "alice", permlink: "my-post", payout: 1 });
    const before = qc.getQueryData(entryKey);
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "my-post", weight: 10000 }, qc);
    expect(qc.getQueryData(entryKey)).toBe(before);
  });
});

// Issue #2056: v2 entries carry the observer's own vote instead of a voter list.
describe("applyVoteCacheUpdate on a v2 entry (observer_vote)", () => {
  const entryKey = QueryKeys.posts.entry("/@alice/v2-post");
  const seed = (fields: Record<string, unknown>) => {
    const qc = new QueryClient();
    const entry = {
      author: "alice",
      permlink: "v2-post",
      payout: 1,
      stats: { gray: false, hide: false, flag_weight: 0, total_votes: 1500 },
      ...fields,
    };
    qc.setQueryData(entryKey, entry);
    return { qc, entry };
  };

  it("sets observer_vote and adds one vote when carol had not voted", () => {
    const { qc } = seed({ observer_vote: null, observer_vote_for: "carol" });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "v2-post", weight: 5000, estimated: 2 }, qc);
    const e = qc.getQueryData<any>(entryKey);
    expect(e.observer_vote).toEqual({ rshares: 5000, percent: 5000 });
    expect(e.observer_vote_for).toBe("carol");
    expect(e.stats.total_votes).toBe(1501);
    expect(e.payout).toBe(3);
    expect(e).not.toHaveProperty("active_votes");
  });

  it("keeps the count on a re-vote with a new weight", () => {
    const { qc } = seed({ observer_vote: { rshares: 9, percent: 10000 }, observer_vote_for: "carol" });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "v2-post", weight: 5000, estimated: 0 }, qc);
    const e = qc.getQueryData<any>(entryKey);
    expect(e.observer_vote.percent).toBe(5000);
    expect(e.stats.total_votes).toBe(1500);
  });

  it("skips the write when the platform layer already set this vote", () => {
    const { qc, entry } = seed({ observer_vote: { rshares: 5000, percent: 5000 }, observer_vote_for: "carol" });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "v2-post", weight: 5000, estimated: 2 }, qc);
    expect(qc.getQueryData(entryKey)).toBe(entry);
  });

  it("removes the vote and the count on an unvote", () => {
    const { qc } = seed({ observer_vote: { rshares: 9, percent: 10000 }, observer_vote_for: "carol" });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "v2-post", weight: 0, estimated: 0 }, qc);
    const e = qc.getQueryData<any>(entryKey);
    expect(e.observer_vote).toBeNull();
    expect(e.stats.total_votes).toBe(1499);
  });

  it("uses the looked-up vote when the entry was read for another observer", () => {
    const { qc } = seed({ observer_vote: { rshares: 7, percent: 10000 }, observer_vote_for: "ecency" });
    qc.setQueryData(QueryKeys.posts.entryVote("alice", "v2-post", "carol"), { rshares: 3, percent: 2500 });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "v2-post", weight: 5000, estimated: 0 }, qc);
    const e = qc.getQueryData<any>(entryKey);
    expect(e.observer_vote_for).toBe("carol");
    expect(e.observer_vote.percent).toBe(5000);
    // carol had voted already: a re-vote, not a new vote.
    expect(e.stats.total_votes).toBe(1500);
    expect(qc.getQueryData(QueryKeys.posts.entryVote("alice", "v2-post", "carol"))).toEqual({
      rshares: 5000,
      percent: 5000,
    });
  });
});
