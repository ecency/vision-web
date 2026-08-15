/**
 * Thresholds behind the content moderation treatment. Single source of truth for
 * every client: web and mobile previously carried their own copies, which drifted
 * (mobile flagged downvoted content at -7B rshares and 4 voters where web used
 * -10B and 5), so the same post read differently depending on the app.
 */

/** Sum of rshares below which a post counts as heavily downvoted. */
export const HIDDEN_POST_RSHARES_THRESHOLD = -10000000000;

/** Downvoting is only conclusive once enough accounts have voted. */
export const HIDDEN_POST_MIN_VOTES = 5;

/**
 * Reputation (human-readable 0-100 scale) below which an author counts as
 * low-trust. New Hive accounts start around 25.
 *
 * NOTE: reputation is the only input. Account age is NOT part of the check, so a
 * years-old account that never earned reputation trips it exactly like a fresh
 * one. User-facing copy must say "low reputation", never "new account".
 */
export const LOW_TRUST_REPUTATION_THRESHOLD = 30;
