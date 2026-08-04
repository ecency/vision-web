import type { QueryOutcome } from '@/features/shared/query-outcome';

/**
 * Evidence that the post being edited was read successfully during this mount.
 *
 * Both fields are needed, and why each is insufficient alone is why this gate
 * has a second version.
 *
 * `outcome` alone is not enough. It is built from `isSuccess`, which query-core
 * sets the moment the cache holds an entry, before any request. With
 * `staleTime` at a minute and `refetchOnMount` at its default, an entry younger
 * than that is not refetched at all, so a reader who opens a post and clicks
 * Edit within the minute reaches an editor seeded entirely from cache with no
 * read having happened. Measured against the installed query-core: warm cache,
 * `staleTime: 60_000`, default `refetchOnMount`, and the query function is
 * called zero times while `isSuccess` is true on the first render. Cached and
 * never re-read is indistinguishable from freshly read at the point this gate
 * asks, which is how the first version of it passed review with the defect
 * still open.
 *
 * `fetchedAfterMount` alone is not enough either. Read from the installed
 * query-core, it is `dataUpdateCount > initial || errorUpdateCount > initial`,
 * so a fetch that failed sets it exactly as a fetch that succeeded does. On a
 * warm cache with a failing read it is true while the entry on screen is still
 * the old cached one.
 *
 * Together they say what is actually required: a request belonging to this
 * mount settled, and it settled successfully.
 */
export interface ReadEvidence {
  /** The outcome of the query backing the editor. */
  outcome: QueryOutcome;
  /**
   * query-core's `isFetchedAfterMount`: a fetch belonging to this mount has
   * settled. Only meaningful when the query also sets `refetchOnMount: 'always'`,
   * since otherwise `staleTime` can suppress the fetch entirely and this stays
   * false forever.
   */
  fetchedAfterMount: boolean;
}

/**
 * Whether the editor may open.
 *
 * Keeping cached content through a failed or absent request is right for a
 * reader and wrong for an author. The editor seeds its title, body, tags and
 * metadata from whatever entry it is handed, and an update broadcast carries no
 * version check, so opening on an entry that was not read during this mount
 * lets a save overwrite a newer version of the post with an older one. The
 * author is given no sign that anything went wrong, and the post they
 * overwrote is their own.
 *
 * This applies to the editor and not to the reading surfaces. Those should keep
 * showing what they have. The editor is different because it writes.
 *
 * It is a latch and not a live check on purpose. Once a read has succeeded the
 * editor is holding unsaved work, and a later background failure must not close
 * it: that would throw away everything typed since. The gate is on opening,
 * which is the moment stale content would be adopted.
 */
export function isReadConfirmed(
  { outcome, fetchedAfterMount }: ReadEvidence,
  alreadyConfirmed: boolean,
): boolean {
  return alreadyConfirmed || (fetchedAfterMount && outcome === 'content');
}
