"use client";

import { useMemo } from "react";
import { isAuthorMuted } from "@ecency/sdk";
import { useMutedAuthors } from "@/features/shared/entry-list-item/use-muted-authors";

/** Pages in a row that showed nothing before a list stops loading on its own. */
export const HIDDEN_PAGES_BEFORE_PAUSE = 3;

/**
 * How many of the newest pages, counted back from the last, the viewer can see
 * nothing on: every entry is by an author they muted, or a list-side filter
 * (e.g. no reblogs) emptied the page.
 */
export function countTrailingHiddenPages<T extends { author?: string }>(
  pages: T[][],
  mutedAuthors: string[] | undefined
): number {
  let hidden = 0;
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pages[i].some((entry) => !isAuthorMuted(entry.author, mutedAuthors))) break;
    hidden++;
  }
  return hidden;
}

/**
 * True once the newest pages have stayed hidden for a while. A list that hides
 * everything it loads keeps its bottom sentinel on screen, so without this it
 * pages through the whole source on its own (35k posts on a busy muted
 * profile). Paused, `DetectBottom` waits for the user to scroll instead.
 *
 * `pages` must be the client-fetched pages after any list-side filter, and
 * should be memoised by the caller.
 */
export function useAutoPagingPaused<T extends { author?: string }>(pages: T[][]): boolean {
  const mutedAuthors = useMutedAuthors();
  return useMemo(
    () => countTrailingHiddenPages(pages, mutedAuthors) >= HIDDEN_PAGES_BEFORE_PAUSE,
    [pages, mutedAuthors]
  );
}
