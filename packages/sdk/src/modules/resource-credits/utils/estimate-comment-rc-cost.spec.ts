import { describe, expect, it } from "vitest";
import {
  computeResourceCost,
  countCommentResourceUsage,
  estimateCommentRcCost,
  estimateCommentTransactionBytes
} from "./estimate-comment-rc-cost";
import type { RcResourceParams } from "../types/resource-params";

/**
 * Ground truth captured from a real rejection on 2026-08-14. The node logs
 * usage and cost per resource in `tx_info` when it refuses a transaction, so
 * this fixture pins the port to numbers the chain itself produced:
 *
 *   Account: spacecop has 21319011516 RC, needs 23338899909 RC
 *   cost:  [22650133776, 0, 0, 650978626, 37787507]
 *   usage: [46620,       0, 0, 4241216,   166965  ]
 */
const REJECTION = {
  permlink: "who-the-dhf-has-actually",
  transactionBytes: 46620,
  signatures: 1,
  usage: { history: 46620, state: 4241216, execution: 166965 },
  cost: { history: 22650133776, state: 650978626, execution: 37787507, total: 23338899909 },
  poolAtTx: [24091156132, 16787104, 1980851228, 26129897630853, 66076533904],
  regen: 2403497928903,
  share: [5264, 10000, 533, 1843, 2357]
};

const PARAMS: RcResourceParams = {
  resource_params: {
    resource_history_bytes: {
      resource_dynamics_params: {
        resource_unit: 1,
        budget_per_time_unit: 43403,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "10525659774662010880", coeff_b: "211332338", shift: 50 }
    },
    resource_new_accounts: {
      resource_dynamics_params: {
        resource_unit: 10000,
        budget_per_time_unit: 797,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "16484671763857882971", coeff_b: "1231961", shift: 51 }
    },
    resource_market_bytes: {
      resource_dynamics_params: {
        resource_unit: 10,
        budget_per_time_unit: 72338,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "14969827235074865152", coeff_b: "15654337", shift: 55 }
    },
    resource_state_bytes: {
      resource_dynamics_params: {
        resource_unit: 1,
        budget_per_time_unit: 43546196,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "10525659774662010880", coeff_b: "212030656091", shift: 50 }
    },
    resource_execution_time: {
      resource_dynamics_params: {
        resource_unit: 1,
        budget_per_time_unit: 40000000,
        pool_eq: 0,
        max_pool_size: 0
      },
      price_curve_params: { coeff_a: "14969827235074865152", coeff_b: "541062725", shift: 59 }
    }
  },
  size_info: {
    resource_state_bytes: {
      comment_base_size: 4237056,
      comment_permlink_char_size: 168,
      transaction_base_size: 128
    },
    resource_execution_time: {
      comment_time: 66178,
      transaction_time: 6622,
      verify_authority_time: 94165
    }
  }
};

const STATS = { pool: REJECTION.poolAtTx, regen: REJECTION.regen, share: REJECTION.share };

const within = (actual: number, expected: number, pct: number) =>
  Math.abs(actual - expected) / expected <= pct / 100;

describe("countCommentResourceUsage", () => {
  const usage = countCommentResourceUsage(
    {
      transactionBytes: REJECTION.transactionBytes,
      permlinkLength: REJECTION.permlink.length,
      signatures: REJECTION.signatures
    },
    PARAMS.size_info
  );

  // These are exact, not approximate: the formulas are deterministic.
  it("reproduces the chain's history_bytes exactly", () => {
    expect(usage.resource_history_bytes).toBe(REJECTION.usage.history);
  });

  it("reproduces the chain's state_bytes exactly", () => {
    expect(usage.resource_state_bytes).toBe(REJECTION.usage.state);
  });

  it("reproduces the chain's execution_time exactly", () => {
    expect(usage.resource_execution_time).toBe(REJECTION.usage.execution);
  });

  it("leaves resources a comment does not touch at zero", () => {
    expect(usage.resource_new_accounts).toBe(0);
    expect(usage.resource_market_bytes).toBe(0);
  });

  it("scales state_bytes with permlink length", () => {
    const longer = countCommentResourceUsage(
      { transactionBytes: 100, permlinkLength: 30, signatures: 1 },
      PARAMS.size_info
    );
    const shorter = countCommentResourceUsage(
      { transactionBytes: 100, permlinkLength: 10, signatures: 1 },
      PARAMS.size_info
    );
    expect(longer.resource_state_bytes - shorter.resource_state_bytes).toBe(168 * 20);
  });

  it("charges execution time per signature", () => {
    const two = countCommentResourceUsage(
      { transactionBytes: 100, permlinkLength: 10, signatures: 2 },
      PARAMS.size_info
    );
    const one = countCommentResourceUsage(
      { transactionBytes: 100, permlinkLength: 10, signatures: 1 },
      PARAMS.size_info
    );
    expect(two.resource_execution_time - one.resource_execution_time).toBe(94165);
  });
});

describe("computeResourceCost", () => {
  const regenShare = (i: number) => Math.floor((REJECTION.regen * REJECTION.share[i]) / 10000);

  it("prices history_bytes within 1% of the chain", () => {
    const cost = computeResourceCost(
      PARAMS.resource_params.resource_history_bytes.price_curve_params,
      REJECTION.poolAtTx[0],
      REJECTION.usage.history,
      regenShare(0)
    );
    expect(within(cost, REJECTION.cost.history, 1)).toBe(true);
  });

  it("prices state_bytes within 3% of the chain", () => {
    const cost = computeResourceCost(
      PARAMS.resource_params.resource_state_bytes.price_curve_params,
      REJECTION.poolAtTx[3],
      REJECTION.usage.state,
      regenShare(3)
    );
    expect(within(cost, REJECTION.cost.state, 3)).toBe(true);
  });

  it("prices execution_time within 3% of the chain", () => {
    const cost = computeResourceCost(
      PARAMS.resource_params.resource_execution_time.price_curve_params,
      REJECTION.poolAtTx[4],
      REJECTION.usage.execution,
      regenShare(4)
    );
    expect(within(cost, REJECTION.cost.execution, 3)).toBe(true);
  });

  it("keeps full precision on coefficients past Number.MAX_SAFE_INTEGER", () => {
    // coeff_a is ~1.05e19. Doing this in floats silently loses the low bits.
    expect(Number("10525659774662010880") > Number.MAX_SAFE_INTEGER).toBe(true);
    const cost = computeResourceCost(
      PARAMS.resource_params.resource_history_bytes.price_curve_params,
      REJECTION.poolAtTx[0],
      1,
      regenShare(0)
    );
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThan(0);
  });

  it("returns 0 for empty or unusable input rather than throwing", () => {
    const curve = PARAMS.resource_params.resource_history_bytes.price_curve_params;
    expect(computeResourceCost(curve, 1, 0, 1)).toBe(0);
    expect(computeResourceCost(curve, 1, -5, 1)).toBe(0);
    expect(computeResourceCost(curve, 1, 10, 0)).toBe(0);
  });
});

describe("estimateCommentRcCost", () => {
  const op = {
    author: "spacecop",
    permlink: REJECTION.permlink,
    parent_author: "",
    parent_permlink: "dhf",
    title: "Who the DHF has actually paid, 2019-2026",
    // padded so the transaction matches the size the chain actually saw
    body: "x".repeat(
      REJECTION.transactionBytes -
        86 -
        "spacecop".length -
        REJECTION.permlink.length -
        "dhf".length -
        "Who the DHF has actually paid, 2019-2026".length -
        2
    ),
    json_metadata: "{}"
  };

  it("lands within 1% of the total the chain charged", () => {
    const result = estimateCommentRcCost({ op, rcParams: PARAMS, rcStats: STATS });

    expect(result.ready).toBe(true);
    expect(within(result.cost, REJECTION.cost.total, 1)).toBe(true);
  });

  it("would have caught this rejection before broadcast", () => {
    const SPACECOP_MAX_RC = 21399560550;
    const result = estimateCommentRcCost({ op, rcParams: PARAMS, rcStats: STATS });

    // The post needed more than the account's entire maximum, so no amount of
    // waiting for regeneration would have helped.
    expect(result.cost).toBeGreaterThan(SPACECOP_MAX_RC);
  });

  it("attributes most of the cost to history_bytes on a large post", () => {
    const result = estimateCommentRcCost({ op, rcParams: PARAMS, rcStats: STATS });
    const history = result.breakdown.find((b) => b.resource === "resource_history_bytes");

    expect(history!.cost / result.cost).toBeGreaterThan(0.9);
  });

  it("scales with body size, which is the actionable lever", () => {
    const small = estimateCommentRcCost({
      op: { ...op, body: "hello" },
      rcParams: PARAMS,
      rcStats: STATS
    });
    const large = estimateCommentRcCost({ op, rcParams: PARAMS, rcStats: STATS });

    expect(large.cost).toBeGreaterThan(small.cost * 10);
  });

  it("is not ready until both queries resolve, so callers cannot warn early", () => {
    expect(estimateCommentRcCost({ op, rcParams: undefined, rcStats: STATS }).ready).toBe(false);
    expect(estimateCommentRcCost({ op, rcParams: PARAMS, rcStats: undefined }).ready).toBe(false);
  });
});

describe("estimateCommentTransactionBytes", () => {
  it("counts UTF-8 bytes rather than code units", () => {
    const base = {
      author: "a",
      permlink: "b",
      parent_author: "",
      parent_permlink: "c",
      title: "t",
      json_metadata: "{}"
    };
    const ascii = estimateCommentTransactionBytes({ ...base, body: "aaaa" });
    const emoji = estimateCommentTransactionBytes({ ...base, body: "🐝🐝🐝🐝" });

    expect(emoji).toBeGreaterThan(ascii);
  });
});
