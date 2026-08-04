/**
 * What a query has actually established, as a single value.
 *
 * The defect this exists for: failure and emptiness were indistinguishable at
 * every reading surface, so a request that did not come back was rendered as a
 * factual claim about the author's work. A post with a live discussion read
 * "No comments yet. Be the first to comment!" once the retries gave up, and the
 * owner of a running community was told "Community not found." on one RPC blip.
 *
 * React Query keeps `data` from the last success when a later fetch fails, so
 * two facts have to be read together rather than either one alone. Reading only
 * `data` turns a failure into emptiness. Reading only `isError` throws away
 * content that is still on screen and still perfectly good.
 *
 * The order in `resolveQueryOutcome` is the whole of the fix:
 *
 *   1. Content already loaded outweighs a later failure. Sixty posts and the
 *      reader's scroll position are not discarded because page three timed out.
 *   2. Emptiness is only ever claimed off a success, or off a query that was
 *      never asked because its inputs name nothing. Nothing else proves it.
 *   3. Everything else is "we do not know yet", which includes a fetch paused
 *      while offline: that reports no data, no error and no loading at all.
 */

export interface QueryFacts {
  /**
   * The query's `isEnabled`. False when its own preconditions are unmet, for
   * example a post URL carrying no permlink or an instance with no username
   * configured. Such a query has asked nothing and will never answer.
   */
  isEnabled: boolean;
  /** The query's `isError`: the last attempt failed and its retries are spent. */
  isError: boolean;
  /** The query's `isSuccess`: it has resolved successfully at least once. */
  isSuccess: boolean;
  /**
   * Whether anything the caller can actually render is on screen right now.
   * Not simply `data !== undefined`: a discussion response carries the root
   * post itself, so the caller passes the count of the thing it renders.
   */
  hasContent: boolean;
}

export type QueryOutcome =
  /** Content on screen and nothing outstanding against it. */
  | 'content'
  /** Content on screen and the latest attempt failed. Keep it, and say so. */
  | 'stale'
  /** Nothing on screen, and the attempt failed. Say that, not "nothing here". */
  | 'failed'
  /** A successful response returned nothing. The only proof of emptiness. */
  | 'empty'
  /** Never asked, because the inputs name nothing to fetch. */
  | 'unasked'
  /** Asked, no answer yet. Also covers a fetch paused while offline. */
  | 'pending';

export function resolveQueryOutcome({
  isEnabled,
  isError,
  isSuccess,
  hasContent,
}: QueryFacts): QueryOutcome {
  // Content first, deliberately: this single line is what stops a failed
  // page-three fetch from wiping the two pages the reader is looking at.
  if (hasContent) {
    return isError ? 'stale' : 'content';
  }
  if (isError) {
    return 'failed';
  }
  if (isSuccess) {
    return 'empty';
  }
  if (!isEnabled) {
    return 'unasked';
  }
  return 'pending';
}

/**
 * Whether a component may state that there is nothing to show.
 *
 * True for 'empty', where a response came back carrying nothing, and for
 * 'unasked', where no request was ever made because the inputs name nothing to
 * fetch. Both are established: one by an answer, one by the absence of a
 * question.
 *
 * Never true for 'failed', 'stale' or 'pending'. In those the app does not
 * know, and saying "no posts" or "post not found" there is the lie this module
 * exists to remove. Every emptiness message in the app is gated on this call,
 * and a source guard fails the build if a new one is not.
 */
export function nothingToShow(outcome: QueryOutcome): boolean {
  return outcome === 'empty' || outcome === 'unasked';
}
