"use client";

import { VoteButton as BaseVoteButton, type Vote } from "@ecency/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UilHeart } from "@tooni/iconscout-unicons-react";
import clsx from "clsx";
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getEntryVoteQueryOptions,
  isCastVote,
  type ObserverVote,
  QueryKeys,
  recordOptimisticVote,
  useVote,
} from "@ecency/sdk";
import { t } from "@/core";
import { createBroadcastAdapter } from "@/providers/sdk";
import { useAuth, useIsAuthenticated, useIsAuthEnabled } from "../hooks";

interface VoteButtonProps {
  author: string;
  permlink: string;
  /**
   * The post's vote count (`stats.total_votes`), read by the caller from the
   * entry cache key of THIS post (author/permlink), the one the SDK's vote
   * update moves. Use PostLikes, which does that.
   */
  totalVotes: number;
  showCount?: boolean;
  className?: string;
}

function HeartIcon({
  filled,
  className,
}: {
  filled?: boolean;
  className?: string;
}) {
  return <UilHeart className={clsx(className ?? "size-4", filled && "fill-current")} />;
}

/**
 * Like button for a post. The count is the post's `stats.total_votes`; no
 * voter list is loaded. A logged-in visitor's own vote is one batched lookup
 * (`getEntryVoteQueryOptions`); anonymous visitors cost no request at all.
 * The base button finds the user in `activeVotes`, so it is handed just that
 * one row, and the count is rendered here.
 */
export function VoteButton({
  author,
  permlink,
  totalVotes,
  showCount = true,
  className,
}: VoteButtonProps) {
  const { user } = useAuth();
  const isAuthenticated = useIsAuthenticated();
  const isAuthEnabled = useIsAuthEnabled();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // No retries: the lookup is cheap and batched, and a click waits for it
  // (below), so a retrying lookup would stall the vote through the backoff.
  // A failed lookup leaves the vote unknown until the next read.
  const { data: ownVote } = useQuery({
    ...getEntryVoteQueryOptions(author, permlink, user?.username, !!user?.username),
    retry: false,
  });
  const voted = isCastVote(ownVote);

  const adapter = createBroadcastAdapter();
  const voteMutation = useVote(user?.username, { adapter });

  const handleVote = useCallback(
    async ({
      weight,
    }: {
      author: string;
      permlink: string;
      weight: number;
    }) => {
      if (!user) return;

      // The SDK's vote cache update moves the count by the voter's PRIOR vote
      // (+1 for a first vote; 0 for a new weight, an unvote, or a vote over a
      // removed vote, whose row hivemind still counts), and skips when it does
      // not know it. So the prior vote is known before the broadcast: a click that
      // came before the lookup answered waits for it (the same request).
      let priorKnown = ownVote !== undefined;
      if (!priorKnown) {
        try {
          await queryClient.fetchQuery({
            ...getEntryVoteQueryOptions(author, permlink, user.username),
            retry: false,
          });
          priorKnown = true;
        } catch {
          // Lookup failed: vote anyway; the count catches up on the next read.
        }
      }
      await voteMutation.mutateAsync({ author, permlink, weight });
      // The vote is only in the mempool yet, so a refetch would not show it:
      // write the visitor's vote into the lookup. The count is NOT moved here:
      // the SDK's vote cache update already moves stats.total_votes in the
      // entry the page reads (`totalVotes` comes from it).
      // Only when the prior vote was known: writing the cast vote over an
      // unknown prior would let a quick second click (now an unvote) take one
      // from a count the SDK never moved up. Unknown stays unknown.
      if (priorKnown) {
        // No rshares yet: the node computes them once the vote is in a block.
        // An unvote leaves a percent-0 row (#2070): not cast, still counted.
        const next: ObserverVote =
          weight !== 0 ? { rshares: null, percent: weight } : { rshares: 0, percent: 0 };
        queryClient.setQueryData(QueryKeys.posts.entryVote(author, permlink, user.username), next);
        recordOptimisticVote(author, permlink, user.username, next);
      }
    },
    [user, author, permlink, voteMutation, queryClient, ownVote]
  );

  const handleAuthRequired = useCallback(() => {
    navigate({
      to: "/login",
      search: { redirect: `/@${author}/${permlink}` },
    });
  }, [navigate, author, permlink]);

  const ownRow: Vote[] =
    voted && user
      ? [{ voter: user.username, percent: ownVote!.percent ?? 10000, rshares: ownVote!.rshares ?? undefined }]
      : [];
  // Shown as given: the caller reads it from the entry the SDK's vote update
  // moves (see PostLikes). The button does no count arithmetic of its own.
  const count = Math.max(0, totalVotes || 0);

  return (
    <span className="flex items-center gap-1">
      <BaseVoteButton
        author={author}
        permlink={permlink}
        activeVotes={ownRow}
        currentUser={user?.username}
        isVotingEnabled={isAuthEnabled}
        isAuthenticated={isAuthenticated}
        onVote={handleVote}
        onAuthRequired={handleAuthRequired}
        showCount={false}
        className={className}
        labels={{
          likes: t("likes"),
          login: t("login_to_vote"),
        }}
        icon={<HeartIcon className="size-4" filled={voted} />}
      />
      {showCount && (
        <span>
          {count} {t("likes")}
        </span>
      )}
    </span>
  );
}
