import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { QueryKeys } from "@/modules/core";
import { applyVoteCacheUpdate, voteInvalidationKeys } from "./use-vote";
import { normalizeEntry } from "../utils/normalize-entry";

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
    // No fabricated rshares: the node has not computed them yet.
    expect(e.observer_vote).toEqual({ rshares: null, percent: 5000 });
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
    const { qc, entry } = seed({ observer_vote: { rshares: null, percent: 5000 }, observer_vote_for: "carol" });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "v2-post", weight: 5000, estimated: 2 }, qc);
    expect(qc.getQueryData(entryKey)).toBe(entry);
  });

  // Issue #2070: hivemind keeps a removed vote as a percent-0 row and
  // stats.total_votes keeps counting it, so an unvote leaves the count alone.
  it("removes the vote but keeps the count on an unvote", () => {
    const { qc } = seed({ observer_vote: { rshares: 9, percent: 10000 }, observer_vote_for: "carol" });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "v2-post", weight: 0, estimated: 0 }, qc);
    const e = qc.getQueryData<any>(entryKey);
    expect(e.observer_vote).toEqual({ rshares: 0, percent: 0 });
    expect(e.stats.total_votes).toBe(1500);
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
      rshares: null,
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

  // Issue #2070: a percent-0 prior is a removed vote whose row hivemind still
  // counts in stats.total_votes, so voting again does not add one.
  it("keeps the count when re-voting over the entry's percent-0 row", () => {
    const { qc } = seed({ ...base, observer_vote: { rshares: 0, percent: 0 }, observer_vote_for: "carol" });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "edge-post", weight: 10000, estimated: 0 }, qc);
    const e = qc.getQueryData<any>(entryKey);
    expect(e.observer_vote).toEqual({ rshares: null, percent: 10000 });
    expect(e.stats.total_votes).toBe(10);
  });

  it("keeps the count when re-voting over a looked-up percent-0 row", () => {
    const { qc } = seed({ ...base, observer_vote: null, observer_vote_for: null });
    qc.setQueryData(QueryKeys.posts.entryVote("alice", "edge-post", "carol"), { rshares: 0, percent: 0 });
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "edge-post", weight: 10000, estimated: 0 }, qc);
    expect(qc.getQueryData<any>(entryKey).stats.total_votes).toBe(10);
  });

  it("adds one when the voter is known never to have voted (observer_vote null)", () => {
    const { qc } = seed({ ...base, observer_vote: null, observer_vote_for: "carol" });
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

// Issue #2070: hivemind keeps a vote row once cast. Through the real
// normalizer, a removed vote stays a percent-0 row and the count follows chain.
describe("applyVoteCacheUpdate: removed votes keep their row", () => {
  const entryKey = QueryKeys.posts.entry("/@alice/row-post");
  const raw = (fields: Record<string, unknown>) => ({
    author: "alice",
    permlink: "row-post",
    payout: 1,
    ...fields,
  });
  const vote = (qc: QueryClient, weight: number) =>
    applyVoteCacheUpdate("carol", { author: "alice", permlink: "row-post", weight, estimated: 0 }, qc);
  const count = (qc: QueryClient) => qc.getQueryData<any>(entryKey).stats.total_votes;

  it("keeps the count on a revote over a normalized percent-0 row", () => {
    const qc = new QueryClient();
    const entry = normalizeEntry(
      raw({
        observer_vote: { rshares: 0, percent: 0 },
        stats: { gray: false, hide: false, flag_weight: 0, total_votes: 1 },
      }),
      "carol"
    );
    qc.setQueryData(entryKey, entry);
    vote(qc, 10000);
    expect(count(qc)).toBe(1);
    expect(qc.getQueryData<any>(entryKey).observer_vote).toEqual({ rshares: null, percent: 10000 });
  });

  it("follows the chain through vote, unvote, revote, unvote, flag from 0", () => {
    const qc = new QueryClient();
    const entry = normalizeEntry(
      raw({ observer_vote: null, stats: { gray: false, hide: false, flag_weight: 0, total_votes: 0 } }),
      "carol"
    );
    qc.setQueryData(entryKey, entry);
    const seen = [10000, 0, 10000, 0, -10000].map((w) => {
      vote(qc, w);
      return count(qc);
    });
    expect(seen).toEqual([1, 1, 1, 1, 1]);
    // The unvote leaves the row, not "never voted".
    vote(qc, 0);
    expect(qc.getQueryData<any>(entryKey).observer_vote).toEqual({ rshares: 0, percent: 0 });
  });
});

// Review 5: the deferred post-vote refresh also drops the voter's looked-up
// vote, so a lookup made before the vote does not outlive the chain state.
describe("voteInvalidationKeys", () => {
  it("covers the entry, the voter's account and the voter's own vote lookup", () => {
    expect(voteInvalidationKeys("carol", { author: "alice", permlink: "p", weight: 1 })).toEqual([
      QueryKeys.posts.entry("/@alice/p"),
      QueryKeys.accounts.full("carol"),
      QueryKeys.posts.entryVote("alice", "p", "carol"),
      // PR review, item 7: the votes dialog's full voter list.
      QueryKeys.posts.entryActiveVotes("alice", "p"),
    ]);
  });
});
