import { describe, it, expect, vi } from "vitest";

// The global @/utils mock only exposes random + getAccessToken; the helper needs
// the real parseAsset to sum the payout strings carried by feed entries.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

import { deriveOptimisticVote, entryVoteCount } from "@/api/mutations/derive-optimistic-vote";
import { Entry } from "@/entities";

const UP = 10000;

// A lightweight unified-waves-feed row: a net_votes count, payout strings, and
// NO active_votes array / stats object (this is what regressed the optimistic
// update).
function feedWave(overrides: Partial<Entry> = {}): Entry {
  return {
    author: "alice",
    permlink: "wave-1",
    net_votes: 5,
    pending_payout_value: "0.000 HBD",
    author_payout_value: "0.000 HBD",
    curator_payout_value: "0.000 HBD",
    ...overrides
  } as Entry;
}

// A normalized bridge entry read for bob, who voted, plus a numeric payout.
function fullEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    author: "alice",
    permlink: "post-1",
    observer_vote: { rshares: 100, percent: 10000 },
    observer_vote_for: "bob",
    stats: { total_votes: 2, flag_weight: 0, gray: false, hide: false },
    payout: 3,
    pending_payout_value: "3.000 HBD",
    author_payout_value: "0.000 HBD",
    curator_payout_value: "0.000 HBD",
    ...overrides
  } as Entry;
}

describe("deriveOptimisticVote", () => {
  // Regression: feed waves carry no active_votes, so the optimistic count/payout
  // bump used to be skipped entirely. It must now increment net_votes and payout.
  it("increments count and payout for a feed wave with no active_votes", () => {
    const result = deriveOptimisticVote(
      feedWave(),
      UP,
      0.012,
      "dave"
    );

    expect(result.nextVoteCount).toBe(6); // net_votes 5 -> 6
    expect(result.nextPayout).toBeCloseTo(0.012, 6); // 0 summed strings + estimated
    // No voter list: the result carries the user's vote, never a list.
    expect(result).not.toHaveProperty("newVotes");
    expect(result.observerVote).toEqual({ rshares: null, percent: UP });
  });

  it("sums the existing payout strings of a feed wave as the base payout", () => {
    const { nextPayout } = deriveOptimisticVote(
      feedWave({ pending_payout_value: "1.500 HBD" }),
      UP,
      0.25,
      "dave"
    );
    expect(nextPayout).toBeCloseTo(1.75, 6);
  });

  it("bumps count/payout for a fresh voter on a full entry", () => {
    // dave: the entry was read for bob, and dave's lookup said "not voted".
    const { observerVote, nextVoteCount, nextPayout } = deriveOptimisticVote(
      fullEntry(),
      UP,
      0.5,
      "dave",
      null
    );

    expect(nextVoteCount).toBe(3); // 2 -> 3
    expect(observerVote).toEqual({ rshares: null, percent: UP });
    expect(nextPayout).toBeCloseTo(3.5, 6); // numeric payout 3 + estimated
  });

  it("does not double-count when the user re-votes (already voted)", () => {
    const { nextVoteCount } = deriveOptimisticVote(fullEntry(), UP, 0.1, "bob");
    expect(nextVoteCount).toBe(2); // unchanged
  });

  it("decrements count when removing a vote (weight 0)", () => {
    const { observerVote, nextVoteCount } = deriveOptimisticVote(fullEntry(), 0, 0, "bob");
    expect(nextVoteCount).toBe(1); // 2 -> 1
    expect(observerVote).toBeNull();
  });

  it("leaves count unchanged when removing a vote on a feed wave (unknown prior vote)", () => {
    const { nextVoteCount } = deriveOptimisticVote(feedWave(), 0, 0, "dave");
    expect(nextVoteCount).toBe(5); // can't decrement without an active_votes list
  });
});

// Issue #2056: bridge v2 entries carry no voter list, only the observer's vote.
describe("deriveOptimisticVote on a v2 entry", () => {
  function v2Entry(overrides: Partial<Entry> = {}): Entry {
    return {
      author: "alice",
      permlink: "v2-post",
      stats: { total_votes: 1500, flag_weight: 0, gray: false, hide: false },
      observer_vote: null,
      observer_vote_for: "dave",
      payout: 3,
      pending_payout_value: "3.000 HBD",
      author_payout_value: "0.000 HBD",
      curator_payout_value: "0.000 HBD",
      ...overrides
    } as Entry;
  }

  it("sets observer_vote and adds one vote", () => {
    const r = deriveOptimisticVote(v2Entry(), UP, 0.5, "dave");
    expect(r.observerVote).toEqual({ rshares: null, percent: UP });
    expect(r.nextVoteCount).toBe(1501);
    expect(r.nextPayout).toBeCloseTo(3.5, 6);
    expect(r).not.toHaveProperty("newVotes");
  });

  it("does not change the count on a re-vote", () => {
    const r = deriveOptimisticVote(
      v2Entry({ observer_vote: { rshares: 10, percent: 10000 } }),
      5000,
      0,
      "dave"
    );
    expect(r.observerVote).toEqual({ rshares: null, percent: 5000 });
    expect(r.nextVoteCount).toBe(1500);
  });

  it("removes the vote and one from the count on an unvote", () => {
    const r = deriveOptimisticVote(
      v2Entry({ observer_vote: { rshares: 10, percent: 10000 } }),
      0,
      0,
      "dave"
    );
    expect(r.observerVote).toBeNull();
    expect(r.nextVoteCount).toBe(1499);
  });

  it("uses the looked-up prior vote when the entry was read for another observer", () => {
    const readForEcency = v2Entry({
      observer_vote: { rshares: 7, percent: 10000 },
      observer_vote_for: "ecency"
    });
    // ecency's vote is not dave's: with no prior known, a fresh vote counts.
    expect(deriveOptimisticVote(readForEcency, UP, 0, "dave", null).nextVoteCount).toBe(1501);
    // dave had voted (lookup): a re-vote.
    expect(
      deriveOptimisticVote(readForEcency, UP, 0, "dave", { rshares: 1, percent: 2000 }).nextVoteCount
    ).toBe(1500);
  });
});

// Review L: one rule for "had a vote": percent 0 (or rshares 0 without a
// percent) is no vote, wherever the prior comes from.
describe("deriveOptimisticVote: a zero prior vote is no vote", () => {
  const unknownEntry = {
    author: "alice",
    permlink: "z",
    stats: { total_votes: 10, flag_weight: 0, gray: false, hide: false },
    observer_vote: null,
    observer_vote_for: null,
    payout: 0
  } as unknown as Entry;

  it("adds one vote over a looked-up percent-0 prior", () => {
    expect(deriveOptimisticVote(unknownEntry, UP, 0, "dave", { rshares: 0, percent: 0 }).nextVoteCount).toBe(11);
  });

  it("adds one vote over an rshares-0 prior without a percent", () => {
    expect(deriveOptimisticVote(unknownEntry, UP, 0, "dave", { rshares: 0, percent: null }).nextVoteCount).toBe(11);
  });

  it("does not subtract for an unvote over a percent-0 prior", () => {
    expect(deriveOptimisticVote(unknownEntry, 0, 0, "dave", { rshares: 0, percent: 0 }).nextVoteCount).toBe(10);
  });

  // stats.total_votes is authoritative: 0 is a count, never "absent", so a
  // positive legacy count (net_votes / total_votes) must not be the base.
  it("starts from an authoritative zero stats.total_votes over a legacy count", () => {
    const entry = feedWave({
      stats: { total_votes: 0, flag_weight: 0, gray: false, hide: false },
      net_votes: 7,
      total_votes: 7
    } as Partial<Entry>);
    expect(deriveOptimisticVote(entry, UP, 0, "dave", null).nextVoteCount).toBe(1);
  });

  it("unvotes from an authoritative zero without using the legacy count", () => {
    const entry = feedWave({
      stats: { total_votes: 0, flag_weight: 0, gray: false, hide: false },
      net_votes: 7
    } as Partial<Entry>);
    expect(
      deriveOptimisticVote(entry, 0, 0, "dave", { rshares: 100, percent: UP }).nextVoteCount
    ).toBe(0);
  });
});

describe("entryVoteCount", () => {
  it("keeps an authoritative zero", () => {
    expect(
      entryVoteCount({ stats: { total_votes: 0 }, net_votes: 7, total_votes: 7 } as unknown as Entry)
    ).toBe(0);
  });

  it("falls back to the legacy counts only without a stats count", () => {
    expect(entryVoteCount({ net_votes: 5 } as Entry)).toBe(5);
    expect(entryVoteCount({ total_votes: 4 } as unknown as Entry)).toBe(4);
    expect(entryVoteCount({ active_votes: [{}, {}, {}], net_votes: 9 } as unknown as Entry)).toBe(3);
    expect(entryVoteCount(undefined)).toBe(0);
    // stats without a count is not a count: fall back.
    expect(entryVoteCount({ stats: {}, net_votes: 5 } as unknown as Entry)).toBe(5);
  });
});
