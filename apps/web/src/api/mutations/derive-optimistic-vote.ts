import { entryVoteOf } from "@ecency/sdk";
import { Entry, EntryVote, ObserverVote } from "@/entities";
import { parseAsset } from "@/utils";

export interface OptimisticVote {
  /** The user's vote after this one; null after an unvote. */
  observerVote: ObserverVote | null;
  /**
   * The updated voter list, only for a legacy row that still carries
   * `active_votes`. Undefined for bridge v2 entries, which have no list.
   */
  newVotes?: EntryVote[];
  nextVoteCount: number;
  nextPayout: number;
}

/**
 * Compute the optimistic vote state for an entry after `username` casts a vote
 * of `weight` (0 removes the vote) with an `estimated` payout delta.
 *
 * Whether the user had voted before decides the count: from the entry when it
 * was read for this user (`observer_vote`) or carries a voter list, otherwise
 * from `priorVote` (the looked-up vote; undefined = unknown, so the count only
 * moves for a fresh vote, never down).
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
  const fromEntry = entryVoteOf(entry, username);
  const prior = fromEntry !== undefined ? fromEntry : priorVote;
  const hadVote = prior != null && prior.percent !== 0;
  const observerVote: ObserverVote | null =
    weight !== 0 ? { rshares: weight, percent: weight } : null;

  const legacyVotes = Array.isArray(entry.active_votes) ? entry.active_votes : undefined;
  const newVotes = legacyVotes
    ? [
        ...legacyVotes.filter((v) => v.voter !== username),
        ...(weight !== 0 ? [{ rshares: weight, voter: username }] : [])
      ]
    : undefined;

  const baseVoteCount =
    entry.stats?.total_votes ||
    legacyVotes?.length ||
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

  return { observerVote, newVotes, nextVoteCount, nextPayout: basePayout + estimated };
}
