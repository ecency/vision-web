import { describe, it, expect, vi } from "vitest";
import { estimateRcPrecheck } from "./estimate-rc-precheck";
import type { RcResourceParams } from "../types/resource-params";
import type { RcStats } from "../types/stats";
import type { RCAccount } from "@/modules/core/hive-tx";

// calculateRCMana folds in time-based regen; stub it so the pure pre-check
// math is tested deterministically.
vi.mock("@/modules/core/hive-tx", () => ({
  calculateRCMana: (acc: any) => ({
    current_mana: Number(acc.rc_manabar.current_mana),
    max_mana: Number(acc.max_rc),
    percentage: 0
  })
}));

/** Live curve parameters and sizing constants, as returned by the node. */
const PARAMS: RcResourceParams = {
  resource_params: {
    resource_history_bytes: {
      resource_dynamics_params: { resource_unit: 1, budget_per_time_unit: 43403, pool_eq: 0, max_pool_size: 0 },
      price_curve_params: { coeff_a: "10525659774662010880", coeff_b: "211332338", shift: 50 }
    },
    resource_new_accounts: {
      resource_dynamics_params: { resource_unit: 10000, budget_per_time_unit: 797, pool_eq: 0, max_pool_size: 0 },
      price_curve_params: { coeff_a: "16484671763857882971", coeff_b: "1231961", shift: 51 }
    },
    resource_market_bytes: {
      resource_dynamics_params: { resource_unit: 10, budget_per_time_unit: 72338, pool_eq: 0, max_pool_size: 0 },
      price_curve_params: { coeff_a: "14969827235074865152", coeff_b: "15654337", shift: 55 }
    },
    resource_state_bytes: {
      resource_dynamics_params: { resource_unit: 1, budget_per_time_unit: 43546196, pool_eq: 0, max_pool_size: 0 },
      price_curve_params: { coeff_a: "10525659774662010880", coeff_b: "212030656091", shift: 50 }
    },
    resource_execution_time: {
      resource_dynamics_params: { resource_unit: 1, budget_per_time_unit: 40000000, pool_eq: 0, max_pool_size: 0 },
      price_curve_params: { coeff_a: "14969827235074865152", coeff_b: "541062725", shift: 59 }
    }
  },
  size_info: {
    resource_state_bytes: {
      comment_base_size: 4237056,
      comment_permlink_char_size: 168,
      comment_beneficiaries_member_size: 1344,
      vote_size: 24192,
      transaction_base_size: 128
    },
    resource_execution_time: {
      comment_time: 66178,
      comment_options_time: 6202,
      vote_time: 18312,
      transaction_time: 6622,
      verify_authority_time: 94165
    }
  }
};

/**
 * Every operation the node reports, zeroed. Spelled out rather than cast so a
 * change to the stats shape fails here instead of silently skipping a branch.
 */
const ZERO = { avg_cost: 0, count: 0 };
const ALL_OPS: RcStats["ops"] = {
  account_create_operation: ZERO,
  account_update2_operation: ZERO,
  account_update_operation: ZERO,
  account_witness_proxy_operation: ZERO,
  account_witness_vote_operation: ZERO,
  cancel_transfer_from_savings_operation: ZERO,
  change_recovery_account_operation: ZERO,
  claim_account_operation: ZERO,
  claim_reward_balance_operation: ZERO,
  collateralized_convert_operation: ZERO,
  comment_operation: ZERO,
  comment_options_operation: ZERO,
  convert_operation: ZERO,
  create_claimed_account_operation: ZERO,
  custom_json_operation: ZERO,
  delegate_vesting_shares_operation: ZERO,
  delete_comment_operation: ZERO,
  feed_publish_operation: ZERO,
  limit_order_cancel_operation: ZERO,
  limit_order_create_operation: ZERO,
  multiop: ZERO,
  recover_account_operation: ZERO,
  recurrent_transfer_operation: ZERO,
  request_account_recovery_operation: ZERO,
  set_withdraw_vesting_route_operation: ZERO,
  transfer_from_savings_operation: ZERO,
  transfer_operation: ZERO,
  transfer_to_savings_operation: ZERO,
  transfer_to_vesting_operation: ZERO,
  update_proposal_votes_operation: ZERO,
  vote_operation: ZERO,
  withdraw_vesting_operation: ZERO,
  witness_set_properties_operation: ZERO,
  witness_update_operation: ZERO
};

const stats = (ops: Partial<RcStats["ops"]> = {}): RcStats =>
  ({
    block: 0,
    budget: [],
    comment: 0,
    ops: {
      ...ALL_OPS,
      comment_operation: { avg_cost: 1224266459, count: 1 },
      vote_operation: { avg_cost: 99566347, count: 1 },
      ...ops
    },
    payers: [],
    pool: [24091156132, 16787104, 1980851228, 26129897630853, 66076533904],
    regen: 2403497928903,
    share: [5264, 10000, 533, 1843, 2357],
    stamp: "",
    transfer: 0,
    vote: 0
  });

const account = (mana: number): RCAccount =>
  ({
    account: "spacecop",
    rc_manabar: { current_mana: mana, last_update_time: 0 },
    max_rc_creation_adjustment: { amount: "0", precision: 6, nai: "@@000000021" },
    max_rc: mana * 2
  }) as RCAccount;

/** The post that was actually rejected on chain, needing 23.3B RC. */
const bigPost = {
  kind: "comment" as const,
  op: {
    author: "spacecop",
    permlink: "who-the-dhf-has-actually",
    parent_author: "",
    parent_permlink: "dhf",
    title: "Who the DHF has actually paid, 2019-2026",
    body: "x".repeat(46000),
    json_metadata: "{}"
  }
};

const shortReply = {
  kind: "comment" as const,
  op: {
    author: "spacecop",
    permlink: "re-something-20260814",
    parent_author: "alice",
    parent_permlink: "a-post",
    title: "",
    body: "nice post, thanks",
    json_metadata: "{}"
  }
};

describe("estimateRcPrecheck", () => {
  it("is not ready when inputs are missing", () => {
    const r = estimateRcPrecheck({
      rcAccount: undefined,
      rcStats: undefined,
      operation: "comment_operation"
    });
    expect(r.ready).toBe(false);
    expect(r.willLikelyFail).toBe(false);
  });

  it("is not ready without curve parameters, rather than guessing", () => {
    const r = estimateRcPrecheck({
      rcAccount: account(1e12),
      rcStats: stats(),
      operation: "comment_operation"
    });
    expect(r.ready).toBe(false);
    expect(r.willLikelyFail).toBe(false);
  });

  // The whole point of the rewrite: cost follows the actual payload rather
  // than a network average that is dominated by short replies.
  it("charges a long post far more than a short reply", () => {
    const common = {
      rcAccount: account(1e12),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation" as const
    };
    const big = estimateRcPrecheck({ ...common, payload: bigPost });
    const small = estimateRcPrecheck({ ...common, payload: shortReply });

    expect(big.cost).toBeGreaterThan(small.cost * 10);
    expect(big.transactionBytes).toBeGreaterThan(small.transactionBytes);
  });

  it("would have warned on the post the chain rejected", () => {
    const SPACECOP_MANA = 21319011516;
    const r = estimateRcPrecheck({
      rcAccount: account(SPACECOP_MANA),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation",
      payload: bigPost
    });

    expect(r.ready).toBe(true);
    expect(r.willLikelyFail).toBe(true);
    expect(r.deficit).toBeGreaterThan(0);
  });

  it("does not warn that same account off a short reply", () => {
    const r = estimateRcPrecheck({
      rcAccount: account(21319011516),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation",
      payload: shortReply
    });

    expect(r.willLikelyFail).toBe(false);
    expect(r.deficit).toBe(0);
  });

  it("prices a vote, which is fixed-size and much cheaper than a post", () => {
    const vote = estimateRcPrecheck({
      rcAccount: account(1e12),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "vote_operation",
      payload: { kind: "vote", op: { voter: "spacecop", author: "alice", permlink: "a-post" } }
    });
    const post = estimateRcPrecheck({
      rcAccount: account(1e12),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation",
      payload: bigPost
    });

    expect(vote.ready).toBe(true);
    expect(vote.cost).toBeGreaterThan(0);
    expect(vote.cost).toBeLessThan(post.cost);
  });

  it("falls back to a minimal operation when no payload is supplied", () => {
    const r = estimateRcPrecheck({
      rcAccount: account(1e12),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation"
    });

    expect(r.ready).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    // A lower bound: it must never exceed what a real post costs, so it can
    // miss a marginal case but never invent one.
    const withPayload = estimateRcPrecheck({
      rcAccount: account(1e12),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation",
      payload: bigPost
    });
    expect(r.cost).toBeLessThan(withPayload.cost);
  });

  it("applies the buffer to the computed cost", () => {
    const base = {
      rcAccount: account(1e12),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation" as const,
      payload: shortReply
    };
    const plain = estimateRcPrecheck({ ...base, buffer: 1 });
    const padded = estimateRcPrecheck({ ...base, buffer: 2 });

    expect(padded.estimatedCost).toBeCloseTo(plain.cost * 2, 0);
  });

  it("keeps avgCost as an alias of cost for existing callers", () => {
    const r = estimateRcPrecheck({
      rcAccount: account(1e12),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation",
      payload: shortReply
    });

    expect(r.avgCost).toBe(r.cost);
  });

  // Regression: the payload-priced rewrite only knows how to price comments and
  // votes, but the exported operation type advertises every key the node
  // reports. Returning a zero-cost "ready" for the rest turned every other
  // caller's pre-check into a silent all-clear.
  describe("operations it cannot price from a payload", () => {
    it("prices a transfer from the network average the node publishes", () => {
      const r = estimateRcPrecheck({
        rcAccount: account(1e12),
        rcStats: stats({ transfer_operation: { avg_cost: 500_000_000, count: 1 } }),
        rcParams: PARAMS,
        operation: "transfer_operation"
      });

      expect(r.ready).toBe(true);
      expect(r.cost).toBe(500_000_000);
      expect(r.remaining).toBe(2000);
    });

    it("still warns when that average exceeds the account's mana", () => {
      const r = estimateRcPrecheck({
        rcAccount: account(1e8),
        rcStats: stats({ transfer_operation: { avg_cost: 500_000_000, count: 1 } }),
        rcParams: PARAMS,
        operation: "transfer_operation"
      });

      expect(r.willLikelyFail).toBe(true);
      expect(r.deficit).toBeGreaterThan(0);
    });

    it("reports not ready, never a free all-clear, when there is no average", () => {
      const r = estimateRcPrecheck({
        rcAccount: account(1e12),
        rcStats: stats(),
        rcParams: PARAMS,
        operation: "custom_json_operation"
      });

      expect(r.ready).toBe(false);
      expect(r.willLikelyFail).toBe(false);
    });
  });

  describe("fallback when the caller has no payload", () => {
    const base = {
      rcAccount: account(21319011516),
      rcStats: stats(),
      rcParams: PARAMS,
      operation: "comment_operation" as const
    };

    it("defaults to the minimal operation, a lower bound that cannot invent a warning", () => {
      const r = estimateRcPrecheck(base);

      expect(r.cost).toBeLessThan(stats().ops.comment_operation.avg_cost);
      expect(r.willLikelyFail).toBe(false);
    });

    // The counts in the RC tooltip: an empty comment is not what "how many
    // posts can I afford" means, and pricing one flatters the number.
    it("prices the network average when asked for it", () => {
      const r = estimateRcPrecheck({ ...base, fallback: "average" });

      expect(r.cost).toBe(stats().ops.comment_operation.avg_cost);
      expect(r.remaining).toBe(17);
    });

    it("ignores the fallback once a real payload is supplied", () => {
      const r = estimateRcPrecheck({ ...base, fallback: "average", payload: bigPost });

      expect(r.cost).toBeGreaterThan(stats().ops.comment_operation.avg_cost * 10);
      expect(r.willLikelyFail).toBe(true);
    });
  });
});
