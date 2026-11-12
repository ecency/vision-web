"use client";

import { VoteButton as BaseVoteButton, type Vote } from "@ecency/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UilHeart } from "@tooni/iconscout-unicons-react";
import clsx from "clsx";
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getEntryActiveVotesQueryOptions, QueryKeys, useVote } from "@ecency/sdk";
import { t } from "@/core";
import { createBroadcastAdapter } from "@/providers/sdk";
import { useAuth, useIsAuthenticated, useIsAuthEnabled } from "../hooks";

interface VoteButtonProps {
  author: string;
  permlink: string;
  /**
   * Voters to count and to find the user in. Omitted: the post's full list is
   * loaded (bridge.list_votes, paged): entries no longer carry one, and that
   * list has the `percent` the base button reads to tell a vote is cast.
   */
  activeVotes?: Vote[];
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

export function VoteButton({
  author,
  permlink,
  activeVotes,
  showCount = true,
  className,
}: VoteButtonProps) {
  const { user } = useAuth();
  const isAuthenticated = useIsAuthenticated();
  const isAuthEnabled = useIsAuthEnabled();
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const { data: loadedVotes } = useQuery({
    ...getEntryActiveVotesQueryOptions({ author, permlink }),
    enabled: !activeVotes && !!author && !!permlink,
  });
  const votes = activeVotes ?? (loadedVotes as unknown as Vote[] | undefined) ?? [];

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
      // The voter list drives the heart and the count here. The vote is only
      // in the mempool yet, so a refetch would not show it: write the user's
      // row into the cached list instead.
      queryClient.setQueryData<Vote[]>(
        QueryKeys.posts.entryActiveVotes(author, permlink),
        (prev) => {
          if (!prev) return prev;
          const others = prev.filter((v) => v.voter !== user.username);
          return weight === 0
            ? others
            : [...others, { voter: user.username, percent: weight, weight, rshares: weight }];
        },
      );
    },
    [user, author, permlink, voteMutation, queryClient]
  );

  const handleAuthRequired = useCallback(() => {
    navigate({
      to: "/login",
      search: { redirect: `/@${author}/${permlink}` },
    });
  }, [navigate, author, permlink]);

  return (
    <BaseVoteButton
      author={author}
      permlink={permlink}
      activeVotes={votes}
      currentUser={user?.username}
      isVotingEnabled={isAuthEnabled}
      isAuthenticated={isAuthenticated}
      onVote={handleVote}
      onAuthRequired={handleAuthRequired}
      showCount={showCount}
      className={className}
      labels={{
        likes: t("likes"),
        login: t("login_to_vote"),
      }}
      icon={<HeartIcon className="size-4" />}
    />
  );
}
