import { utf8ByteLength, varintByteLength } from "@/modules/core/utf8";
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

/**
 * Fixed transaction header: ref_block_num(2) + ref_block_prefix(4) +
 * expiration(4) + the extensions varint(1).
 */
const TRANSACTION_HEADER_BYTES = 11;
/** Compact signature, 65 bytes each. */
const SIGNATURE_BYTES = 65;
/** asset = amount int64(8) + precision(1) + symbol(7). */
const ASSET_BYTES = 16;

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
  /**
   * Beneficiary count on the companion comment_options, when publish appends
   * one. The chain counts resources for every operation in the transaction,
   * not just the comment.
   */
  beneficiaries?: number;
  hasCommentOptions?: boolean;
}

/**
 * Port of the `comment_operation` and `comment_options_operation` arms of
 * `count_resources` (libraries/chain/rc/resource_count.cpp). Reproduces the
 * chain's numbers exactly, see the spec.
 */
export function countCommentResourceUsage(
  {
    transactionBytes,
    permlinkLength,
    signatures = 1,
    beneficiaries = 0,
    hasCommentOptions = false
  }: CommentResourceUsageInput,
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
      state.transaction_base_size +
      // comment_payout_beneficiaries is visited from comment_options
      state.comment_beneficiaries_member_size * beneficiaries,
    resource_execution_time:
      exec.comment_time +
      exec.transaction_time +
      exec.verify_authority_time * signatures +
      (hasCommentOptions ? exec.comment_options_time : 0)
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


/** A beneficiary route as it appears in comment_options extensions. */
export interface BeneficiaryRoute {
  account: string;
  weight: number;
}

/**
 * The comment_options operation publish appends when the author sets
 * beneficiaries or a non-default reward split.
 */
export interface CommentOptionsLike {
  beneficiaries?: BeneficiaryRoute[];
}

/** Serialized bytes of one string field: its varint length plus its bytes. */
const stringFieldBytes = (value: string): number => {
  const length = utf8ByteLength(value);
  return varintByteLength(length) + length;
};

const commentOperationBytes = (op: CommentLike): number =>
  1 + // operation variant id
  stringFieldBytes(op.parent_author) +
  stringFieldBytes(op.parent_permlink) +
  stringFieldBytes(op.author) +
  stringFieldBytes(op.permlink) +
  stringFieldBytes(op.title) +
  stringFieldBytes(op.body) +
  stringFieldBytes(op.json_metadata);

const commentOptionsBytes = (op: CommentLike, options: CommentOptionsLike): number => {
  const beneficiaries = options.beneficiaries ?? [];
  let bytes =
    1 + // operation variant id
    stringFieldBytes(op.author) +
    stringFieldBytes(op.permlink) +
    ASSET_BYTES + // max_accepted_payout
    2 + // percent_hbd
    2; // allow_votes + allow_curation_rewards

  bytes += varintByteLength(beneficiaries.length > 0 ? 1 : 0);
  if (beneficiaries.length > 0) {
    bytes += 1 + varintByteLength(beneficiaries.length); // extension variant id + route count
    beneficiaries.forEach((route) => {
      bytes += stringFieldBytes(route.account) + 2; // weight is uint16
    });
  }
  return bytes;
};

export interface CommentTransactionInput {
  op: CommentLike;
  /** Present when publish appends comment_options for beneficiaries or rewards. */
  options?: CommentOptionsLike;
  signatures?: number;
}

/**
 * Serialized size of the transaction that will carry this comment.
 *
 * This models Hive's binary encoding rather than approximating it: a fixed
 * header, one varint-prefixed field per string, and 65 bytes per signature.
 * Verified byte-exact against eight real transactions read back with
 * `get_transaction_hex`, including one carrying comment_options.
 */
export function estimateCommentTransactionBytes({
  op,
  options,
  signatures = 1
}: CommentTransactionInput): number {
  const operations = [commentOperationBytes(op)];
  if (options) {
    operations.push(commentOptionsBytes(op, options));
  }

  return (
    TRANSACTION_HEADER_BYTES +
    varintByteLength(operations.length) +
    operations.reduce((sum, bytes) => sum + bytes, 0) +
    varintByteLength(signatures) +
    SIGNATURE_BYTES * signatures
  );
}

export interface EstimateCommentRcCostInput {
  op: CommentLike;
  /** Companion comment_options, when the author set beneficiaries or rewards. */
  options?: CommentOptionsLike;
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
  options,
  rcParams,
  rcStats,
  signatures = 1
}: EstimateCommentRcCostInput): CommentRcCostEstimate {
  if (!rcParams?.resource_params || !rcParams.size_info || !rcStats?.pool || !rcStats.share) {
    return EMPTY;
  }

  const transactionBytes = estimateCommentTransactionBytes({ op, options, signatures });
  const usage = countCommentResourceUsage(
    {
      transactionBytes,
      permlinkLength: utf8ByteLength(op.permlink),
      signatures,
      beneficiaries: options?.beneficiaries?.length ?? 0,
      hasCommentOptions: !!options
    },
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
    // rc_stats publishes `share` as weight/divisor scaled to 10,000. Kept in
    // BigInt: regen is ~2.4e12 and the product is past the safe-integer range
    // for larger shares.
    const regenShare = Number((BigInt(regen) * BigInt(share)) / 10000n);
    const resourceCost = computeResourceCost(entry.price_curve_params, pool, scaled, regenShare);

    cost += resourceCost;
    breakdown.push({ resource: name, usage: scaled, cost: resourceCost });
  });

  return { ready: true, cost, transactionBytes, breakdown };
}
