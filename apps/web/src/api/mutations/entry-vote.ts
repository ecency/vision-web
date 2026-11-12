"use client";

import { Entry } from "@/entities";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useVoteMutation } from "@/api/sdk-mutations";
import { deriveOptimisticVote } from "./derive-optimistic-vote";
import { useQueryClient } from "@tanstack/react-query";
import { ObserverVote } from "@/entities";
import { entryVoteOf, isCastVote, QueryKeys } from "@ecency/sdk";
import { pickViewerVote } from "@/core/hooks/use-viewer-vote";

/** Same vote: both not cast, or both cast with the same weight. */
function sameVote(a: ObserverVote | null, b: ObserverVote | null): boolean {
  const castA = isCastVote(a);
  const castB = isCastVote(b);
  if (castA !== castB) return false;
  return !castA || a!.percent === b!.percent;
}

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

      // Broadcast vote via SDK (SDK updates its own cache optimistically)
      await sdkMutation.mutateAsync({
        author: entry.author,
        permlink: entry.permlink,
        weight,
        estimated,
      });

      // Optimistically reflect the vote on the web cache key: the user's
      // observer_vote, the count and the payout. Derived from the entry cached
      // NOW, after the broadcast: a post refetch may have landed meanwhile,
      // and the SDK's own vote cache update usually already applied this vote
      // to the same entry (then there is nothing left to do, and doing it
      // again would add the payout estimate twice). The SDK's deferred
      // invalidation reconciles the authoritative values afterwards.
      //
      // The vote is already broadcast at this point, so a failure in this local
      // cache update must not bubble up as a vote error.
      try {
        const username = activeUser.username;
        const entryQueryKey = EcencyEntriesCacheManagement.getEntryQuery(entry).queryKey;
        const cached = queryClient.getQueryData<Entry>(entryQueryKey);
        if (!cached) return;
        const next: ObserverVote | null = weight !== 0 ? { rshares: null, percent: weight } : null;
        const inEntry = entryVoteOf(cached, username);
        if (inEntry !== undefined && sameVote(inEntry, next)) return;

        // The prior vote: the newer of the entry (read for this user) and the
        // looked-up vote, the same rule the vote button shows.
        const lookupKey = QueryKeys.posts.entryVote(entry.author, entry.permlink, username);
        const prior = pickViewerVote(
          inEntry,
          queryClient.getQueryState(entryQueryKey)?.dataUpdatedAt,
          queryClient.getQueryData<ObserverVote | null>(lookupKey),
          queryClient.getQueryState(lookupKey)?.dataUpdatedAt
        );
        const { observerVote, nextVoteCount, nextPayout } = deriveOptimisticVote(
          cached,
          weight,
          estimated,
          username,
          prior
        );
        updateVotes({
          voter: username,
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
