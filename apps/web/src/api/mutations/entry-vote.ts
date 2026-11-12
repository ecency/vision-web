"use client";

import { Entry } from "@/entities";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useVoteMutation } from "@/api/sdk-mutations";
import { deriveOptimisticVote } from "./derive-optimistic-vote";
import { useQueryClient } from "@tanstack/react-query";
import { ObserverVote } from "@/entities";
import { QueryKeys } from "@ecency/sdk";

/**
 * Entry vote mutation hook.
 *
 * SDK handles: broadcast, optimistic SDK cache update, activity tracking, invalidation.
 * Web wrapper handles: web-specific cache key bridging + optimistic count/payout.
 */
export function useEntryVote(entry?: Entry | null) {
  const { activeUser } = useActiveAccount();

  const { update: updateVotes } = EcencyEntriesCacheManagement.useUpdateVotes(entry);

  const sdkMutation = useVoteMutation();
  const queryClient = useQueryClient();

  return {
    ...sdkMutation,
    mutate: undefined,
    mutateAsync: async ({ weight, estimated }: { weight: number; estimated: number }) => {
      if (!entry) throw new Error("Entry not provided");
      if (!activeUser) throw new Error("Active user not provided");

      // The user's vote before this one, when the entry was read for another
      // observer: the lookup the vote button made (useViewerVote). Read BEFORE
      // the broadcast, whose SDK cache update writes the new vote there.
      const priorVote = queryClient.getQueryData<ObserverVote | null>(
        QueryKeys.posts.entryVote(entry.author, entry.permlink, activeUser.username)
      );

      // Broadcast vote via SDK (SDK updates its own cache optimistically)
      await sdkMutation.mutateAsync({
        author: entry.author,
        permlink: entry.permlink,
        weight,
        estimated,
      });

      // Optimistically reflect the vote on the web cache key: the user's
      // observer_vote, the count and the payout. Neither bridge v2 entries nor
      // the unified waves feed carry an `active_votes` list, so nothing here
      // depends on one. The SDK's deferred
      // invalidation reconciles the authoritative values afterwards.
      //
      // The vote is already broadcast at this point, so a failure in this local
      // cache update must not bubble up as a vote error; the deferred
      // invalidation reconciles regardless.
      try {
        const { observerVote, nextVoteCount, nextPayout } = deriveOptimisticVote(
          entry,
          weight,
          estimated,
          activeUser.username,
          priorVote
        );
        updateVotes({
          voter: activeUser.username,
          observerVote,
          payout: nextPayout,
          totalVotes: nextVoteCount
        });
      } catch {
        // no-op: reconciled by the SDK's deferred invalidation
      }
    },
  };
}
