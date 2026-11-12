"use client";

import { useQuery } from "@tanstack/react-query";
import { entryVoteOf, getEntryVoteQueryOptions, voteDirection } from "@ecency/sdk";
import type { Entry, ObserverVote } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";

export interface ViewerVote {
  /** The logged-in user's vote, null when none (or not known yet). */
  vote: ObserverVote | null;
  /** True once the vote is known, from the entry or the lookup (or the lookup failed). */
  known: boolean;
  /**
   * True only while the lookup is actually running. Not known and not pending
   * (no entry, lookup disabled, offline so the query is paused) means "act as
   * not voted": nothing is waited for.
   */
  pending: boolean;
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
 * Precedence, when both the entry (read for this user) and a looked-up vote
 * are at hand: the one fetched later wins, by React Query's dataUpdatedAt.
 * Pass the entry query's `dataUpdatedAt` as `entryUpdatedAt`; without it, or
 * on a tie (an optimistic vote writes both at once), the lookup wins.
 *
 * A failed lookup ends the unknown window as "not voted" (`known` true), so
 * the button never stays pending.
 */
export function useViewerVote(
  entry: Entry | null | undefined,
  entryUpdatedAt?: number
): ViewerVote {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const fromEntry = entryVoteOf(entry, username);
  const {
    data: lookedUp,
    dataUpdatedAt: lookupUpdatedAt,
    isError: lookupFailed,
    fetchStatus: lookupFetchStatus
  } = useQuery(
    getEntryVoteQueryOptions(
      entry?.author,
      entry?.permlink,
      username,
      fromEntry === undefined && !!entry && !!username
    )
  );
  let resolved: ObserverVote | null | undefined;
  if (fromEntry !== undefined && lookedUp !== undefined) {
    resolved = (entryUpdatedAt ?? 0) > lookupUpdatedAt ? fromEntry : lookedUp;
  } else {
    resolved = lookedUp !== undefined ? lookedUp : fromEntry;
  }
  const direction = username ? voteDirection(resolved ?? null) : null;
  const known = !!username && (resolved !== undefined || lookupFailed);
  return {
    vote: username ? (resolved ?? null) : null,
    known,
    pending: !!username && !known && lookupFetchStatus === "fetching",
    upVoted: direction === "up",
    downVoted: direction === "down"
  };
}
