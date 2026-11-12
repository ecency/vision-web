"use client";

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { UilHeart } from "@tooni/iconscout-unicons-react";
import { Entry } from "@/entities";
import { LoginRequired } from "@/features/shared";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useViewerVote } from "@/core/hooks/use-viewer-vote";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useEntryVote } from "@/api/mutations";
import { getVoteValue, voteValueKey } from "@/features/shared/entry-vote-btn/utils";
import { error } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";

/**
 * TikTok-style like for the reels rail: the heart IS the upvote button — tap to
 * upvote at the user's default weight, tap again to remove — with a live count
 * below. Replaces the feed's chevron + vote-slider, which looked orphaned in the
 * rail and whose slider popover was clipped by the snap scroll-container. Reads
 * the cached entry so the count/voted state update immediately after voting.
 */
export function ReelVoteButton({ entry: initialEntry }: { entry: Entry }) {
  const { activeUser } = useActiveAccount();
  const { data: cached, dataUpdatedAt: entryUpdatedAt } = useQuery(
    EcencyEntriesCacheManagement.getEntryQuery(initialEntry)
  );
  const entry = cached ?? initialEntry;

  const { mutateAsync: vote, isPending } = useEntryVote(entry);

  // The user's own upvote (never the SSR observer's): see useViewerVote.
  const viewerVote = useViewerVote(entry, entryUpdatedAt);
  const isVoted = viewerVote.upVoted;
  // The user's own vote is still being looked up: no tap is taken until it is
  // known, or a tap could raise or replace an existing vote instead of
  // removing it.
  const votePending = viewerVote.pending;

  // Mirror the feed's EntryVotes count (incl. the top-level total_votes fallback)
  // so the rail matches the rest of the app and never drops a real count.
  const count = useMemo(
    () =>
      // `??`: a stats.total_votes of 0 is a count, not "absent".
      entry.stats?.total_votes ??
      (entry.active_votes?.length || entry.net_votes || entry.total_votes || 0),
    [entry]
  );

  const onVote = async () => {
    if (!activeUser || isPending || votePending) {
      return;
    }
    try {
      if (isVoted) {
        // Tap again removes the vote.
        await vote({ weight: 0, estimated: 0 });
      } else {
        // Upvote at the user's saved/default weight (estimated is display-only;
        // the SDK reconciles the authoritative payout afterwards).
        const percent = getVoteValue(
          "up",
          // The same per-post key the vote slider writes (author/permlink).
          voteValueKey(activeUser.username, entry),
          getVoteValue("upPrevious", activeUser.username, 100, false),
          false
        );
        await vote({ weight: Math.ceil(percent * 100), estimated: 0 });
      }
    } catch (e) {
      error(...formatError(e));
    }
  };

  return (
    <LoginRequired promptOnAnon>
      <button
        type="button"
        onClick={onVote}
        disabled={isPending || votePending}
        aria-busy={votePending ? true : undefined}
        className={`waves-reel-rail__item waves-reel-rail__vote${isVoted ? " is-voted" : ""}`}
        aria-pressed={isVoted}
        aria-label={i18next.t("entry-vote-btn.vote", { defaultValue: "Vote" })}
      >
        <UilHeart className="size-7" />
        <span>{count}</span>
      </button>
    </LoginRequired>
  );
}
