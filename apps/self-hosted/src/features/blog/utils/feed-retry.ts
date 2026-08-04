/**
 * Which operation a feed's retry button should run.
 *
 * An infinite query has two ways to fail and one error flag shared between
 * them, so "the feed is in an error state" does not say what to retry. Picking
 * off `hasNextPage` gets it wrong in the case that matters: a refresh of the
 * pages already loaded can fail while there are still more pages to come, and
 * calling `fetchNextPage` then appends a page and clears the error while
 * leaving the pages the reader is actually looking at exactly as stale as they
 * were. The failure disappears from the screen without having been fixed.
 *
 * `isFetchNextPageError` and `isRefetchError` are query-core's own answer to
 * which of the two failed, so retry the one that did.
 */
export type FeedRetry = 'next-page' | 'refresh';

export interface FeedErrorFlags {
  /** The last `fetchNextPage` failed. */
  isFetchNextPageError: boolean;
  /** The last refetch of the loaded pages failed. */
  isRefetchError: boolean;
}

export function chooseFeedRetry({
  isFetchNextPageError,
  isRefetchError,
}: FeedErrorFlags): FeedRetry {
  if (isFetchNextPageError) {
    return 'next-page';
  }
  if (isRefetchError) {
    return 'refresh';
  }
  // Neither flag set while the feed still shows an error: the failure came from
  // somewhere other than those two operations. Refreshing re-validates
  // everything already on screen, so it is the answer that cannot leave a stale
  // page behind; appending is the one that can.
  return 'refresh';
}
