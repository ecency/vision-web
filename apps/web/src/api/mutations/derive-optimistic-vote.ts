import { entryVoteOf, isCastVote } from "@ecency/sdk";
import { Entry, ObserverVote } from "@/entities";
import { parseAsset } from "@/utils";

export interface OptimisticVote {
  /** The user's vote after this one; null after an unvote. */
  observerVote: ObserverVote | null;
  nextVoteCount: number;
  nextPayout: number;
}

/**
 * Compute the optimistic vote state for an entry after `username` casts a vote
 * of `weight` (0 removes the vote) with an `estimated` payout delta.
 *
 * Whether the user had voted before decides the count: the looked-up vote
 * (`priorVote`) when there is one, else the entry when it was read for this
 * user. Unknown counts as "no vote" for an upvote and leaves the count alone
 * for an unvote. A zero vote (percent 0, or rshares 0 without a percent) is no
 * vote (`isCastVote`), as in the SDK.
 *
 * The count is `stats.total_votes` when present, else whichever vote count a
 * lightweight row carries (`net_votes` on waves feed rows); the base payout is
 * the numeric `payout` (bridge entries) or the summed payout strings (feeds).
 */
export function deriveOptimisticVote(
  entry: Entry,
  weight: number,
  estimated: number,
  username: string,
  priorVote?: ObserverVote | null
): OptimisticVote {
  const prior = priorVote !== undefined ? priorVote : entryVoteOf(entry, username);
  const hadVote = isCastVote(prior);
  const observerVote: ObserverVote | null =
    // No rshares yet: the node computes them once the vote is in a block.
    weight !== 0 ? { rshares: null, percent: weight } : null;

  const baseVoteCount =
    entry.stats?.total_votes ||
    entry.net_votes ||
    entry.total_votes ||
    0;
  let nextVoteCount = baseVoteCount;
  if (weight !== 0 && !hadVote) {
    nextVoteCount = baseVoteCount + 1;
  } else if (weight === 0 && hadVote) {
    nextVoteCount = Math.max(0, baseVoteCount - 1);
  }

  const basePayout =
    typeof entry.payout === "number"
      ? entry.payout
      : parseAsset(entry.pending_payout_value).amount +
        parseAsset(entry.author_payout_value).amount +
        parseAsset(entry.curator_payout_value).amount;

  return { observerVote, nextVoteCount, nextPayout: basePayout + estimated };
}
