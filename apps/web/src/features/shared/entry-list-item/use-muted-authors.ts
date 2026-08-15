"use client";

import { useQuery } from "@tanstack/react-query";
import { getMutedUsersQueryOptions, isAuthorMuted } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";

/**
 * The viewer's own mute list, or undefined while it is unknown (nobody logged
 * in, or the query has not resolved yet).
 *
 * Muting an author takes their posts out of the viewer's lists entirely, the
 * same as the mobile app, rather than leaving a dimmed placeholder behind. The
 * bridge still returns them (an observer only marks content), so the filtering
 * is ours to do, and it belongs to whoever owns the list: dropping a card from
 * inside the card leaves the parent's wrapper and empty-state behind.
 *
 * This is client-only data, so a muted author's post is in the server HTML and
 * disappears once the list resolves.
 */
export function useMutedAuthors(): string[] | undefined {
  const { activeUser } = useActiveAccount();
  const { data } = useQuery(getMutedUsersQueryOptions(activeUser?.username));

  return activeUser ? data : undefined;
}

/** Convenience for a list of one, such as a bookmark. */
export function useIsAuthorMuted(author: string | undefined): boolean {
  return isAuthorMuted(author, useMutedAuthors());
}
