import { calculateRCMana } from "@/modules/core/hive-tx";
import type { RCAccount } from "@/modules/core/hive-tx";
import type { RcStats } from "../types/stats";
import type { RcResourceParams } from "../types/resource-params";
import { priceRcUsage } from "./price-rc-usage";
import {
  countVoteResourceUsage,
  estimateVoteTransactionBytes,
  type VoteLike
} from "./count-operation-usage";
import {
  countCommentResourceUsage,
  estimateCommentTransactionBytes,
  type CommentLike,
  type CommentOptionsLike
} from "./estimate-comment-rc-cost";

/**
 * Operations the RC pre-check can estimate. Mirrors the keys exposed by
 * `rc_api.get_rc_stats` (see {@link RcStats}["ops"]).
 */
export type RcPrecheckOperation = keyof RcStats["ops"];

/** The operation about to be broadcast, when the caller has it. */
export type RcPrecheckPayload =
  | { kind: "comment"; op: CommentLike; options?: CommentOptionsLike }
  | { kind: "vote"; op: VoteLike };

export interface RcPrecheckInput {
  /** From `getAccountRcQueryOptions(username)` -> rcAccounts[0]. */
  rcAccount: RCAccount | null | undefined;
  /** From `getRcStatsQueryOptions()`. */
  rcStats: RcStats | null | undefined;
  /** The operation the user is about to broadcast. */
  operation: RcPrecheckOperation;
  /**
   * From `getRcResourceParamsQueryOptions()`. Required for an exact estimate;
   * without it the result is not ready rather than silently approximate.
   */
  rcParams?: RcResourceParams | null;
  /**
   * The actual operation about to be broadcast. Supplying it is what makes the
   * estimate exact, because cost is dominated by the serialized transaction
   * size. Without it a minimal operation of that type is priced instead, which
   * is a lower bound: it can miss a marginal case but never invents one.
   */
  payload?: RcPrecheckPayload;
  /**
   * What to price when no payload is supplied.
   *
   * - `"minimal"` (default) prices the smallest operation of that type. It is
   *   a lower bound, so a pre-submit warning is never invented for an
   *   operation that would have succeeded.
   * - `"average"` prices the network average the chain publishes. Right for
   *   "how many of these can I afford" displays, where there is no specific
   *   operation in hand and the smallest conceivable one would flatter the
   *   count.
   */
  fallback?: "minimal" | "average";
  /**
   * Safety multiplier applied to the operation cost when deciding
   * whether the broadcast will "likely fail". Actual on-chain cost varies with
   * network load, so we keep headroom. Defaults to 1.2.
   */
  buffer?: number;
}

export interface RcPrecheckResult {
  /** Both inputs were available, so the estimate is meaningful. */
  ready: boolean;
  /** Current RC mana of the account. */
  currentMana: number;
  /** Maximum RC mana of the account. */
  maxMana: number;
  /**
   * RC cost of the operation itself.
   *
   * Named `avgCost` for backwards compatibility; it is no longer an average.
   * @deprecated prefer `cost`.
   */
  avgCost: number;
  /** RC cost of the operation, computed the way the chain computes it. */
  cost: number;
  /** Serialized transaction size, the dominant term for a comment. */
  transactionBytes: number;
  /** Average cost padded by `buffer`. */
  estimatedCost: number;
  /** `currentMana` is below the padded estimate -> broadcast likely fails. */
  willLikelyFail: boolean;
  /** RC shortfall vs the padded estimate (0 when not failing). */
  deficit: number;
  /** Roughly how many such operations the account can still afford. */
  remaining: number;
}

const EMPTY: RcPrecheckResult = {
  ready: false,
  currentMana: 0,
  maxMana: 0,
  avgCost: 0,
  cost: 0,
  transactionBytes: 0,
  estimatedCost: 0,
  willLikelyFail: false,
  deficit: 0,
  remaining: 0,
};

/**
 * Pure, client-side estimate of whether an account has enough Resource Credits
 * to broadcast an operation, used to warn the user BEFORE they submit instead
 * of failing afterwards with the chain's "Please wait to transact" error.
 *
 * Costs are computed the way the chain computes them, from the actual
 * operation, not from the network-wide average. The average is dominated by
 * short replies and badly misleads on posts: it once told an account holding
 * 21.3B RC that it could afford 17 posts, and the next post it tried needed
 * 23.3B.
 *
 * Still a hint, never a hard gate: the buffer covers pool drift between the
 * estimate and the broadcast, and the publish/comment/vote action must stay
 * non-blocking.
 */
export function estimateRcPrecheck({
  rcAccount,
  rcStats,
  rcParams,
  operation,
  payload,
  fallback = "minimal",
  buffer = 1.2,
}: RcPrecheckInput): RcPrecheckResult {
  if (!rcAccount || !rcStats?.ops) {
    return EMPTY;
  }

  const { current_mana: currentMana, max_mana: maxMana } = calculateRCMana(rcAccount);

  const priced = priceOperation(operation, payload, fallback, rcParams, rcStats);
  if (!priced) {
    // Nothing to price against: reporting "ready" here would be a silent
    // all-clear, which is the one answer a pre-check must never invent.
    return { ...EMPTY, currentMana, maxMana };
  }

  const { cost, transactionBytes } = priced;
  const safeBuffer = Number.isFinite(buffer) && buffer > 0 ? buffer : 1.2;
  const estimatedCost = cost * safeBuffer;
  const willLikelyFail = currentMana < estimatedCost;

  return {
    ready: true,
    currentMana,
    maxMana,
    avgCost: cost,
    cost,
    transactionBytes,
    estimatedCost,
    willLikelyFail,
    deficit: willLikelyFail ? Math.ceil(estimatedCost - currentMana) : 0,
    remaining: Math.floor(currentMana / cost),
  };
}

/**
 * Prices whichever operation the caller is about to broadcast.
 *
 * Comments and votes are the two operations whose cost swings with what the
 * user wrote, so they are priced from the payload, and pricing them needs the
 * curve parameters. Every other operation the type advertises (transfer,
 * custom_json, ...) is fixed-shape and takes the network average the chain
 * publishes, which needs nothing else.
 *
 * When no payload is supplied a minimal operation is priced. That is
 * deliberately a lower bound: it can miss a marginal case, but it never warns
 * about one that would have succeeded.
 *
 * Returns null when the answer would have to be invented, so the caller
 * reports "not ready" rather than a zero-cost all-clear.
 */
function priceOperation(
  operation: RcPrecheckOperation,
  payload: RcPrecheckPayload | undefined,
  fallback: "minimal" | "average",
  rcParams: RcResourceParams | null | undefined,
  rcStats: RcStats
): { cost: number; transactionBytes: number } | null {
  const average = averageCost(rcStats, operation);
  const pricedFromPayload =
    operation === "comment_operation" || operation === "vote_operation";

  // The average is a number the node already returned. It needs no curve
  // parameters, so a caller pricing a transfer must not be blocked waiting on
  // them, which is how every operation outside these two is priced.
  if (!pricedFromPayload || (!payload && fallback === "average")) {
    return average;
  }

  // Asked to price a real comment or vote without the inputs to do it. The
  // honest answer is "not ready": falling back to the average here is exactly
  // what told an account holding 21.3B RC it could afford 17 more posts.
  if (!rcParams?.resource_params || !rcParams.size_info || !rcStats.pool || !rcStats.share) {
    return null;
  }

  const stats = { pool: rcStats.pool, regen: rcStats.regen, share: rcStats.share };

  if (operation === "vote_operation") {
    const op: VoteLike = payload?.kind === "vote" ? payload.op : MINIMAL_VOTE;
    const transactionBytes = estimateVoteTransactionBytes(op);
    const usage = countVoteResourceUsage({ transactionBytes }, rcParams.size_info);
    return { cost: priceRcUsage(usage, rcParams, stats).cost, transactionBytes };
  }

  const op: CommentLike = payload?.kind === "comment" ? payload.op : MINIMAL_COMMENT;
  const options = payload?.kind === "comment" ? payload.options : undefined;
  const transactionBytes = estimateCommentTransactionBytes({ op, options });
  const usage = countCommentResourceUsage(
    {
      transactionBytes,
      permlinkLength: op.permlink.length,
      beneficiaries: options?.beneficiaries?.length ?? 0,
      hasCommentOptions: !!options
    },
    rcParams.size_info
  );
  return { cost: priceRcUsage(usage, rcParams, stats).cost, transactionBytes };
}

/** The network average the chain publishes for an operation, when it has one. */
function averageCost(
  rcStats: RcStats,
  operation: RcPrecheckOperation
): { cost: number; transactionBytes: number } | null {
  const cost = rcStats.ops[operation]?.avg_cost;
  return typeof cost === "number" && cost > 0 ? { cost, transactionBytes: 0 } : null;
}

/** Smallest realistic operations, used only when the caller has no payload yet. */
const MINIMAL_COMMENT: CommentLike = {
  author: "aaaaaaaaaa",
  permlink: "aaaaaaaaaaaaaaaaaaaa",
  parent_author: "",
  parent_permlink: "hive-100000",
  title: "",
  body: "",
  json_metadata: "{}"
};

const MINIMAL_VOTE: VoteLike = {
  voter: "aaaaaaaaaa",
  author: "aaaaaaaaaa",
  permlink: "aaaaaaaaaaaaaaaaaaaa"
};
