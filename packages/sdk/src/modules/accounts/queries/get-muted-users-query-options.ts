import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { Follow } from "../types";
import { callRPC } from "@/modules/core/hive-tx";

/** `condenser_api.get_following` caps a single response at 1000 rows. */
const MUTED_USERS_PAGE_SIZE = 1000;

/**
 * Safety valve for the paging loop: 20 pages is 20k muted accounts, far past
 * any real mute list. Bounds the work if a node ever stops advancing the
 * cursor, so a malformed response degrades to a truncated list rather than an
 * endless request loop.
 */
const MUTED_USERS_MAX_PAGES = 20;

/**
 * Get the full list of accounts a user has muted.
 *
 * Pages until the list is exhausted instead of taking the first N. That is
 * load-bearing: this result dims muted authors in feeds and collapses their
 * comments (`entry-list-item-muted-content`, `discussion-list`), so a truncated
 * list silently renders muted accounts as though they were never muted.
 *
 * Takes no limit, on purpose. `QueryKeys.accounts.mutedUsers` keys on the
 * username alone, so a limit parameter meant callers requesting different
 * amounts shared one cache entry and whichever mounted first decided how much
 * of the list every other caller saw.
 *
 * @param username - The account whose mute list to fetch
 */
export function getMutedUsersQueryOptions(username: string | undefined) {
  return queryOptions({
    queryKey: QueryKeys.accounts.mutedUsers(username!),
    queryFn: async () => {
      const muted: string[] = [];
      let start = "";

      for (let page = 0; page < MUTED_USERS_MAX_PAGES; page++) {
        const response = (await callRPC("condenser_api.get_following", [
          username,
          start,
          "ignore",
          MUTED_USERS_PAGE_SIZE,
        ])) as Follow[];

        if (!response?.length) {
          break;
        }

        let names = response.map((user) => user.following);

        // `start` is exclusive on Hive, so a page should not repeat the cursor.
        // Drop it defensively anyway: against a node treating `start` as
        // inclusive, this loop would otherwise re-append the same account until
        // it hit the page cap.
        if (names[0] === start) {
          names = names.slice(1);
        }

        if (!names.length) {
          break;
        }

        muted.push(...names);

        if (response.length < MUTED_USERS_PAGE_SIZE) {
          break;
        }

        start = names[names.length - 1];
      }

      return muted;
    },
    enabled: !!username,
  });
}
