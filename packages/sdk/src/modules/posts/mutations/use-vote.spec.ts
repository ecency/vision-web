import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { QueryKeys } from "@/modules/core";
import { applyVoteCacheUpdate } from "./use-vote";

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

// Review L and M.
describe("applyVoteCacheUpdate: zero votes and lightweight rows", () => {
  const entryKey = QueryKeys.posts.entry("/@alice/edge-post");
  const seed = (fields: Record<string, unknown>) => {
    const qc = new QueryClient();
    const entry = { author: "alice", permlink: "edge-post", ...fields };
    qc.setQueryData(entryKey, entry);
    return { qc, entry };
  };
  const base = { payout: 1, stats: { gray: false, hide: false, flag_weight: 0, total_votes: 10 } };

  it("counts a prior vote of percent 0 as no vote (entry)", () => {
    const { qc } = seed({ ...base, observer_vote: { rshares: 0, percent: 0 }, observer_vote_for: "carol" });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "edge-post", weight: 10000, estimated: 0 }, qc);
    expect(qc.getQueryData<any>(entryKey).stats.total_votes).toBe(11);
  });

  it("counts a looked-up prior vote of percent 0 as no vote", () => {
    const { qc } = seed({ ...base, observer_vote: null, observer_vote_for: null });
    qc.setQueryData(QueryKeys.posts.entryVote("alice", "edge-post", "carol"), { rshares: 0, percent: 0 });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "edge-post", weight: 10000, estimated: 0 }, qc);
    expect(qc.getQueryData<any>(entryKey).stats.total_votes).toBe(11);
  });

  it("leaves a lightweight row (net_votes only, payout strings) alone", () => {
    const { qc, entry } = seed({
      net_votes: 5,
      pending_payout_value: "1.000 HBD",
      observer_vote: null,
      observer_vote_for: "carol",
    });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "edge-post", weight: 10000, estimated: 2 }, qc);
    expect(qc.getQueryData(entryKey)).toBe(entry);
  });
});
