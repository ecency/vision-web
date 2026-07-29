import { queryOptions } from "@tanstack/react-query";
import { CONFIG, QueryKeys } from "@/modules/core";
import { PostTipsResponse } from "../types/post-tip";

/**
 * Tips for a single post.
 *
 * Addressed as a GET so the response can be cached. This was a POST, which no
 * cache may store, so the same tip totals were refetched on every mount. The
 * endpoint keys off nothing but author and permlink and needs no auth, and now
 * serves a Cache-Control, so a repeat read can come from the browser instead of
 * the network.
 *
 * `staleTime` matches that endpoint's fresh window: a shorter one just makes
 * react-query ask again for something the browser would answer from cache, and
 * a longer one holds a tip total past the point the server considers it stale.
 */
export function getPostTipsQueryOptions(author: string, permlink: string, isEnabled = true) {
  return queryOptions({
    queryKey: QueryKeys.posts.tips(author, permlink),
    queryFn: async () => {
      const path = `/private-api/post-tips/${encodeURIComponent(author)}/${encodeURIComponent(permlink)}`;
      const response = await fetch(CONFIG.privateApiHost + path, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch post tips: ${response.status}`);
      }

      return response.json() as Promise<PostTipsResponse>;
    },
    enabled: !!author && !!permlink && isEnabled,
    staleTime: 60 * 1000,
  });
}
