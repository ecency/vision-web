import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import type { Vote } from "../types";
import { callRPC } from "@/modules/core/hive-tx";

/**
 * Get a specific user's vote on a post
 * Useful when post has >1000 votes to efficiently get one user's vote
 *
 * @param username - The voter's username
 * @param author - The post author
 * @param permlink - The post permlink
 */
export function getUserPostVoteQueryOptions(
  username: string | undefined,
  author: string | undefined,
  permlink: string | undefined
) {
  return queryOptions({
    queryKey: QueryKeys.posts.userPostVote(username!, author!, permlink!),
    queryFn: async () => {
      const result = await callRPC("database_api.list_votes", {
        start: [username, author, permlink],
        limit: 1,
        order: "by_voter_comment"
      });

      // A lower-bound seek on (voter, author, permlink): for a post the user
      // did not vote on it returns the user's NEXT vote, or another voter's.
      // Only a row matching all three is this vote.
      const row = result?.votes?.[0];
      if (!row || row.voter !== username || row.author !== author || row.permlink !== permlink) {
        return null;
      }
      return row as Vote;
    },
    enabled: !!username && !!author && !!permlink,
  });
}
