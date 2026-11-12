import { useBroadcastMutation, QueryKeys, getQueryClient } from "@/modules/core";
import type { BroadcastMode } from "@/modules/core";
import { buildVoteOp } from "@/modules/operations/builders";
import type { AuthContextV2 } from "@/modules/core/types";
import type { QueryClient } from "@tanstack/react-query";
import { EntriesCacheManagement } from "../cache/entries-cache-management";
import type { ObserverVote } from "../types";
import { entryVoteOf, isCastVote } from "../utils/normalize-entry";

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
 * Post-broadcast optimistic cache update for a vote on a cached entry: sets
 * the voter's `observer_vote`, the count and the payout (see
 * applyObserverVoteUpdate). Skipped when the cache already reflects this vote
 * (a platform's at-press optimistic layer applied it), when the voter's prior
 * vote is unknown, and for lightweight rows without a numeric payout and a
 * `stats.total_votes` count (waves feed rows), which the platform updates
 * itself; the deferred invalidation reconciles all of them.
 */
export function applyVoteCacheUpdate(
  username: string | undefined,
  variables: VotePayload,
  qc?: QueryClient
): void {
  const entry = EntriesCacheManagement.getEntry(variables.author, variables.permlink, qc);
  if (!entry || !username) return;
  if (typeof entry.payout !== "number" || !Number.isFinite(entry.payout)) return;
  if (typeof entry.stats?.total_votes !== "number") return;
  applyObserverVoteUpdate(entry, username, variables, qc);
}

/**
 * Entries carry no voter list: the voter's prior vote comes from the entry
 * when it was read for this voter, else from the `entryVote` lookup cache.
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

  const hadVote = isCastVote(prior);
  const weight = variables.weight;
  const reflected = weight !== 0 ? hadVote && prior!.percent === weight : !hadVote;
  if (reflected) return;

  const next: ObserverVote | null = weight !== 0 ? { rshares: weight, percent: weight } : null;
  const base = entry.stats!.total_votes;
  const total =
    !hadVote && next !== null ? base + 1 : hadVote && next === null ? Math.max(0, base - 1) : base;
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
