"use client";

import { VoteButton as BaseVoteButton, type Vote } from "@ecency/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UilHeart } from "@tooni/iconscout-unicons-react";
import clsx from "clsx";
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  type Entry,
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
   * The post's vote count (`stats.total_votes`), read from the entry cache by
   * the caller, so the SDK's optimistic vote update moves it.
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

  const { data: ownVote } = useQuery(
    getEntryVoteQueryOptions(author, permlink, user?.username, !!user?.username),
  );
  const voted = isCastVote(ownVote);

  // A count correction for the cases the SDK's vote cache update cannot move
  // the count: a cross-post (the entry under author/permlink is not cached)
  // and a vote cast before the lookup answered (prior vote unknown). It is
  // tied to the post and to the count it was made against, so a refetch that
  // brings a new count drops it (never counted twice).
  const postKey = `${author}/${permlink}`;
  const [correction, setCorrection] = useState<{ postKey: string; base: number; delta: number } | null>(
    null
  );

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

      const entryKey = QueryKeys.posts.entry(`/@${author}/${permlink}`);
      const before = queryClient.getQueryData<Entry>(entryKey)?.stats?.total_votes;
      await voteMutation.mutateAsync({ author, permlink, weight });
      const after = queryClient.getQueryData<Entry>(entryKey)?.stats?.total_votes;
      const sdkMovedCount = before !== undefined && after !== before;
      // The vote is only in the mempool yet, so a refetch would not show it:
      // write the visitor's vote into the lookup. The count is NOT moved here:
      // the SDK's vote cache update already moves stats.total_votes in the
      // entry the page reads (`totalVotes` comes from it).
      const next: ObserverVote | null = weight !== 0 ? { rshares: weight, percent: weight } : null;
      queryClient.setQueryData(QueryKeys.posts.entryVote(author, permlink, user.username), next);
      recordOptimisticVote(author, permlink, user.username, next);
      if (!sdkMovedCount) {
        // `voted` is what the button showed: unknown counts as not voted, as
        // the button treated it (it cast a vote rather than removing one).
        const delta = next && !voted ? 1 : !next && voted ? -1 : 0;
        if (delta !== 0) {
          setCorrection({ postKey: `${author}/${permlink}`, base: totalVotes || 0, delta });
        }
      }
    },
    [user, author, permlink, voteMutation, queryClient, voted, totalVotes]
  );

  const handleAuthRequired = useCallback(() => {
    navigate({
      to: "/login",
      search: { redirect: `/@${author}/${permlink}` },
    });
  }, [navigate, author, permlink]);

  const ownRow: Vote[] =
    voted && user ? [{ voter: user.username, percent: ownVote!.percent ?? 10000, rshares: ownVote!.rshares }] : [];
  const base = totalVotes || 0;
  const delta =
    correction && correction.postKey === postKey && correction.base === base ? correction.delta : 0;
  const count = Math.max(0, base + delta);

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
