import type { QueryOutcome } from '@/features/shared/query-outcome';

/**
 * Whether the post being edited has been read successfully in this session.
 *
 * Keeping cached content through a failed request is right for a reader and
 * wrong for an author. The editor seeds its title, body, tags and metadata from
 * whatever entry it is handed, and an update broadcast carries no version
 * check, so opening the editor on a cached entry whose re-read failed lets a
 * save overwrite a newer version of the post with an older one. The author is
 * given no sign that anything went wrong, and the post they overwrote is their
 * own.
 *
 * So the editor waits for a success, rather than for the presence of data.
 *
 * It is a latch and not a live check on purpose. Once a read has succeeded the
 * editor is holding unsaved work, and a later background failure must not close
 * it: that would throw away everything typed since. The gate is on opening,
 * which is the moment the stale content would be adopted.
 */
export function isReadConfirmed(
  outcome: QueryOutcome,
  alreadyConfirmed: boolean,
): boolean {
  return alreadyConfirmed || outcome === 'content';
}
