import type { Entry } from '@ecency/sdk';

/**
 * The replies written directly on a post, out of a `bridge.get_discussion`
 * response.
 *
 * Worth having as its own function because the response is not a list of
 * comments: it is the whole thread keyed by author/permlink, and the root post
 * itself is one of the entries. So a post with no comments at all still comes
 * back carrying one item, and any code that treats "the response has entries"
 * as "the post has comments" reads every post as having a discussion. That
 * matters now that the count decides whether the app is allowed to say "no
 * comments yet": measured on the raw response it would never say it, and
 * measured wrongly in the other direction it would say it on a failure.
 */
export function selectTopLevelComments(
  entry: Pick<Entry, 'author' | 'permlink'>,
  discussion: Entry[],
): Entry[] {
  return discussion.filter(
    (x) =>
      x.parent_author === entry.author && x.parent_permlink === entry.permlink,
  );
}
