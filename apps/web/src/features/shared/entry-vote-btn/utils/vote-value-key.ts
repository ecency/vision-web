/**
 * Session key part for the vote weight a user last chose on one post. Keyed by
 * author/permlink: bridge reads (v1 and v2) carry no post_id, so a key built
 * from it was "<user>-undefined" for every post.
 */
export function voteValueKey(username: string, entry: { author: string; permlink: string }): string {
  return `${username}-${entry.author}/${entry.permlink}`;
}
