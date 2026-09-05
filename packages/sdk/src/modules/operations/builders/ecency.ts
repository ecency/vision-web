import type { Operation } from "../../../hive-tx";

/**
 * Ecency-Specific Operations
 * Custom operations for Ecency platform features (Points, Boost, Promote, etc.)
 */

/**
 * Builds an Ecency Boost Plus subscription operation (custom_json).
 * @param user - User account
 * @param account - Account to subscribe
 * @param duration - Subscription duration in days (must be a valid finite number)
 * @returns Custom JSON operation for boost plus
 */
export function buildBoostPlusOp(
  user: string,
  account: string,
  duration: number
): Operation {
  // Validate required parameters and ensure duration is a finite number (reject NaN, Infinity)
  if (!user || !account || !Number.isFinite(duration)) {
    throw new Error("[SDK][buildBoostPlusOp] Missing required parameters");
  }

  return [
    "custom_json",
    {
      id: "ecency_boost_plus",
      json: JSON.stringify({
        user,
        account,
        duration,
      }),
      required_auths: [user],
      required_posting_auths: [],
    },
  ];
}

/**
 * Builds an Ecency RC top-up operation (custom_json): a short-term, RC-only
 * delegation to the user's OWN account, paid for with Ecency Points. Distinct
 * from Boost Plus (which delegates Hive Power). The RC amount is fixed
 * server-side, so the user only chooses a duration. Signed with active
 * authority because it spends Points. The actual on-chain `delegate_rc` is
 * broadcast by the Ecency relay account, not here.
 * @param user - User account (payer and recipient of the RC)
 * @param duration - Delegation duration in days (must be a valid finite number)
 * @returns Custom JSON operation for the RC top-up
 */
export function buildRcDelegationOp(user: string, duration: number): Operation {
  if (!user || !Number.isInteger(duration) || duration <= 0) {
    throw new Error("[SDK][buildRcDelegationOp] Missing or invalid parameters");
  }

  return [
    "custom_json",
    {
      id: "ecency_rc_delegation",
      json: JSON.stringify({
        user,
        duration,
      }),
      required_auths: [user],
      required_posting_auths: [],
    },
  ];
}

/**
 * Builds an Ecency promote operation (custom_json).
 * @param user - User account
 * @param author - Post author
 * @param permlink - Post permlink
 * @param duration - Promotion duration in days (must be a valid finite number)
 * @returns Custom JSON operation for promote
 */
export function buildPromoteOp(
  user: string,
  author: string,
  permlink: string,
  duration: number
): Operation {
  // Validate required parameters and ensure duration is a finite number (reject NaN, Infinity)
  if (!user || !author || !permlink || !Number.isFinite(duration)) {
    throw new Error("[SDK][buildPromoteOp] Missing required parameters");
  }

  return [
    "custom_json",
    {
      id: "ecency_promote",
      json: JSON.stringify({
        user,
        author,
        permlink,
        duration,
      }),
      required_auths: [user],
      required_posting_auths: [],
    },
  ];
}

const CURATION_REASONS = ["quality", "underrated", "newcomer", "other"] as const;
type CurationRecommendReason = (typeof CURATION_REASONS)[number];

/**
 * Builds a curation recommendation operation (custom_json, posting authority).
 * The desk indexes `ecency_curation` ops from the chain; there is no write route.
 * @param recommender - Account recommending the post (signs with posting)
 * @param author - Post author
 * @param permlink - Post permlink
 * @param reason - One of quality, underrated, newcomer, other (defaults to quality)
 * @returns Custom JSON operation with id "ecency_curation"
 */
export function buildCurationRecommendOp(
  recommender: string,
  author: string,
  permlink: string,
  reason: CurationRecommendReason = "quality"
): Operation {
  if (!recommender || !author || !permlink) {
    throw new Error("[SDK][buildCurationRecommendOp] Missing required parameters");
  }
  if (!CURATION_REASONS.includes(reason)) {
    throw new Error("[SDK][buildCurationRecommendOp] Unknown reason");
  }

  return [
    "custom_json",
    {
      id: "ecency_curation",
      json: JSON.stringify({
        v: 1,
        op: "recommend",
        author,
        permlink,
        reason,
      }),
      required_auths: [],
      required_posting_auths: [recommender],
    },
  ];
}

/**
 * Builds a curation recommendation withdrawal (custom_json, posting authority).
 * @param recommender - Account withdrawing its recommendation
 * @param author - Post author
 * @param permlink - Post permlink
 * @returns Custom JSON operation with id "ecency_curation" and op "unrecommend"
 */
export function buildCurationUnrecommendOp(
  recommender: string,
  author: string,
  permlink: string
): Operation {
  if (!recommender || !author || !permlink) {
    throw new Error("[SDK][buildCurationUnrecommendOp] Missing required parameters");
  }

  return [
    "custom_json",
    {
      id: "ecency_curation",
      json: JSON.stringify({
        v: 1,
        op: "unrecommend",
        author,
        permlink,
      }),
      required_auths: [],
      required_posting_auths: [recommender],
    },
  ];
}

/**
 * Builds an Ecency point transfer operation (custom_json).
 * @param sender - Sender account
 * @param receiver - Receiver account
 * @param amount - Amount to transfer
 * @param memo - Transfer memo
 * @returns Custom JSON operation for point transfer
 */
export function buildPointTransferOp(
  sender: string,
  receiver: string,
  amount: string,
  memo: string
): Operation {
  if (!sender || !receiver || !amount) {
    throw new Error("[SDK][buildPointTransferOp] Missing required parameters");
  }

  // Normalize "POINTS" to "POINT" — backend expects singular form
  const normalizedAmount = amount.replace(/POINTS\b/, "POINT");

  return [
    "custom_json",
    {
      id: "ecency_point_transfer",
      json: JSON.stringify({
        sender,
        receiver,
        amount: normalizedAmount,
        memo: memo || "",
      }),
      required_auths: [sender],
      required_posting_auths: [],
    },
  ];
}

/**
 * Builds multiple Ecency point transfer operations for multiple recipients.
 * @param sender - Sender account
 * @param destinations - Comma or space separated list of recipients
 * @param amount - Amount to transfer
 * @param memo - Transfer memo
 * @returns Array of custom JSON operations for point transfers
 */
export function buildMultiPointTransferOps(
  sender: string,
  destinations: string,
  amount: string,
  memo: string
): Operation[] {
  if (!sender || !destinations || !amount) {
    throw new Error("[SDK][buildMultiPointTransferOps] Missing required parameters");
  }

  // Split the destination input into an array of usernames
  const destArray = destinations
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);

  // Validate parsed destinations
  if (destArray.length === 0) {
    throw new Error("[SDK][buildMultiPointTransferOps] Missing valid destinations");
  }

  // Create a point transfer operation for each destination
  return destArray.map((dest) =>
    buildPointTransferOp(sender, dest.trim(), amount, memo)
  );
}

/**
 * Builds an Ecency community rewards registration operation (custom_json).
 * @param name - Account name to register
 * @returns Custom JSON operation for community registration
 */
export function buildCommunityRegistrationOp(name: string): Operation {
  if (!name) {
    throw new Error("[SDK][buildCommunityRegistrationOp] Missing required parameters");
  }

  return [
    "custom_json",
    {
      id: "ecency_registration",
      json: JSON.stringify({
        name,
      }),
      required_auths: [name],
      required_posting_auths: [],
    },
  ];
}

/**
 * Builds a generic active authority custom_json operation.
 * Used for various Ecency operations that require active authority.
 * @param username - Account performing the operation
 * @param operationId - Custom JSON operation ID
 * @param json - JSON payload
 * @returns Custom JSON operation with active authority
 */
export function buildActiveCustomJsonOp(
  username: string,
  operationId: string,
  json: Record<string, any>
): Operation {
  if (!username || !operationId || !json) {
    throw new Error("[SDK][buildActiveCustomJsonOp] Missing required parameters");
  }

  return [
    "custom_json",
    {
      id: operationId,
      json: JSON.stringify(json),
      required_auths: [username],
      required_posting_auths: [],
    },
  ];
}

/**
 * Builds a generic posting authority custom_json operation.
 * Used for various operations that require posting authority.
 * @param username - Account performing the operation
 * @param operationId - Custom JSON operation ID
 * @param json - JSON payload
 * @returns Custom JSON operation with posting authority
 */
export function buildPostingCustomJsonOp(
  username: string,
  operationId: string,
  json: Record<string, any> | any[]
): Operation {
  if (!username || !operationId || !json) {
    throw new Error("[SDK][buildPostingCustomJsonOp] Missing required parameters");
  }

  return [
    "custom_json",
    {
      id: operationId,
      json: JSON.stringify(json),
      required_auths: [],
      required_posting_auths: [username],
    },
  ];
}
