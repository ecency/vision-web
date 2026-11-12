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

describe("normalizeEntry (shape-driven, v1 or v2 in, one Entry out)", () => {
  it("gives the same Entry for a v1 response and a v2 response of one post", () => {
    const fromV1 = normalizeEntry(V1, "good-karma");
    const fromV2 = normalizeEntry(V2, "good-karma");

    // The observer's vote: v1 bridge votes carry no percent, so it is null
    // there and known from v2. Everything else must match exactly.
    expect(fromV1.observer_vote).toEqual({ rshares: 1335063516827, percent: null });
    expect(fromV2.observer_vote).toEqual({ rshares: 1335063516827, percent: 10000 });
    expect(fromV1.observer_vote_for).toBe("good-karma");
    expect(fromV2.observer_vote_for).toBe("good-karma");
    expect(fromV1.stats?.total_votes).toBe(3);
    expect(fromV2.stats?.total_votes).toBe(3);

    const strip = (e: any) => ({ ...e, observer_vote: { ...e.observer_vote, percent: "?" } });
    expect(strip(fromV1)).toEqual(strip(fromV2));
    expect(fromV1).not.toHaveProperty("active_votes");
  });

  it("records null, not a vote, when the observer did not vote", () => {
    expect(normalizeEntry(V1, "nobody").observer_vote).toBeNull();
    expect(normalizeEntry({ ...V2, observer_vote: null }, "nobody").observer_vote).toBeNull();
  });

  it("never attributes a vote to an empty observer", () => {
    const e = normalizeEntry(V1, "");
    expect(e.observer_vote).toBeNull();
    expect(e.observer_vote_for).toBe("");
  });

  it("leaves the vote unknown when v1 truncated the list before the observer", () => {
    // v1 caps active_votes at 1000: absence from a truncated list proves nothing.
    const votes = Array.from({ length: 1000 }, (_, i) => ({ voter: `v${i}`, rshares: 1 }));
    const e = normalizeEntry(
      { ...COMMON, stats: { ...COMMON.stats, total_votes: 1059 }, active_votes: votes },
      "late-voter"
    );
    expect(e.observer_vote).toBeUndefined();
    expect(e).not.toHaveProperty("observer_vote_for");
    expect(e.stats?.total_votes).toBe(1059);
  });

  it("leaves a row that carries neither field (esync, search) without an observer vote", () => {
    const e = normalizeEntry({ ...COMMON }, "bob");
    expect(e.observer_vote).toBeUndefined();
    expect(e).not.toHaveProperty("observer_vote_for");
  });

  it("counts from active_votes only when a v1 row has no stats", () => {
    const { stats: _s, ...noStats } = V1;
    expect(normalizeEntry(noStats, "x").stats?.total_votes).toBe(3);
  });

  it("keeps top_votes when the node sent them", () => {
    const top = [{ voter: "ecency", percent: 10000, rshares: 86769381212901 }];
    expect(normalizeEntry({ ...V2, top_votes: top }, "x").top_votes).toEqual(top);
  });

  it("is pure: the input is not mutated", () => {
    const input = JSON.parse(JSON.stringify(V1));
    normalizeEntry(input, "good-karma");
    expect(input).toEqual(V1);
  });
});
