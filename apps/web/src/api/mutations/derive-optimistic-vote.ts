import { entryVoteOf, isCastVote } from "@ecency/sdk";
import { Entry, ObserverVote } from "@/entities";
import { parseAsset } from "@/utils";

export interface OptimisticVote {
  /** The user's vote after this one; a percent-0 row after an unvote. */
  observerVote: ObserverVote;
  nextVoteCount: number;
  nextPayout: number;
}

/**
 * An entry's vote count. `stats.total_votes` is authoritative, and 0 is a count
 * (`??`, never `||`). Rows without stats fall back to the voter list length
 * (capped at 1000 on v1), then the lightweight `net_votes` / `total_votes`.
 */
export function entryVoteCount(entry: Entry | undefined | null): number {
  return (
    entry?.stats?.total_votes ??
    (entry?.active_votes?.length || entry?.net_votes || entry?.total_votes || 0)
  );
}

/**
 * Compute the optimistic vote state for an entry after `username` casts a vote
 * of `weight` (0 removes the vote) with an `estimated` payout delta.
 *
 * Whether the user had voted before decides the count: the looked-up vote
 * (`priorVote`) when there is one, else the entry when it was read for this
 * user. Unknown counts as "no vote" for an upvote. Hivemind keeps a vote row
 * once cast (#2070): an unvote leaves a percent-0 row that `stats.total_votes`
 * still counts. So an unvote writes that row and leaves the count alone, and
 * a vote over a removed vote (percent 0) does not add one. A zero vote is
 * not cast (`isCastVote`), as in the SDK.
 *
 * The base count is `entryVoteCount(entry)`; the base payout is
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
  const observerVote: ObserverVote =
    // No rshares yet: the node computes them once the vote is in a block.
    weight !== 0 ? { rshares: null, percent: weight } : { rshares: 0, percent: 0 };

  // Same rule as the SDK's isRemovedVote, inlined so the web build does not
  // need a newer SDK dist for it.
  const removedVote = !!prior && prior.percent === 0;
  const baseVoteCount = entryVoteCount(entry);
  const nextVoteCount =
    weight !== 0 && !hadVote && !removedVote ? baseVoteCount + 1 : baseVoteCount;

  const basePayout =
    typeof entry.payout === "number"
      ? entry.payout
      : parseAsset(entry.pending_payout_value).amount +
        parseAsset(entry.author_payout_value).amount +
        parseAsset(entry.curator_payout_value).amount;

  return { observerVote, nextVoteCount, nextPayout: basePayout + estimated };
}
