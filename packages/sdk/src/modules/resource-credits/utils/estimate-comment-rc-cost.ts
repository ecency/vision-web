import {
  RC_RESOURCE_NAMES,
  type RcCostBreakdown,
  type RcPriceCurveParams,
  type RcResourceName,
  type RcResourceParams,
  type RcSizeInfo
} from "../types/resource-params";
import type { RcStats } from "../types/stats";

/**
 * What the chain actually charges for publishing a comment, rather than the
 * network-average cost of an average comment.
 *
 * The average is a poor guide for posts: it is dominated by short replies,
 * while a long post is charged mostly on `history_bytes`, which is the
 * serialized transaction size. A real case: an account holding 21.3B RC was
 * told it could afford 17 posts, then a 46,620-byte post was rejected needing
 * 23.3B RC, more than that account's entire maximum.
 *
 * This is a direct port of `resource_credits::compute_cost` and the
 * `comment_operation` arm of `count_resources` from hive, so it tracks what
 * the node does instead of approximating it. Verified against a real
 * rejection: usage reproduces exactly and total cost lands within 0.3%, the
 * residual coming from `share` being published rounded to four digits.
 */

/** Bytes of framing around a comment operation: tx envelope plus one signature. */
const TRANSACTION_ENVELOPE_BYTES = 86;

const big = (v: string | number): bigint => BigInt(typeof v === "string" ? v : Math.trunc(v));

/**
 * Port of `resource_credits::compute_cost` (libraries/chain/rc/rc_utility.cpp).
 *
 * BigInt is required, not stylistic: `coeff_a` is ~1.05e19, well past
 * Number.MAX_SAFE_INTEGER, so float arithmetic loses the low bits and the
 * result drifts.
 */
export function computeResourceCost(
  curve: RcPriceCurveParams,
  pool: number,
  resourceCount: number,
  regenShare: number
): number {
  if (resourceCount <= 0 || regenShare <= 0) {
    return 0;
  }

  const coeffA = big(curve.coeff_a);
  const coeffB = big(curve.coeff_b);
  const shift = big(curve.shift);

  // The node shifts before multiplying by the resource count, because
  // regen * coeff_a already risks overflowing 128 bits. Order matters.
  let num = (big(regenShare) * coeffA) >> shift;
  num += 1n;
  num *= big(resourceCount);

  const denom = coeffB + (pool > 0 ? big(pool) : 0n);
  if (denom === 0n) {
    return 0;
  }

  return Number(num / denom + 1n);
}

export interface CommentResourceUsageInput {
  /** Byte length of the serialized transaction. */
  transactionBytes: number;
  permlinkLength: number;
  /** Signatures on the transaction; a normal post carries one. */
  signatures?: number;
}

/**
 * Port of the `comment_operation` arm of `count_resources`
 * (libraries/chain/rc/resource_count.cpp). Reproduces the chain's numbers
 * exactly, see the spec.
 */
export function countCommentResourceUsage(
  { transactionBytes, permlinkLength, signatures = 1 }: CommentResourceUsageInput,
  sizeInfo: RcSizeInfo
): Record<RcResourceName, number> {
  const state = sizeInfo.resource_state_bytes;
  const exec = sizeInfo.resource_execution_time;

  return {
    resource_history_bytes: transactionBytes,
    resource_new_accounts: 0,
    resource_market_bytes: 0,
    resource_state_bytes:
      state.comment_base_size +
      state.comment_permlink_char_size * permlinkLength +
      state.transaction_base_size,
    resource_execution_time:
      exec.comment_time + exec.transaction_time + exec.verify_authority_time * signatures
  };
}

export interface CommentLike {
  author: string;
  permlink: string;
  parent_author: string;
  parent_permlink: string;
  title: string;
  body: string;
  json_metadata: string;
}

const utf8Length = (value: string): number =>
  typeof TextEncoder === "undefined" ? value.length : new TextEncoder().encode(value).length;

/**
 * Serialized size of the transaction that will carry this comment.
 *
 * The operation serializes as its string fields plus short varint lengths, so
 * the sum of UTF-8 field lengths plus a fixed envelope tracks the true size
 * closely. Measured against real transactions read back with
 * `get_transaction_hex`, the envelope is 85 to 86 bytes; on a post large
 * enough for RC to matter the body dwarfs any residual.
 */
export function estimateCommentTransactionBytes(op: CommentLike): number {
  return (
    utf8Length(op.parent_author) +
    utf8Length(op.parent_permlink) +
    utf8Length(op.author) +
    utf8Length(op.permlink) +
    utf8Length(op.title) +
    utf8Length(op.body) +
    utf8Length(op.json_metadata) +
    TRANSACTION_ENVELOPE_BYTES
  );
}

export interface EstimateCommentRcCostInput {
  op: CommentLike;
  rcParams: RcResourceParams | undefined;
  rcStats: Pick<RcStats, "pool" | "regen" | "share"> | undefined;
  signatures?: number;
}

export interface CommentRcCostEstimate {
  /** False until both queries have resolved; callers must not warn on this. */
  ready: boolean;
  cost: number;
  transactionBytes: number;
  breakdown: RcCostBreakdown[];
}

const EMPTY: CommentRcCostEstimate = {
  ready: false,
  cost: 0,
  transactionBytes: 0,
  breakdown: []
};

/** Total RC the chain will charge to broadcast this comment. */
export function estimateCommentRcCost({
  op,
  rcParams,
  rcStats,
  signatures = 1
}: EstimateCommentRcCostInput): CommentRcCostEstimate {
  if (!rcParams?.resource_params || !rcParams.size_info || !rcStats?.pool || !rcStats.share) {
    return EMPTY;
  }

  const transactionBytes = estimateCommentTransactionBytes(op);
  const usage = countCommentResourceUsage(
    { transactionBytes, permlinkLength: utf8Length(op.permlink), signatures },
    rcParams.size_info
  );

  const regen = Number(rcStats.regen);
  let cost = 0;
  const breakdown: RcCostBreakdown[] = [];

  RC_RESOURCE_NAMES.forEach((name, index) => {
    const entry = rcParams.resource_params[name];
    const pool = Number(rcStats.pool[index] ?? 0);
    const share = Number(rcStats.share[index] ?? 0);
    if (!entry || share <= 0) {
      return;
    }

    // `usage` is scaled by the resource unit before pricing. It is 1 for the
    // resources a comment touches, but market bytes and new accounts are not.
    const scaled = usage[name] * Number(entry.resource_dynamics_params.resource_unit ?? 1);
    // rc_stats publishes `share` as weight/divisor scaled to 10,000.
    const regenShare = Math.floor((regen * share) / 10000);
    const resourceCost = computeResourceCost(entry.price_curve_params, pool, scaled, regenShare);

    cost += resourceCost;
    breakdown.push({ resource: name, usage: scaled, cost: resourceCost });
  });

  return { ready: true, cost, transactionBytes, breakdown };
}
