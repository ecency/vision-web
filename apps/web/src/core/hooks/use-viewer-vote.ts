"use client";

import { useQuery } from "@tanstack/react-query";
import { entryVoteOf, getEntryVoteQueryOptions, voteDirection } from "@ecency/sdk";
import type { Entry, ObserverVote } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";

export interface ViewerVote {
  /** The logged-in user's vote, null when none (or not known yet). */
  vote: ObserverVote | null;
  /** True once the vote is known, from the entry or the lookup. */
  known: boolean;
  upVoted: boolean;
  downVoted: boolean;
}

/**
 * The logged-in user's own vote on `entry`.
 *
 * An entry carries `observer_vote` for the observer it was read for
 * (`observer_vote_for`). Server renders and the profile, community and entry
 * caches read as the default observer, so for a logged-in user that vote is
 * usually someone else's: it is never used then. Instead the user's vote is
 * looked up once (`getEntryVoteQueryOptions`, one small database_api call,
 * shared by every component showing the same entry, and batched with the
 * other cards' lookups into one request). Until it answers, `known` is false
 * and the vote is neither shown as cast nor as "not voted".
 *
 * Precedence: a looked-up vote already in the cache wins over the entry's.
 * Every optimistic vote writes that cache, while the entry may have been read
 * before the vote; the entry is used when no lookup answer exists.
 */
export function useViewerVote(entry: Entry | null | undefined): ViewerVote {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const fromEntry = entryVoteOf(entry, username);
  const { data: lookedUp } = useQuery(
    getEntryVoteQueryOptions(
      entry?.author,
      entry?.permlink,
      username,
      fromEntry === undefined && !!entry && !!username
    )
  );
  const resolved = lookedUp !== undefined ? lookedUp : fromEntry;
  const direction = username ? voteDirection(resolved ?? null) : null;
  return {
    vote: username ? (resolved ?? null) : null,
    known: !!username && resolved !== undefined,
    upVoted: direction === "up",
    downVoted: direction === "down"
  };
}
