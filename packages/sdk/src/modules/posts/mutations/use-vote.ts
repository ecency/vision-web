import { useBroadcastMutation, QueryKeys, getQueryClient } from "@/modules/core";
import type { BroadcastMode } from "@/modules/core";
import { buildVoteOp } from "@/modules/operations/builders";
import type { AuthContextV2 } from "@/modules/core/types";
import type { QueryClient } from "@tanstack/react-query";
import { EntriesCacheManagement } from "../cache/entries-cache-management";
import type { ObserverVote } from "../types";
import { entryVoteOf } from "../utils/normalize-entry";

/**
 * Whether the cached active_votes list already reflects the broadcast vote:
 * the voter is present for a vote (weight !== 0) or absent for an unvote
 * (weight === 0). Used to avoid stacking the SDK's post-broadcast optimistic
 * update on top of a platform-level optimistic update applied at press time.
 */
export function isVoteAlreadyReflected(
  activeVotes: Array<{ voter: string }>,
  voter: string | undefined,
  weight: number
): boolean {
  const hasVoterRecord = activeVotes.some((v) => v.voter === voter);
  return weight !== 0 ? hasVoterRecord : !hasVoterRecord;
}

/**
 * Payload for voting on a post or comment.
 */
export interface VotePayload {
  /** Author of the post/comment to vote on */
  author: string;
  /** Permlink of the post/comment to vote on */
  permlink: string;
  /** Vote weight (-10000 to 10000, where 10000 = 100% upvote, -10000 = 100% downvote) */
  weight: number;
  /** Optional estimated payout change for optimistic UI */
  estimated?: number;
}

/**
 * Post-broadcast optimistic cache update for a vote: replaces the voter's
 * active_votes record and bumps the payout by `estimated`. Skipped when the
 * cached entry already reflects this vote (voter present for a vote, absent
 * for an unvote): platforms with their own at-press optimistic layer (e.g.
 * the mobile app) have applied it by the time the broadcast resolves, and
 * stacking a second update here double-counts the payout and clobbers the
 * platform's richer vote record until the deferred invalidation.
 */
export function applyVoteCacheUpdate(
  username: string | undefined,
  variables: VotePayload,
  qc?: QueryClient
): void {
  const entry = EntriesCacheManagement.getEntry(variables.author, variables.permlink, qc);
  if (entry && username && !Array.isArray(entry.active_votes)) {
    applyObserverVoteUpdate(entry, username, variables, qc);
    return;
  }
  if (
    !entry?.active_votes ||
    isVoteAlreadyReflected(entry.active_votes, username, variables.weight)
  ) {
    return;
  }
  const newVotes = [
    ...entry.active_votes.filter((v) => v.voter !== username),
    ...(variables.weight !== 0 ? [{ rshares: variables.weight, voter: username! }] : [])
  ];
  const newPayout = entry.payout + (variables.estimated ?? 0);
  EntriesCacheManagement.updateVotes(
    variables.author,
    variables.permlink,
    newVotes,
    newPayout,
    qc
  );
}

/**
 * Bridge v2 entries carry no voter list: the voter's prior vote comes from
 * the entry when it was read for this voter, else from the `entryVote`
 * lookup cache. Unknown prior vote: no write (the deferred invalidation
 * reconciles). Same "already reflected" rule as the list path, so a
 * platform's at-press optimistic layer is not applied twice.
 */
function applyObserverVoteUpdate(
  entry: NonNullable<ReturnType<typeof EntriesCacheManagement.getEntry>>,
  username: string,
  variables: VotePayload,
  qc?: QueryClient
): void {
  let prior = entryVoteOf(entry, username);
  if (prior === undefined) {
    const queryClient = qc ?? getQueryClient();
    prior = queryClient.getQueryData<ObserverVote | null>(
      QueryKeys.posts.entryVote(variables.author, variables.permlink, username)
    );
  }
  if (prior === undefined) return;

  const weight = variables.weight;
  const reflected = weight !== 0 ? prior !== null && prior.percent === weight : prior === null;
  if (reflected) return;

  const next: ObserverVote | null = weight !== 0 ? { rshares: weight, percent: weight } : null;
  const base = entry.stats?.total_votes ?? entry.total_votes ?? 0;
  const total =
    prior === null && next !== null ? base + 1 : prior !== null && next === null ? Math.max(0, base - 1) : base;
  EntriesCacheManagement.updateObserverVote(
    variables.author,
    variables.permlink,
    username,
    next,
    entry.payout + (variables.estimated ?? 0),
    total,
    qc
  );
}

/**
 * React Query mutation hook for voting on posts and comments.
 *
 * This mutation broadcasts a vote operation to the Hive blockchain,
 * supporting upvotes (positive weight) and downvotes (negative weight).
 *
 * @param username - The username of the voter (required for broadcast)
 * @param auth - Authentication context with platform adapter and fallback configuration
 *
 * @returns React Query mutation result
 *
 * @remarks
 * **Post-Broadcast Actions:**
 * - Records activity (type 120) if adapter.recordActivity is available
 * - Invalidates post cache to refetch updated vote data
 * - Invalidates voting power cache to show updated VP
 *
 * **Vote Weight:**
 * - 10000 = 100% upvote
 * - 0 = remove vote
 * - -10000 = 100% downvote
 *
 * @example
 * ```typescript
 * const voteMutation = useVote(username, {
 *   adapter: myAdapter,
 *   enableFallback: true,
 *   fallbackChain: ['keychain', 'key', 'hivesigner']
 * });
 *
 * // Upvote a post
 * voteMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post',
 *   weight: 10000
 * });
 *
 * // Remove vote
 * voteMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post',
 *   weight: 0
 * });
 *
 * // Downvote
 * voteMutation.mutate({
 *   author: 'alice',
 *   permlink: 'my-awesome-post',
 *   weight: -10000
 * });
 * ```
 *
 * @remarks
 * broadcastMode: async — Votes don't require block confirmation.
 * The vote is accepted into the mempool immediately; UI can optimistically update.
 */
export function useVote(
  username: string | undefined,
  auth?: AuthContextV2,
  broadcastMode?: BroadcastMode
) {
  return useBroadcastMutation<VotePayload>(
    ["posts", "vote"],
    username,
    ({ author, permlink, weight }) => [
      buildVoteOp(username!, author, permlink, weight)
    ],
    async (result: any, variables) => {
      // Optimistic vote list + payout update (no-op when the cache already
      // reflects this vote — see applyVoteCacheUpdate).
      applyVoteCacheUpdate(username, variables);

      // Activity tracking (fire-and-forget — non-critical, shouldn't block mutation completion)
      // Async broadcasts return BroadcastResult ({ tx_id, status }) instead of TransactionConfirmation,
      // so fall back to tx_id when id is absent.
      const txId = result?.id ?? result?.tx_id;
      if (auth?.adapter?.recordActivity && txId) {
        auth.adapter.recordActivity(120, txId, result?.block_num).catch(() => {});
      }

      // Cache invalidation — deferred for async broadcasts since onSuccess fires
      // at mempool acceptance before block inclusion.
      if (auth?.adapter?.invalidateQueries) {
        const doInvalidate = () => {
          auth.adapter!.invalidateQueries!([
            QueryKeys.posts.entry(`/@${variables.author}/${variables.permlink}`),
            QueryKeys.accounts.full(username)
          ]);
        };
        const mode = broadcastMode ?? 'async';
        if (mode === 'async') {
          setTimeout(doInvalidate, 4000);
        } else {
          doInvalidate();
        }
      }
    },
    auth,
    'posting',
    { broadcastMode: broadcastMode ?? 'async' }
  );
}
