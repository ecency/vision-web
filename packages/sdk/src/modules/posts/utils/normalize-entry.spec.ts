import { describe, expect, it } from "vitest";
import { normalizeEntry } from "./normalize-entry";

// One post as the two bridge generations return it (shapes captured from
// api.deathwing.me (v1) and api.hive.blog (v2) on 2026-11-12, trimmed).
const COMMON = {
  author: "ecency",
  permlink: "raidstead-season-1-59-alliances",
  category: "hive-125125",
  title: "Raidstead Season 1",
  body: "Season 1 of Raidstead is over.",
  created: "2026-11-07T06:45:03",
  updated: "2026-11-07T06:45:03",
  url: "/hive-125125/@ecency/raidstead-season-1-59-alliances",
  depth: 0,
  children: 14,
  reblogs: 18,
  replies: [],
  payout: 16.623,
  payout_at: "2026-11-14T06:45:03",
  is_paidout: false,
  net_rshares: 272596339864576,
  percent_hbd: 10000,
  author_reputation: 79.06,
  author_role: "admin",
  author_title: "",
  community: "hive-125125",
  community_title: "Town Square",
  beneficiaries: [],
  blacklists: [],
  json_metadata: { app: "ecency/4.4.3-vision", tags: ["hive-125125", "raidstead"] },
  stats: { gray: false, hide: false, flag_weight: 0, total_votes: 3 },
  author_payout_value: "0.000 HBD",
  curator_payout_value: "0.000 HBD",
  max_accepted_payout: "1000000.000 HBD",
  pending_payout_value: "16.623 HBD"
};

const V1 = {
  ...COMMON,
  active_votes: [
    { rshares: 28207623527688, voter: "adm" },
    { rshares: 1335063516827, voter: "good-karma" },
    { rshares: 32078372236, voter: "team" }
  ]
};

const V2 = {
  ...COMMON,
  observer_vote: { percent: 10000, rshares: 1335063516827 }
};

import { entryVoteOf, isCastVote, voteDirection } from "./normalize-entry";

const votes = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ voter: `v${from + i}`, rshares: 1 }));

describe("normalizeEntry (shape-driven, v1 or v2 in, one Entry out)", () => {
  it("gives the same Entry for a v1 response and a v2 response of one post", () => {
    const fromV1 = normalizeEntry(V1, "good-karma");
    const fromV2 = normalizeEntry(V2, "good-karma");

    // v1 bridge votes carry no percent, so it is null there and known from v2.
    expect(fromV1.observer_vote).toEqual({ rshares: 1335063516827, percent: null });
    expect(fromV2.observer_vote).toEqual({ rshares: 1335063516827, percent: 10000 });
    expect(fromV1.observer_vote_for).toBe("good-karma");
    expect(fromV2.observer_vote_for).toBe("good-karma");
    expect(fromV1.stats?.total_votes).toBe(3);
    expect(fromV2.stats?.total_votes).toBe(3);

    // top_votes: v2 sends them only when asked; v1 derives them from its list.
    const strip = (e: any) => {
      const { top_votes: _t, ...rest } = e;
      return { ...rest, observer_vote: { ...e.observer_vote, percent: "?" } };
    };
    expect(strip(fromV1)).toEqual(strip(fromV2));
    expect(fromV1).not.toHaveProperty("active_votes");
  });

  it("records null, not a vote, when the observer did not vote", () => {
    expect(normalizeEntry(V1, "nobody").observer_vote).toBeNull();
    expect(normalizeEntry(V1, "nobody").observer_vote_for).toBe("nobody");
    expect(normalizeEntry({ ...V2, observer_vote: null }, "nobody").observer_vote).toBeNull();
  });

  it("states unknown explicitly: observer_vote_for null, observer_vote null", () => {
    for (const e of [
      normalizeEntry(V1, ""),
      normalizeEntry({ ...V2, observer_vote: null }, ""),
      normalizeEntry({ ...COMMON }, "bob")
    ]) {
      expect(e).toHaveProperty("observer_vote_for", null);
      expect(e).toHaveProperty("observer_vote", null);
      // Present as keys, so a spread merge cannot refill them from older data.
      expect(Object.keys(e)).toEqual(expect.arrayContaining(["observer_vote", "observer_vote_for"]));
    }
  });

  it("treats a v1 list of exactly 1000 rows without the observer as unknown", () => {
    // stats.total_votes is not a row count (live: 206 rows, total 205), so the
    // list length alone decides whether the list may be cut off.
    const e = normalizeEntry({ ...COMMON, stats: { ...COMMON.stats, total_votes: 999 }, active_votes: votes(1000) }, "late");
    expect(e.observer_vote_for).toBeNull();
    expect(e.observer_vote).toBeNull();
  });

  it("trusts a v1 list of 999 rows: the observer did not vote", () => {
    const e = normalizeEntry({ ...COMMON, stats: { ...COMMON.stats, total_votes: 5000 }, active_votes: votes(999) }, "late");
    expect(e.observer_vote_for).toBe("late");
    expect(e.observer_vote).toBeNull();
  });

  it("finds the observer in a full 1000-row list", () => {
    const list = [...votes(999), { voter: "late", rshares: 9 }];
    const e = normalizeEntry({ ...COMMON, active_votes: list }, "late");
    expect(e.observer_vote).toEqual({ rshares: 9, percent: null });
  });

  it("counts from active_votes only when a v1 row has no stats and the list is not capped", () => {
    const { stats: _s, ...noStats } = V1;
    expect(normalizeEntry(noStats, "x").stats?.total_votes).toBe(3);
    const capped = normalizeEntry({ author: "a", permlink: "p", active_votes: votes(1000) }, "x");
    expect(capped).not.toHaveProperty("stats");
  });

  it("keeps top_votes from v2 and derives them from a v1 list", () => {
    const top = [{ voter: "ecency", percent: 10000, rshares: 86769381212901 }];
    expect(normalizeEntry({ ...V2, top_votes: top }, "x").top_votes).toEqual(top);

    const list = [
      { voter: "small", rshares: 5 },
      { voter: "flag", rshares: -900 },
      { voter: "b-tie", rshares: 100 },
      { voter: "a-tie", rshares: 100, percent: 5000 },
      ...votes(12, 100)
    ];
    const derived = normalizeEntry({ ...COMMON, active_votes: list }, "x").top_votes!;
    expect(derived).toHaveLength(10);
    expect(derived.slice(0, 4)).toEqual([
      { voter: "flag", rshares: -900, percent: null },
      { voter: "a-tie", rshares: 100, percent: 5000 },
      { voter: "b-tie", rshares: 100, percent: null },
      { voter: "small", rshares: 5, percent: null }
    ]);
  });

  it("reads a zero vote (percent 0, or rshares 0 without percent) as no vote", () => {
    expect(normalizeEntry({ ...V2, observer_vote: { rshares: 0, percent: 0 } }, "x").observer_vote).toBeNull();
    expect(
      normalizeEntry({ ...COMMON, active_votes: [{ voter: "x", rshares: 0 }] }, "x").observer_vote
    ).toBeNull();
  });

  it("never relabels an already normalized entry for another observer", () => {
    const alices = normalizeEntry(V2, "alice");
    const again = normalizeEntry(alices, "bob");
    expect(again.observer_vote_for).toBe("alice");
    expect(again.observer_vote).toEqual(alices.observer_vote);
    const unknown = normalizeEntry(normalizeEntry({ ...COMMON }, ""), "bob");
    expect(unknown.observer_vote_for).toBeNull();
  });

  it("is pure: the input is not mutated", () => {
    const input = JSON.parse(JSON.stringify(V1));
    normalizeEntry(input, "good-karma");
    expect(input).toEqual(V1);
  });
});

describe("entryVoteOf", () => {
  const alice = normalizeEntry(V2, "good-karma");
  it("answers only for the observer the entry was read for", () => {
    expect(entryVoteOf(alice, "good-karma")).toEqual({ rshares: 1335063516827, percent: 10000 });
    expect(entryVoteOf(alice, "someone-else")).toBeUndefined();
    expect(entryVoteOf(normalizeEntry(V1, "nobody"), "nobody")).toBeNull();
    expect(entryVoteOf(normalizeEntry({ ...COMMON }, ""), "nobody")).toBeUndefined();
  });
  it("does not read a raw voter list", () => {
    expect(entryVoteOf(V1 as any, "good-karma")).toBeUndefined();
  });
});

describe("voteDirection and isCastVote", () => {
  it("reads percent first, rshares only without it", () => {
    expect(voteDirection({ rshares: 10, percent: 10000 })).toBe("up");
    expect(voteDirection({ rshares: -10, percent: -5000 })).toBe("down");
    expect(voteDirection({ rshares: 0, percent: 0 })).toBeNull();
    expect(voteDirection({ rshares: 99, percent: 0 })).toBeNull();
    // v1 rows: rshares only.
    expect(voteDirection({ rshares: -3, percent: null })).toBe("down");
    expect(voteDirection({ rshares: 3, percent: null })).toBe("up");
    expect(voteDirection({ rshares: 0, percent: null })).toBeNull();
    expect(voteDirection(null)).toBeNull();
  });
  it("counts a vote with zero power but a weight as cast", () => {
    expect(isCastVote({ rshares: 0, percent: 10000 })).toBe(true);
    expect(isCastVote({ rshares: 0, percent: 0 })).toBe(false);
    expect(isCastVote({ rshares: 0, percent: null })).toBe(false);
    expect(isCastVote(null)).toBe(false);
  });
});
