"use client";

import { VoteButton as BaseVoteButton, type Vote } from "@ecency/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UilHeart } from "@tooni/iconscout-unicons-react";
import clsx from "clsx";
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getEntryVoteQueryOptions,
  isCastVote,
  type ObserverVote,
  QueryKeys,
  useVote,
} from "@ecency/sdk";
import { t } from "@/core";
import { createBroadcastAdapter } from "@/providers/sdk";
import { useAuth, useIsAuthenticated, useIsAuthEnabled } from "../hooks";

interface VoteButtonProps {
  author: string;
  permlink: string;
  /** The post's vote count (`stats.total_votes`). */
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

  const { data: ownVote } = useQuery(
    getEntryVoteQueryOptions(author, permlink, user?.username, !!user?.username),
  );
  const voted = isCastVote(ownVote);
  // Count change from this visitor's votes in this page view.
  const [delta, setDelta] = useState(0);

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

      await voteMutation.mutateAsync({ author, permlink, weight });
      // The vote is only in the mempool yet, so a refetch would not show it:
      // write the visitor's vote into the lookup and move the count.
      const next: ObserverVote | null = weight !== 0 ? { rshares: weight, percent: weight } : null;
      queryClient.setQueryData(QueryKeys.posts.entryVote(author, permlink, user.username), next);
      if (!voted && next) setDelta((d) => d + 1);
      if (voted && !next) setDelta((d) => d - 1);
    },
    [user, author, permlink, voteMutation, queryClient, voted]
  );

  const handleAuthRequired = useCallback(() => {
    navigate({
      to: "/login",
      search: { redirect: `/@${author}/${permlink}` },
    });
  }, [navigate, author, permlink]);

  const ownRow: Vote[] =
    voted && user ? [{ voter: user.username, percent: ownVote!.percent ?? 10000, rshares: ownVote!.rshares }] : [];
  const count = Math.max(0, (totalVotes || 0) + delta);

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
